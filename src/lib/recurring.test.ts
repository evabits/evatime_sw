import { describe, it, expect } from "vitest";
import { batchTotal, suggestBatchName, recurringInvoiceIntro } from "./recurring";

describe("batchTotal", () => {
  it("adds up approved and rejected for test work — everything tested is billed", () => {
    // Dit is de kern: 118 goedgekeurd en 2 afgekeurd betekent 120 op de factuur.
    expect(batchTotal({ approved: 118, rejected: 2 }, true)).toBe(120);
  });

  it("takes the plain quantity when quality is not tracked", () => {
    expect(batchTotal({ quantity: 50 }, false)).toBe(50);
  });

  it("ignores the plain quantity when quality is tracked, so the two cannot disagree", () => {
    expect(batchTotal({ quantity: 999, approved: 10, rejected: 1 }, true)).toBe(11);
  });

  it("treats missing numbers as nothing", () => {
    expect(batchTotal({}, true)).toBe(0);
    expect(batchTotal({}, false)).toBe(0);
    expect(batchTotal({ approved: 5 }, true)).toBe(5);
  });
});

describe("suggestBatchName", () => {
  it("puts month and year behind the template name", () => {
    expect(suggestBatchName("H3X testen", new Date(2026, 7, 20))).toBe("H3X testen AUG26");
  });

  it("uses the same month abbreviations as the rest of the app", () => {
    expect(suggestBatchName("SAJ - EVO", new Date(2026, 2, 1))).toBe("SAJ - EVO MRT26");
  });

  it("crosses the turn of the year", () => {
    expect(suggestBatchName("H3X testen", new Date(2027, 0, 5))).toBe("H3X testen JAN27");
  });
});

describe("recurringInvoiceIntro", () => {
  const basis = {
    batchnaam: "H3X testen AUG26",
    opgeleverdOp: "2026-08-20",
    totaal: 120,
    tracksQuality: true,
    approved: 118,
    rejected: 2,
  };

  it("names the batch, the delivery date and the breakdown", () => {
    expect(recurringInvoiceIntro(basis)).toBe(
      "Hierbij ontvangt u de factuur voor H3X testen AUG26, opgeleverd op 20-AUG-2026. " +
        "Van de 120 geteste exemplaren zijn er 118 goedgekeurd en 2 afgekeurd.",
    );
  });

  it("leaves out the breakdown when quality is not tracked", () => {
    expect(recurringInvoiceIntro({ ...basis, tracksQuality: false, approved: null, rejected: null })).toBe(
      "Hierbij ontvangt u de factuur voor H3X testen AUG26, opgeleverd op 20-AUG-2026.",
    );
  });

  it("writes the date as DD-MMM-YYYY and never as ISO", () => {
    expect(recurringInvoiceIntro(basis)).toContain("20-AUG-2026");
    expect(recurringInvoiceIntro(basis)).not.toContain("2026-08-20");
  });

  it("keeps the sentence readable when nothing was rejected", () => {
    const alles = { ...basis, totaal: 120, approved: 120, rejected: 0 };
    expect(recurringInvoiceIntro(alles)).toContain("zijn er 120 goedgekeurd en 0 afgekeurd");
  });
});
