import { describe, it, expect } from "vitest";
import { groupHourEntriesForInvoice, type HourEntryForInvoice, expenseInvoiceLines } from "./invoice-lines";

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

import { groupKmEntriesForInvoice, type KmEntryForInvoice } from "./invoice-lines";

function kmEntry(over: Partial<KmEntryForInvoice> & { id: string }): KmEntryForInvoice {
  return {
    km: 10,
    rateOverride: null,
    project: { defaultKmRate: 0.23 },
    ...over,
  } as KmEntryForInvoice;
}

describe("groupKmEntriesForInvoice", () => {
  it("keeps one line when every entry shares a rate", () => {
    const lines = groupKmEntriesForInvoice([kmEntry({ id: "k1" }), kmEntry({ id: "k2", km: 15 })]);
    expect(lines).toEqual([
      { description: "Reiskosten", quantity: 25, unitPrice: 0.23, kmEntryIds: ["k1", "k2"] },
    ]);
  });

  it("splits two rates into two lines instead of billing both at the first", () => {
    // De fout die dit voorkomt: alles ging tegen het tarief van de eerste
    // regel, dus 20 km à 0,40 werd stilzwijgend 20 km à 0,23.
    const lines = groupKmEntriesForInvoice([
      kmEntry({ id: "k1", km: 10 }),
      kmEntry({ id: "k2", km: 20, project: { defaultKmRate: 0.4 } }),
    ]);
    expect(lines).toEqual([
      { description: "Reiskosten", quantity: 10, unitPrice: 0.23, kmEntryIds: ["k1"] },
      { description: "Reiskosten", quantity: 20, unitPrice: 0.4, kmEntryIds: ["k2"] },
    ]);
  });

  it("lets a rate override beat the project rate", () => {
    const lines = groupKmEntriesForInvoice([
      kmEntry({ id: "k1", rateOverride: 0.5 }),
      kmEntry({ id: "k2" }),
    ]);
    expect(lines.map((l) => [l.unitPrice, l.kmEntryIds])).toEqual([
      [0.5, ["k1"]],
      [0.23, ["k2"]],
    ]);
  });

  it("drops an entry without any rate rather than billing it at nought", () => {
    const lines = groupKmEntriesForInvoice([
      kmEntry({ id: "k1" }),
      kmEntry({ id: "geen", project: { defaultKmRate: null } }),
    ]);
    expect(lines).toEqual([
      { description: "Reiskosten", quantity: 10, unitPrice: 0.23, kmEntryIds: ["k1"] },
    ]);
  });

  it("drops an entry whose rate is nought", () => {
    // Nul per kilometer is geen factureerbaar tarief, en een regel van nul
    // euro laat de invoerkeuring van de factuurroute struikelen.
    expect(groupKmEntriesForInvoice([kmEntry({ id: "k1", rateOverride: 0 })])).toEqual([]);
  });

  it("returns nothing for an empty selection", () => {
    expect(groupKmEntriesForInvoice([])).toEqual([]);
  });

  it("reads the Decimal strings Prisma hands back", () => {
    const lines = groupKmEntriesForInvoice([
      kmEntry({ id: "k1", km: "12.5", project: { defaultKmRate: "0.23" } }),
    ]);
    expect(lines).toEqual([
      { description: "Reiskosten", quantity: 12.5, unitPrice: 0.23, kmEntryIds: ["k1"] },
    ]);
  });
});

describe("expenseInvoiceLines", () => {
  const uitgave = {
    id: "e1",
    amount: "107.27",
    description: "Late levering SAMTEC connectors",
    category: { name: "Materiaal" },
  };

  it("makes one line per expense with its own description", () => {
    expect(expenseInvoiceLines([uitgave])).toEqual([
      {
        description: "Late levering SAMTEC connectors",
        quantity: 1,
        unitPrice: 107.27,
        expenseIds: ["e1"],
      },
    ]);
  });

  it("keeps two expenses apart even when they cost the same", () => {
    // Groeperen zou hier de omschrijvingen opeten, en die zijn juist de reden
    // dat een uitgave op de factuur staat.
    const regels = expenseInvoiceLines([uitgave, { ...uitgave, id: "e2", description: "Spoedvracht" }]);
    expect(regels.map((r) => r.description)).toEqual(["Late levering SAMTEC connectors", "Spoedvracht"]);
    expect(regels.map((r) => r.expenseIds)).toEqual([["e1"], ["e2"]]);
  });

  it("falls back to the category when the expense has no description", () => {
    expect(expenseInvoiceLines([{ ...uitgave, description: null }])[0].description).toBe("Materiaal");
    expect(expenseInvoiceLines([{ ...uitgave, description: "   " }])[0].description).toBe("Materiaal");
  });

  it("falls back to a plain word when there is no category either", () => {
    expect(expenseInvoiceLines([{ id: "e1", amount: 50 }])[0].description).toBe("Uitgave");
  });

  it("leaves out an expense of nought, which cannot be invoiced", () => {
    expect(expenseInvoiceLines([{ ...uitgave, amount: 0 }])).toEqual([]);
  });

  it("gives no lines for an empty list", () => {
    expect(expenseInvoiceLines([])).toEqual([]);
  });
});
