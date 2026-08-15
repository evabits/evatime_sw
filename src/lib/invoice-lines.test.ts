import { describe, it, expect } from "vitest";
import {
  expenseInvoiceLines,
  hourInvoiceLines,
  kmInvoiceLines,
  type HourEntryForInvoice,
} from "./invoice-lines";

function uur(over: Partial<HourEntryForInvoice> & { id: string }): HourEntryForInvoice {
  return {
    date: "2026-07-07",
    hours: 4,
    description: "Full stack productie",
    rateOverride: null,
    workLevel: "SENIOR",
    user: { name: "Merlijn Kunst", workLevel: "SENIOR" },
    project: { id: "p1", name: "ACQstacks 10x JUL26", levelRates: [{ level: "SENIOR", rate: 100 }] },
    ...over,
  } as HourEntryForInvoice;
}

describe("hourInvoiceLines", () => {
  it("makes one line per entry, naming the day, the person and the work", () => {
    expect(hourInvoiceLines([uur({ id: "t1" })])).toEqual([
      {
        description: "07-JUL-2026 — Merlijn Kunst — ACQstacks 10x JUL26 — Full stack productie",
        quantity: 4,
        unitPrice: 100,
        timeEntryIds: ["t1"],
      },
    ]);
  });

  it("keeps two identical days apart instead of adding them up", () => {
    // Precies wat groeperen weggooide: de klant wil beide dagen zien staan.
    const regels = hourInvoiceLines([uur({ id: "t1" }), uur({ id: "t2", date: "2026-07-08" })]);
    expect(regels).toHaveLength(2);
    expect(regels.map((r) => r.timeEntryIds)).toEqual([["t1"], ["t2"]]);
  });

  it("sorts by date, and by name within a day", () => {
    const regels = hourInvoiceLines([
      uur({ id: "t3", date: "2026-07-09", user: { name: "Anna", workLevel: "SENIOR" } }),
      uur({ id: "t1", date: "2026-07-07", user: { name: "Zeger", workLevel: "SENIOR" } }),
      uur({ id: "t2", date: "2026-07-07", user: { name: "Anna", workLevel: "SENIOR" } }),
    ]);
    expect(regels.map((r) => r.timeEntryIds[0])).toEqual(["t2", "t1", "t3"]);
  });

  it("leaves out an entry whose rate cannot be resolved", () => {
    // Zonder tarief weigert de factuurroute de regel; hem tegen nul euro
    // meesturen zou stilzwijgend te weinig factureren.
    const zonderTarief = uur({ id: "t1", workLevel: null, user: { name: "Merlijn Kunst", workLevel: null } });
    expect(hourInvoiceLines([zonderTarief])).toEqual([]);
  });

  it("drops the empty parts instead of leaving a dangling dash", () => {
    const kaal = uur({ id: "t1", description: "   ", project: { id: "p1", name: "ACQstacks 10x JUL26", levelRates: [{ level: "SENIOR", rate: 100 }] } });
    expect(hourInvoiceLines([kaal])[0].description).toBe("07-JUL-2026 — Merlijn Kunst — ACQstacks 10x JUL26");
  });

  it("gives no lines for an empty list", () => {
    expect(hourInvoiceLines([])).toEqual([]);
  });
});

describe("kmInvoiceLines", () => {
  const rit = {
    id: "k1",
    date: "2026-07-01",
    km: "70",
    description: "heen en terug kantoor",
    user: { name: "Merran Romp" },
    project: { name: "Intern", defaultKmRate: "0.23" },
  };

  it("makes one line per ride, built up like the hours", () => {
    expect(kmInvoiceLines([rit])).toEqual([
      {
        description: "01-JUL-2026 — Merran Romp — Intern — heen en terug kantoor",
        quantity: 70,
        unitPrice: 0.23,
        kmEntryIds: ["k1"],
      },
    ]);
  });

  it("keeps two rides apart even when they are the same trip", () => {
    const regels = kmInvoiceLines([rit, { ...rit, id: "k2", date: "2026-07-03" }]);
    expect(regels.map((r) => r.kmEntryIds)).toEqual([["k1"], ["k2"]]);
  });

  it("takes a rate set on the ride itself over the project's", () => {
    expect(kmInvoiceLines([{ ...rit, rateOverride: "0.30" }])[0].unitPrice).toBe(0.3);
  });

  it("leaves out a ride without a rate", () => {
    expect(kmInvoiceLines([{ ...rit, project: { name: "Intern", defaultKmRate: null } }])).toEqual([]);
  });
});

describe("expenseInvoiceLines", () => {
  const uitgave = {
    id: "e1",
    date: "2026-07-08",
    amount: "107.27",
    description: "Late levering SAMTEC connectors",
    category: { name: "Materiaal" },
    user: { name: "Merlijn Kunst" },
    project: { name: "ACQstacks 10x JUL26" },
  };

  it("makes one line per expense, built up like the rest", () => {
    expect(expenseInvoiceLines([uitgave])).toEqual([
      {
        description: "08-JUL-2026 — Merlijn Kunst — ACQstacks 10x JUL26 — Late levering SAMTEC connectors",
        quantity: 1,
        unitPrice: 107.27,
        expenseIds: ["e1"],
      },
    ]);
  });

  it("falls back to the category when the expense has no description", () => {
    expect(expenseInvoiceLines([{ ...uitgave, description: "   " }])[0].description).toContain("Materiaal");
  });

  it("leaves out an expense of nought, which cannot be invoiced", () => {
    expect(expenseInvoiceLines([{ ...uitgave, amount: 0 }])).toEqual([]);
  });

  it("gives no lines for an empty list", () => {
    expect(expenseInvoiceLines([])).toEqual([]);
  });
});
