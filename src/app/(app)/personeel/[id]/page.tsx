import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { redirect, notFound } from "next/navigation";
import { serializeContract, contractSelect } from "@/app/api/contracts/route";
import { ContractsClient } from "@/components/personeel/contracts-client";
import { reviewSelect, serializeReview } from "@/app/api/reviews/route";
import { ReviewsAdminClient } from "@/components/personeel/reviews-admin-client";
import { CommuteTemplateClient } from "@/components/personeel/commute-template-client";
import { WorkScheduleClient } from "@/components/personeel/work-schedule-client";
import { OvertimeClient } from "@/components/personeel/overtime-client";
import { toWeekSchedule } from "@/lib/work-schedule";
import { getEffectiveContract } from "@/lib/contracts";
import { monthsToSettle, bucketHoursByMonth, overtimeLedger, type MonthKey } from "@/lib/overtime";

/**
 * De laatste dag van een kalendermaand, als "YYYY-MM-DD".
 *
 * Zelfde regel als /api/payroll: dag 0 van de volgende maand is de laatste
 * dag van deze maand.
 */
function monthEnd(key: MonthKey): string {
  const [jaar, maand] = key.split("-").map(Number);
  return new Date(Date.UTC(jaar, maand, 0)).toISOString().slice(0, 10);
}

/**
 * Contracttarget voor een maand, of null zonder target.
 *
 * Het urenveld alléén volstaat niet: een nul-urencontract mag net als in de
 * loonverwerking (payroll.ts) nooit een target opleveren, ook niet als er
 * per ongeluk een aantal uren op zo'n contract staat ingevuld — het
 * formulier laat dat toe, ook al hoort het er niet.
 */
function contractTarget(contracten: ReturnType<typeof serializeContract>[], refDate: string): number | null {
  const c = getEffectiveContract(contracten, refDate);
  return c && c.contractType !== "ZERO_HOURS" ? c.contractHours ?? null : null;
}

export default async function EmployeePage({ params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if ((session?.user as any)?.role !== "ADMIN") redirect("/");
  const { id } = await params;

  const user = await prisma.user.findUnique({
    where: { id },
    select: {
      id: true, name: true, email: true, role: true, weeklyHours: true, workSchedule: true,
      overtimeOpeningDate: true, overtimeOpeningHours: true,
      contracts: { orderBy: [{ startDate: "desc" }, { createdAt: "desc" }], select: contractSelect },
      reviews: { orderBy: { createdAt: "desc" }, select: reviewSelect },
      kmTemplates: {
        where: { managedByAdmin: true },
        orderBy: { name: "asc" },
        include: {
          project: { select: { id: true, name: true, customer: { select: { name: true } } } },
        },
      },
      overtimeAdjustments: { orderBy: { date: "asc" }, select: { id: true, date: true, hours: true, reason: true } },
    },
  });
  if (!user) notFound();

  const contracten = user.contracts.map(serializeContract);

  // Zonder peildatum is er niets te rekenen: geen urenregels ophalen, geen
  // saldo — overtimeLedger geeft precies deze lege vorm terug voor een lege
  // peildatum, maar dan zonder de db-round-trip die er hier aan voorafgaat.
  let ledger: ReturnType<typeof overtimeLedger> = { lines: [], saldo: 0, lopend: null };
  if (user.overtimeOpeningDate) {
    const peildatum = user.overtimeOpeningDate.toISOString().slice(0, 10);
    const vandaag = new Date();

    // Geen filter op absenceRequestId: verlof telt hier wél mee (in
    // tegenstelling tot de loonverwerking, waar het om geld gaat).
    const entries = await prisma.timeEntry.findMany({
      where: { userId: id, date: { gte: user.overtimeOpeningDate } },
      select: { date: true, hours: true },
    });

    const months = monthsToSettle(peildatum, vandaag);
    // bucketHoursByMonth past zelf Number() toe op elk item, maar Prisma's
    // Decimal-type staat niet in de signatuur die het accepteert.
    const hoursByMonth = bucketHoursByMonth(entries.map((e) => ({ date: e.date, hours: Number(e.hours) })));
    const contractHoursByMonth: Record<MonthKey, number | null> = {};
    for (const key of months) {
      contractHoursByMonth[key] = contractTarget(contracten, monthEnd(key));
    }
    const lopendeKey: MonthKey = `${vandaag.getFullYear()}-${String(vandaag.getMonth() + 1).padStart(2, "0")}`;

    ledger = overtimeLedger({
      openingDate: peildatum,
      openingHours: user.overtimeOpeningHours != null ? Number(user.overtimeOpeningHours) : 0,
      months,
      hoursByMonth,
      contractHoursByMonth,
      adjustments: user.overtimeAdjustments.map((a) => ({
        id: a.id, date: a.date.toISOString().slice(0, 10), hours: Number(a.hours), reason: a.reason,
      })),
      vandaag,
      lopendeUren: hoursByMonth[lopendeKey] ?? 0,
      // Zelfde regel toegepast op de lopende maand: het contract dat aan het
      // eind ván die maand geldt, ook al is die maand nog niet voorbij.
      lopendContract: contractTarget(contracten, monthEnd(lopendeKey)),
    });
  }

  const projects = await prisma.project.findMany({
    where: { archivedAt: null, members: { some: { userId: id } } },
    orderBy: { name: "asc" },
    select: { id: true, name: true, customer: { select: { name: true } } },
  });

  return (
    <div className="space-y-8">
      <ContractsClient
        user={{ id: user.id, name: user.name, email: user.email, role: user.role }}
        initialContracts={contracten}
      />
      <OvertimeClient
        user={{
          id: user.id, name: user.name, email: user.email, role: user.role,
          overtimeOpeningDate: user.overtimeOpeningDate ? user.overtimeOpeningDate.toISOString().slice(0, 10) : null,
          overtimeOpeningHours: user.overtimeOpeningHours != null ? Number(user.overtimeOpeningHours) : null,
        }}
        lines={ledger.lines}
        saldo={ledger.saldo}
        lopend={ledger.lopend}
      />
      <ReviewsAdminClient userId={user.id} initialReviews={user.reviews.map(serializeReview)} />
      <CommuteTemplateClient
        employeeId={user.id}
        initialTemplates={user.kmTemplates.map((t) => ({ ...t, km: Number(t.km) }))}
        projects={projects}
      />
      <WorkScheduleClient
        employeeId={user.id}
        initialSchedule={toWeekSchedule(user.workSchedule)}
        weeklyHours={user.weeklyHours === null ? null : Number(user.weeklyHours)}
      />
    </div>
  );
}
