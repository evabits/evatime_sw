import { describe, it, expect } from "vitest";
import { timeRate, kmRate, reportTotals, groupByEmployee } from "./report-totals";

const seniorProject = { levelRates: [{ level: "SENIOR", rate: 100 }], customer: { levelRates: [{ level: "SENIOR", rate: 80 }] } };

const data = {
  timeEntries: [
    { hours: 2, rateOverride: null, workLevel: "SENIOR", project: { ...seniorProject, billable: true }, user: { id: "u1", name: "Anne", workLevel: "SENIOR" } },
    { hours: 3, rateOverride: 50, workLevel: "JUNIOR", project: { levelRates: [], customer: { levelRates: [] }, billable: true }, user: { id: "u2", name: "Bram", workLevel: "JUNIOR" } },
    { hours: 4, rateOverride: null, workLevel: "SENIOR", project: { ...seniorProject, billable: false }, user: { id: "u1", name: "Anne", workLevel: "SENIOR" } },
  ],
  kmEntries: [
    { km: 10, rateOverride: null, project: { defaultKmRate: 0.23, billable: true }, user: { id: "u1", name: "Anne" } },
    { km: 20, rateOverride: null, project: { defaultKmRate: 0.23, billable: false }, user: { id: "u2", name: "Bram" } },
  ],
  expenses: [
    { amount: 40, project: { billable: true }, user: { id: "u1", name: "Anne" } },
    { amount: 60, project: { billable: false }, user: { id: "u2", name: "Bram" } },
  ],
};

describe("timeRate", () => {
  it("prefers the override", () => {
    expect(timeRate({ rateOverride: 50, workLevel: "SENIOR", project: seniorProject })).toBe(50);
  });

  it("falls back to the project rate, then the customer rate", () => {
    expect(timeRate({ rateOverride: null, workLevel: "SENIOR", project: seniorProject })).toBe(100);
    expect(timeRate({ rateOverride: null, workLevel: "SENIOR", project: { levelRates: [], customer: { levelRates: [{ level: "SENIOR", rate: 80 }] } } })).toBe(80);
  });

  it("returns null, not zero, when no rate can be determined", () => {
    expect(timeRate({ rateOverride: null, workLevel: null, project: null })).toBeNull();
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
    const orphan = { timeEntries: [{ hours: 1, rateOverride: null, workLevel: null, project: null, user: null }], kmEntries: [], expenses: [] };
    expect(groupByEmployee(orphan, users)[0]).toMatchObject({ userId: "unknown", name: "Onbekend" });
  });
});

describe("entries without a determinable rate", () => {
  const data = {
    timeEntries: [
      {
        hours: 5, rateOverride: null, workLevel: "SENIOR",
        user: { id: "u1", name: "Anne", workLevel: "SENIOR" },
        project: { levelRates: [], customer: { levelRates: [] }, billable: true },
      },
    ],
    kmEntries: [],
    expenses: [],
  };

  it("counts the hours but not any revenue", () => {
    const t = reportTotals(data);
    expect(t.hours).toBe(5);
    expect(t.revenue).toBe(0);
  });

  it("counts the hours but not any revenue per employee", () => {
    const rows = groupByEmployee(data, [{ id: "u1", weeklyHours: 40 }]);
    expect(rows[0].hours).toBe(5);
    expect(rows[0].revenue).toBe(0);
  });

  it("reports the rate as null rather than zero", () => {
    expect(timeRate(data.timeEntries[0])).toBeNull();
  });
});

describe("billability now comes from the project", () => {
  const base = {
    hours: 4, rateOverride: 100, workLevel: "SENIOR",
    user: { id: "u1", name: "Anne", workLevel: "SENIOR" },
  };

  it("counts revenue only when the project is billable", () => {
    const t = reportTotals({
      timeEntries: [{ ...base, project: { billable: true, levelRates: [], customer: null } }],
      kmEntries: [], expenses: [],
    });
    expect(t.hours).toBe(4);
    expect(t.revenue).toBe(400);
  });

  it("counts the hours but no revenue for a non-billable project", () => {
    const t = reportTotals({
      timeEntries: [{ ...base, project: { billable: false, levelRates: [], customer: null } }],
      kmEntries: [], expenses: [],
    });
    expect(t.hours).toBe(4);
    expect(t.revenue).toBe(0);
  });

  it("counts no revenue when the project was not loaded at all", () => {
    // Vergeten include: hours tellen wel, geld niet. Zou dit als billable
    // gelden, dan verscheen er omzet die er niet is.
    const t = reportTotals({ timeEntries: [{ ...base }], kmEntries: [], expenses: [] });
    expect(t.hours).toBe(4);
    expect(t.revenue).toBe(0);
  });
});
