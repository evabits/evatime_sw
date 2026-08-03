import { describe, it, expect } from "vitest";
import { groupHourEntriesForInvoice, type HourEntryForInvoice } from "./invoice-lines";

function entry(over: Partial<HourEntryForInvoice> & { id: string }): HourEntryForInvoice {
  return {
    hours: 4,
    rateOverride: null,
    workLevel: "SENIOR",
    user: { workLevel: "SENIOR" },
    project: { id: "p1", name: "Project A", levelRates: [{ level: "SENIOR", rate: 100 }] },
    ...over,
  } as HourEntryForInvoice;
}

describe("groupHourEntriesForInvoice", () => {
  it("keeps two distinct projects with the same name and rate as two separate lines", () => {
    // Same rendered label ("Testproject"), but two different project ids —
    // must not merge into one line spanning both projects' entry ids.
    const lines = groupHourEntriesForInvoice([
      entry({ id: "t1", project: { id: "p1", name: "Testproject", levelRates: [{ level: "SENIOR", rate: 100 }] } }),
      entry({ id: "t2", project: { id: "p2", name: "Testproject", levelRates: [{ level: "SENIOR", rate: 100 }] } }),
    ]);
    expect(lines).toHaveLength(2);
    expect(lines.map((l) => l.timeEntryIds)).toEqual([["t1"], ["t2"]]);
  });

  it("keeps a single project+rate+level group's label plain, unchanged from today", () => {
    const lines = groupHourEntriesForInvoice([
      entry({ id: "t1", hours: 2 }),
      entry({ id: "t2", hours: 3 }),
    ]);
    expect(lines).toEqual([
      { description: "Project A", quantity: 5, unitPrice: 100, timeEntryIds: ["t1", "t2"] },
    ]);
  });

  it("splits two work levels sharing the same rate into two correctly labelled lines", () => {
    const lines = groupHourEntriesForInvoice([
      entry({ id: "t1", hours: 2, workLevel: "SENIOR", user: { workLevel: "SENIOR" }, project: { id: "p1", name: "Project A", levelRates: [{ level: "SENIOR", rate: 100 }, { level: "JUNIOR", rate: 100 }] } }),
      entry({ id: "t2", hours: 5, workLevel: "JUNIOR", user: { workLevel: "JUNIOR" }, project: { id: "p1", name: "Project A", levelRates: [{ level: "SENIOR", rate: 100 }, { level: "JUNIOR", rate: 100 }] } }),
    ]);
    expect(lines).toHaveLength(2);
    const senior = lines.find((l) => l.timeEntryIds.includes("t1"))!;
    const junior = lines.find((l) => l.timeEntryIds.includes("t2"))!;
    expect(senior.description).toBe("Project A (Senior Engineer)");
    expect(senior.quantity).toBe(2);
    expect(junior.description).toBe("Project A (Junior Engineer)");
    expect(junior.quantity).toBe(5);
    // money still correct: same rate, quantities don't cross-contaminate
    expect(senior.unitPrice).toBe(100);
    expect(junior.unitPrice).toBe(100);
  });

  it("splits one project into multiple rate lines and adds the level to the label, as before", () => {
    const lines = groupHourEntriesForInvoice([
      entry({ id: "t1", hours: 2, rateOverride: 120 }),
      entry({ id: "t2", hours: 3 }),
    ]);
    expect(lines).toHaveLength(2);
    expect(lines.every((l) => l.description === "Project A (Senior Engineer)")).toBe(true);
  });

  it("drops entries without a resolvable rate", () => {
    const lines = groupHourEntriesForInvoice([
      entry({ id: "t1", workLevel: null, user: { workLevel: null } }),
    ]);
    expect(lines).toEqual([]);
  });
});
