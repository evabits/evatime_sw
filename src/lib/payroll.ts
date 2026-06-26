export type ContractType = "PERMANENT" | "FIXED_TERM" | "ZERO_HOURS";

export interface PayrollUser {
  id: string;
  name: string;
  contractType: ContractType;
  contractHours: number | null; // per week
}

export interface PayrollRow {
  userId: string;
  name: string;
  contractType: ContractType;
  contractHours: number | null;
  workedHours: number;
  wbsoHours: number;
  overtime: number | null; // null for ZERO_HOURS (by agreement)
  km: number;
}

const round1 = (n: number) => Math.round(n * 10) / 10;

/** Approximate weeks in a calendar month (daysInMonth / 7), matching /api/hours-overview. */
export function weeksInMonth(year: number, month: number): number {
  // month is 1-12; day 0 of next month = last day of this month
  const daysInMonth = new Date(year, month, 0).getDate();
  return daysInMonth / 7;
}

export function buildPayrollRows(
  users: PayrollUser[],
  workedByUser: Map<string, number>,
  wbsoByUser: Map<string, number>,
  kmByUser: Map<string, number>,
  weeks: number,
): PayrollRow[] {
  return users.map((u) => {
    const workedHours = round1(workedByUser.get(u.id) ?? 0);
    const wbsoHours = round1(wbsoByUser.get(u.id) ?? 0);
    const km = round1(kmByUser.get(u.id) ?? 0);

    let overtime: number | null = null;
    if (u.contractType !== "ZERO_HOURS" && u.contractHours != null) {
      const monthlyContract = u.contractHours * weeks;
      overtime = round1(Math.max(0, workedHours - monthlyContract));
    }

    return {
      userId: u.id,
      name: u.name,
      contractType: u.contractType,
      contractHours: u.contractHours,
      workedHours,
      wbsoHours,
      overtime,
      km,
    };
  });
}
