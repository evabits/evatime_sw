export const WEEKS_PER_MONTH = 52 / 12;

export interface ContractDates {
  startDate: string | null; // "YYYY-MM-DD"
  endDate: string | null;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

/** Contract effective on refDate ("YYYY-MM-DD"): latest start that covers the date, else null. */
export function getEffectiveContract<T extends ContractDates>(contracts: T[], refDate: string): T | null {
  const matching = contracts.filter(
    (c) => (c.startDate == null || c.startDate <= refDate) && (c.endDate == null || c.endDate >= refDate)
  );
  if (matching.length === 0) return null;
  matching.sort((a, b) => (a.startDate ?? "").localeCompare(b.startDate ?? ""));
  return matching[matching.length - 1];
}

/** Fill the blank one of monthly/hourly from the other when contractHours is set. */
export function fillSalary(input: {
  salaryMonthly: number | null;
  salaryHourly: number | null;
  contractHours: number | null;
}): { salaryMonthly: number | null; salaryHourly: number | null } {
  let { salaryMonthly, salaryHourly } = input;
  const h = input.contractHours;
  if (h != null && h > 0) {
    if (salaryMonthly != null && salaryHourly == null) {
      salaryHourly = round2(salaryMonthly / (h * WEEKS_PER_MONTH));
    } else if (salaryHourly != null && salaryMonthly == null) {
      salaryMonthly = round2(salaryHourly * h * WEEKS_PER_MONTH);
    }
  }
  return { salaryMonthly, salaryHourly };
}

/** True if two date ranges overlap; null start = -inf, null end = +inf. */
export function rangeOverlaps(
  aStart: string | null, aEnd: string | null,
  bStart: string | null, bEnd: string | null,
): boolean {
  const aS = aStart ?? "0000-01-01", aE = aEnd ?? "9999-12-31";
  const bS = bStart ?? "0000-01-01", bE = bEnd ?? "9999-12-31";
  return aS <= bE && bS <= aE;
}

/**
 * De volgende kalenderdag, in UTC gerekend.
 *
 * Uitdrukkelijk een kalenderdag en geen werkdag: een contract mag op elke dag
 * ingaan, ook op een zaterdag. Wie hier `previousWorkingDay` uit
 * working-days.ts als voorbeeld neemt, slaat per ongeluk het weekend over.
 *
 * UTC omdat de productieserver op UTC draait en de gebruikers in Amsterdam
 * zitten; `setDate()` rekent lokaal en verschuift dan een dag zonder dat er
 * iets klaagt.
 */
export function nextDay(date: string): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}
