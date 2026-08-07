import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { z } from "zod";
import { handleError } from "@/lib/api";
import { canLeadStandup } from "@/lib/roles";
import { previousWorkingDay } from "@/lib/working-days";
import { scheduledHoursOn, toWeekSchedule } from "@/lib/work-schedule";

const ABSENCE_LABELS: Record<string, string> = {
  VACATION: "vakantie",
  SICK: "ziek",
  PARENTAL_LEAVE: "ouderschapsverlof",
  SPECIAL_LEAVE: "bijzonder verlof",
  UNPAID_LEAVE: "onbetaald verlof",
};

type StandupEntry = {
  hours: number;
  project: string;
  customer: string | null;
  description: string | null;
};

const querySchema = z.object({ date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/) });

export async function GET(req: Request) {
  try {
    const session = await auth();
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const role = (session.user as any)?.role ?? "EMPLOYEE";
    if (!canLeadStandup(role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const { searchParams } = new URL(req.url);
    const { date } = querySchema.parse({ date: searchParams.get("date") });

    // Al het datumrekenwerk gebeurt hier, niet in de client: zo is er één plek
    // waar previousWorkingDay wordt toegepast en één tijdzone (UTC) in het spel.
    const vorigeWerkdag = previousWorkingDay(date);
    const dag = new Date(`${vorigeWerkdag}T00:00:00Z`);
    const standupDatum = new Date(`${date}T00:00:00Z`);

    const [users, entries, absences, huidige, vorige] = await Promise.all([
      prisma.user.findMany({
        where: { archivedAt: null },
        orderBy: { name: "asc" },
        select: { id: true, name: true, workSchedule: true },
      }),
      prisma.timeEntry.findMany({
        where: { date: dag },
        orderBy: { createdAt: "asc" },
        select: {
          userId: true,
          hours: true,
          description: true,
          project: { select: { name: true, customer: { select: { name: true } } } },
        },
      }),
      prisma.absenceRequest.findMany({
        where: { status: "APPROVED", startDate: { lte: dag }, endDate: { gte: dag } },
        select: { userId: true, type: true },
      }),
      prisma.standup.findUnique({
        where: { date: standupDatum },
        select: { notes: { select: { userId: true, note: true } } },
      }),
      // De vorige standup is de meest recente vóór deze datum, hoe lang geleden
      // ook. Zou dit "gisteren" zijn, dan wist een overgeslagen dag stilzwijgend
      // de context waar de bijeenkomst juist op voortbouwt.
      prisma.standup.findFirst({
        where: { date: { lt: standupDatum } },
        orderBy: { date: "desc" },
        select: { date: true, notes: { select: { userId: true, note: true } } },
      }),
    ]);

    const urenPer = new Map<string, StandupEntry[]>();
    for (const e of entries) {
      const regels = urenPer.get(e.userId) ?? [];
      regels.push({
        hours: Number(e.hours),
        project: e.project.name,
        customer: e.project.customer?.name ?? null,
        description: e.description,
      });
      urenPer.set(e.userId, regels);
    }

    // Alleen voor wie op de getoonde dag niets boekte: bij de rest is deze
    // regel op het scherm toch ruis, en dan hoeft de database er ook niet naar
    // te zoeken.
    const zonderUren = users.filter((u) => !urenPer.has(u.id)).map((u) => u.id);

    // Twee query's, geen N+1: eerst per persoon de laatste dag mét uren vóór de
    // getoonde dag, daarna de regels van precies die dagen. Onbegrensd terug in
    // de tijd — na drie weken vakantie is drie weken geleden het juiste antwoord
    // op "waar was je mee bezig".
    const laatsteDagen = zonderUren.length
      ? await prisma.timeEntry.groupBy({
          by: ["userId"],
          where: { userId: { in: zonderUren }, date: { lt: dag } },
          _max: { date: true },
        })
      : [];

    const laatsteRegels = laatsteDagen.length
      ? await prisma.timeEntry.findMany({
          where: {
            OR: laatsteDagen.map((g) => ({ userId: g.userId, date: g._max.date! })),
          },
          orderBy: { createdAt: "asc" },
          select: {
            userId: true,
            hours: true,
            description: true,
            project: { select: { name: true, customer: { select: { name: true } } } },
          },
        })
      : [];

    const laatstePer = new Map(
      laatsteDagen.map((g) => [
        g.userId,
        { date: g._max.date!.toISOString().slice(0, 10), entries: [] as StandupEntry[] },
      ]),
    );
    for (const e of laatsteRegels) {
      laatstePer.get(e.userId)?.entries.push({
        hours: Number(e.hours),
        project: e.project.name,
        customer: e.project.customer?.name ?? null,
        description: e.description,
      });
    }

    const afwezigPer = new Map(absences.map((a) => [a.userId, ABSENCE_LABELS[a.type] ?? a.type]));
    const huidigePer = new Map((huidige?.notes ?? []).map((n) => [n.userId, n.note]));
    const vorigePer = new Map((vorige?.notes ?? []).map((n) => [n.userId, n.note]));

    return NextResponse.json({
      date,
      previousWorkingDay: vorigeWerkdag,
      previousStandupDate: vorige ? vorige.date.toISOString().slice(0, 10) : null,
      members: users.map((u) => {
        // null betekent "geen rooster" en niet "nul uur": het scherm mag dan
        // niets zeggen over werkdagen.
        const rooster = toWeekSchedule(u.workSchedule);
        return {
          userId: u.id,
          userName: u.name,
          entries: urenPer.get(u.id) ?? [],
          lastWorked: laatstePer.get(u.id) ?? null,
          absence: afwezigPer.get(u.id) ?? null,
          scheduledHours: rooster ? scheduledHoursOn(rooster, vorigeWerkdag) : null,
          previousNote: vorigePer.get(u.id) ?? null,
          note: huidigePer.get(u.id) ?? "",
        };
      }),
    });
  } catch (e) { return handleError(e); }
}
