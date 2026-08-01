import { describe, it, expect } from "vitest";
import { timeRate, kmRate, reportTotals, groupByEmployee } from "./report-totals";

const data = {
  timeEntries: [
    { hours: 2, billable: true, rateOverride: null, activityType: { defaultRate: 100 }, project: { defaultHourlyRate: 80 }, user: { id: "u1", name: "Anne" } },
    { hours: 3, billable: true, rateOverride: 50, activityType: { defaultRate: 100 }, project: { defaultHourlyRate: 80 }, user: { id: "u2", name: "Bram" } },
    { hours: 4, billable: false, rateOverride: null, activityType: { defaultRate: 100 }, project: { defaultHourlyRate: 80 }, user: { id: "u1", name: "Anne" } },
  ],
  kmEntries: [
    { km: 10, billable: true, rateOverride: null, project: { defaultKmRate: 0.23 }, user: { id: "u1", name: "Anne" } },
    { km: 20, billable: false, rateOverride: null, project: { defaultKmRate: 0.23 }, user: { id: "u2", name: "Bram" } },
  ],
  expenses: [
    { amount: 40, billable: true, user: { id: "u1", name: "Anne" } },
    { amount: 60, billable: false, user: { id: "u2", name: "Bram" } },
  ],
};

describe("timeRate", () => {
  it("prefers the override", () => {
    expect(timeRate({ rateOverride: 50, activityType: { defaultRate: 100 }, project: { defaultHourlyRate: 80 } })).toBe(50);
  });

  it("falls back to the activity rate, then the project rate", () => {
    expect(timeRate({ rateOverride: null, activityType: { defaultRate: 100 }, project: { defaultHourlyRate: 80 } })).toBe(100);
    expect(timeRate({ rateOverride: null, activityType: null, project: { defaultHourlyRate: 80 } })).toBe(80);
    expect(timeRate({ rateOverride: null, activityType: null, project: null })).toBe(0);
  });
});

describe("kmRate", () => {
  it("prefers the override, then the project rate", () => {
    expect(kmRate({ rateOverride: 0.5, project: { defaultKmRate: 0.23 } })).toBe(0.5);
    expect(kmRate({ rateOverride: null, project: { defaultKmRate: 0.23 } })).toBe(0.23);
    expect(kmRate({ rateOverride: null, project: null })).toBe(0);
  });
});

describe("reportTotals", () => {
  it("sums hours, km and expense amounts regardless of billable", () => {
    // hours: 2 + 3 + 4 (incl. the non-billable one) = 9
    // km: 10 + 20 (incl. the non-billable one) = 30
    const t = reportTotals(data);
    expect(t.hours).toBe(9);
    expect(t.km).toBe(30);
    expect(t.expenses).toBe(100);
  });

  it("counts only billable time, km and expenses towards revenue", () => {
    // billable only: Anne's time (2*100) + Bram's time (3*50) + Anne's km (10*0.23) + Anne's expense (40)
    // = 200 + 150 + 2.3 + 40 = 392.3
    // excluded: Anne's non-billable time (4*100=400), Bram's non-billable km (20*0.23=4.6),
    // Bram's non-billable expense (60) — none of that may show up in the total.
    expect(reportTotals(data).revenue).toBeCloseTo(392.3, 2);
  });
});

describe("groupByEmployee", () => {
  const users = [{ id: "u1", weeklyHours: 40 }, { id: "u2", weeklyHours: null }];

  it("groups every kind under its employee", () => {
    const rows = groupByEmployee(data, users);
    expect(rows.map((r) => r.name)).toEqual(["Anne", "Bram"]);
    // Anne: 2h billable + 4h non-billable = 6h; 10 billable km
    expect(rows[0]).toMatchObject({ hours: 6, km: 10, expenses: 40, weeklyHours: 40 });
    // Bram: 3h billable time; 20 non-billable km
    expect(rows[1]).toMatchObject({ hours: 3, km: 20, expenses: 60, weeklyHours: null });
    // Anne: 2*100 (billable time) + 10*0.23 (billable km) + 40 (billable expense) = 242.3
    // her 4h non-billable time (4*100=400) must not count
    expect(rows[0].revenue).toBeCloseTo(242.3, 2);
    // Bram: 3*50 (billable time) = 150; his 20 non-billable km (20*0.23=4.6) and his
    // 60 non-billable expense must not count
    expect(rows[1].revenue).toBe(150);
  });

  it("sorts by name", () => {
    const reversed = { ...data, timeEntries: [...data.timeEntries].reverse() };
    expect(groupByEmployee(reversed, users).map((r) => r.name)).toEqual(["Anne", "Bram"]);
  });

  it("buckets entries without a user under Onbekend", () => {
    const orphan = { timeEntries: [{ hours: 1, rateOverride: null, activityType: null, project: null, user: null }], kmEntries: [], expenses: [] };
    expect(groupByEmployee(orphan, users)[0]).toMatchObject({ userId: "unknown", name: "Onbekend" });
  });
});
