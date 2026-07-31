import { describe, it, expect } from "vitest";
import { timeRate, kmRate, reportTotals, groupByEmployee } from "./report-totals";

const data = {
  timeEntries: [
    { hours: 2, rateOverride: null, activityType: { defaultRate: 100 }, project: { defaultHourlyRate: 80 }, user: { id: "u1", name: "Anne" } },
    { hours: 3, rateOverride: 50, activityType: { defaultRate: 100 }, project: { defaultHourlyRate: 80 }, user: { id: "u2", name: "Bram" } },
  ],
  kmEntries: [
    { km: 10, rateOverride: null, project: { defaultKmRate: 0.23 }, user: { id: "u1", name: "Anne" } },
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
  it("sums hours, km and expense amounts", () => {
    const t = reportTotals(data);
    expect(t.hours).toBe(5);
    expect(t.km).toBe(10);
    expect(t.expenses).toBe(100);
  });

  it("counts only billable expenses towards revenue", () => {
    // 2*100 + 3*50 + 10*0.23 + 40 = 392.3
    expect(reportTotals(data).revenue).toBeCloseTo(392.3, 2);
  });
});

describe("groupByEmployee", () => {
  const users = [{ id: "u1", weeklyHours: 40 }, { id: "u2", weeklyHours: null }];

  it("groups every kind under its employee", () => {
    const rows = groupByEmployee(data, users);
    expect(rows.map((r) => r.name)).toEqual(["Anne", "Bram"]);
    expect(rows[0]).toMatchObject({ hours: 2, km: 10, expenses: 40, weeklyHours: 40 });
    expect(rows[1]).toMatchObject({ hours: 3, km: 0, expenses: 60, weeklyHours: null });
    // Anne: 2*100 (time) + 10*0.23 (km) + 40 (billable expense) = 242.3
    expect(rows[0].revenue).toBeCloseTo(242.3, 2);
    // Bram: 3*50 (time); his 60 expense is not billable so it must not count = 150
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
