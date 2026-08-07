import { prisma } from "./prisma";
import { scheduledHoursOn, toWeekSchedule } from "./work-schedule";

/**
 * Wie er op een dag afwezig is, met de soort erbij.
 *
 * Een aanvraag mét weekpatroon geldt alleen op de dagen waarop dat patroon uren
 * staan — een ouderschapsverlof van "elke vrijdag" over drie maanden maakt
 * iemand niet drie maanden lang afwezig. Zonder patroon geldt de hele periode,
 * zoals het altijd al ging.
 *
 * Gedeeld door het standupscherm en de dashboardteller: zouden die dit ieder
 * apart bepalen, dan lopen ze vroeg of laat uiteen over wie er verlof heeft, en
 * dan spreken de kaart en het scherm elkaar tegen over dezelfde dag.
 *
 * De uitkomst is het ruwe `type`; het vertalen naar een label blijft bij de
 * aanroeper die het op het scherm zet.
 */
export async function absenceTypesOn(date: string): Promise<Map<string, string>> {
  const dag = new Date(`${date}T00:00:00Z`);
  const aanvragen = await prisma.absenceRequest.findMany({
    where: { status: "APPROVED", startDate: { lte: dag }, endDate: { gte: dag } },
    select: { userId: true, type: true, pattern: true },
  });

  const per = new Map<string, string>();
  for (const a of aanvragen) {
    const patroon = toWeekSchedule(a.pattern);
    if (patroon && scheduledHoursOn(patroon, date) <= 0) continue;
    per.set(a.userId, a.type);
  }
  return per;
}
