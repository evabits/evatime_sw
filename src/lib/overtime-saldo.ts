import { prisma } from "./prisma";
import { getEffectiveContract } from "./contracts";
import { serializeContract } from "@/app/api/contracts/route";
import { monthsToSettle, bucketHoursByMonth, overtimeLedger, type MonthKey } from "./overtime";

/**
 * Het urensaldo van één medewerker, met de database erbij. Op één plek, zodat
 * de personeelspagina en de loonverwerking hetzelfde getal tonen.
 */

/** De laatste dag van een kalendermaand, als "YYYY-MM-DD". */
function monthEnd(key: MonthKey): string {
  const [jaar, maand] = key.split("-").map(Number);
  return new Date(Date.UTC(jaar, maand, 0)).toISOString().slice(0, 10);
}

/**
 * Contracttarget voor een maand, of null zonder target. Een nul-urencontract
 * levert nooit een target op, ook niet als er per ongeluk uren op staan.
 */
function contractTarget(contracten: ReturnType<typeof serializeContract>[], refDate: string): number | null {
  const c = getEffectiveContract(contracten, refDate);
  return c && c.contractType !== "ZERO_HOURS" ? c.contractHours ?? null : null;
}

export type SaldoUser = {
  id: string;
  overtimeOpeningDate: Date | null;
  overtimeOpeningHours: unknown;
  contracts: ReturnType<typeof serializeContract>[];
  overtimeAdjustments: { id: string; date: Date; hours: unknown; reason: string }[];
};

/**
 * `vandaag` bepaalt welke maanden af zijn (de maand ván vandaag telt niet mee).
 * `mutatiesTot` laat mutaties ná die datum weg — de loonverwerking kijkt terug
 * naar een eerdere maand. Zonder telt elke mutatie.
 */
export async function overtimeLedgerFor(user: SaldoUser, vandaag = new Date(), mutatiesTot?: string) {
  if (!user.overtimeOpeningDate) return overtimeLedger({
    openingDate: null, openingHours: 0, months: [], hoursByMonth: {}, contractHoursByMonth: {},
    adjustments: [], vandaag, lopendeUren: 0, lopendContract: null,
  });
  const peildatum = user.overtimeOpeningDate.toISOString().slice(0, 10);

  // Geen filter op absenceRequestId: verlof telt hier wél mee (in
  // tegenstelling tot de maandkolom van de loonverwerking, waar het om geld gaat).
  const entries = await prisma.timeEntry.findMany({
    where: { userId: user.id, date: { gte: user.overtimeOpeningDate } },
    select: { date: true, hours: true },
  });

  const months = monthsToSettle(peildatum, vandaag);
  const hoursByMonth = bucketHoursByMonth(entries.map((e) => ({ date: e.date, hours: Number(e.hours) })));
  const contractHoursByMonth: Record<MonthKey, number | null> = {};
  for (const key of months) contractHoursByMonth[key] = contractTarget(user.contracts, monthEnd(key));
  const lopendeKey: MonthKey = `${vandaag.getFullYear()}-${String(vandaag.getMonth() + 1).padStart(2, "0")}`;

  return overtimeLedger({
    openingDate: peildatum,
    openingHours: user.overtimeOpeningHours != null ? Number(user.overtimeOpeningHours) : 0,
    months,
    hoursByMonth,
    contractHoursByMonth,
    adjustments: user.overtimeAdjustments
      .map((a) => ({ id: a.id, date: a.date.toISOString().slice(0, 10), hours: Number(a.hours), reason: a.reason }))
      .filter((a) => !mutatiesTot || a.date <= mutatiesTot),
    vandaag,
    lopendeUren: hoursByMonth[lopendeKey] ?? 0,
    // Het contract dat aan het eind ván de lopende maand geldt.
    lopendContract: contractTarget(user.contracts, monthEnd(lopendeKey)),
  });
}
