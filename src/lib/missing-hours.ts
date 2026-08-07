import { prisma } from "./prisma";
import { absenceTypesOn } from "./absence-days";
import { missingHours, scheduledHoursOn, toWeekSchedule } from "./work-schedule";

/**
 * Hoeveel medewerkers er op een dag uren missen.
 *
 * Staat los van de standup-API omdat het dashboard alleen het getal nodig heeft
 * en niet de hele dagopbouw per persoon. De beslissing zelf komt uit dezelfde
 * `missingHours`, zodat de kaart en het scherm het niet oneens kunnen worden
 * over wie er tekortkomt.
 *
 * Wie geen weekrooster heeft valt er vanzelf uit: `toWeekSchedule` geeft dan
 * null en `missingHours` geeft nul. Er wordt daarom niet op gefilterd in de
 * query — dat zou dezelfde regel op twee plekken zetten.
 */
export async function countMissingHours(date: string): Promise<number> {
  const dag = new Date(`${date}T00:00:00Z`);

  const [users, geboekt, afwezig] = await Promise.all([
    prisma.user.findMany({
      where: { archivedAt: null },
      select: { id: true, workSchedule: true },
    }),
    prisma.timeEntry.groupBy({
      by: ["userId"],
      where: { date: dag },
      _sum: { hours: true },
    }),
    absenceTypesOn(date),
  ]);

  const urenPer = new Map(geboekt.map((g) => [g.userId, Number(g._sum.hours ?? 0)]));

  return users.filter((u) => {
    const rooster = toWeekSchedule(u.workSchedule);
    const gepland = rooster ? scheduledHoursOn(rooster, date) : null;
    return missingHours(gepland, urenPer.get(u.id) ?? 0, afwezig.has(u.id)) > 0;
  }).length;
}
