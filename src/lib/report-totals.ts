import { resolveHourRate } from "./rates";
import { isBillable } from "./billable";

export type ReportData = {
  timeEntries: any[];
  kmEntries: any[];
  expenses: any[];
};

export type EmployeeSummary = {
  userId: string;
  name: string;
  hours: number;
  km: number;
  expenses: number;
  revenue: number;
  weeklyHours: number | null;
};

/** Uurtarief van een urenregel, of null als er geen te bepalen valt. */
export function timeRate(entry: any): number | null {
  return resolveHourRate(entry);
}

/** Kilometertarief: override, anders het projecttarief. */
export function kmRate(entry: any): number {
  return Number(entry.rateOverride ?? entry.project?.defaultKmRate ?? 0);
}

export function reportTotals(data: ReportData) {
  const hours = data.timeEntries.reduce((s, e) => s + Number(e.hours), 0);
  const km = data.kmEntries.reduce((s, e) => s + Number(e.km), 0);
  const expenses = data.expenses.reduce((s, e) => s + Number(e.amount), 0);
  const revenue =
    data.timeEntries.filter((e) => isBillable(e) === true).reduce((s, e) => {
      const rate = timeRate(e);
      return rate == null ? s : s + Number(e.hours) * rate;
    }, 0) +
    data.kmEntries.filter((e) => isBillable(e) === true).reduce((s, e) => s + Number(e.km) * kmRate(e), 0) +
    data.expenses.filter((e) => isBillable(e) === true).reduce((s, e) => s + Number(e.amount), 0);
  return { hours, km, expenses, revenue };
}

export function groupByEmployee(
  data: ReportData,
  users: { id: string; weeklyHours: number | null }[],
): EmployeeSummary[] {
  const weekly = new Map(users.map((u) => [u.id, u.weeklyHours]));
  const map = new Map<string, EmployeeSummary>();

  function bucket(user: any): EmployeeSummary {
    const id = user?.id ?? "unknown";
    if (!map.has(id)) {
      map.set(id, {
        userId: id,
        name: user?.name ?? "Onbekend",
        hours: 0, km: 0, expenses: 0, revenue: 0,
        weeklyHours: weekly.get(id) ?? null,
      });
    }
    return map.get(id)!;
  }

  for (const e of data.timeEntries) {
    const row = bucket(e.user);
    row.hours += Number(e.hours);
    const rate = timeRate(e);
    if (isBillable(e) === true && rate != null) row.revenue += Number(e.hours) * rate;
  }
  for (const e of data.kmEntries) {
    const row = bucket(e.user);
    row.km += Number(e.km);
    if (isBillable(e) === true) row.revenue += Number(e.km) * kmRate(e);
  }
  for (const e of data.expenses) {
    const row = bucket(e.user);
    row.expenses += Number(e.amount);
    if (isBillable(e) === true) row.revenue += Number(e.amount);
  }

  return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name));
}
