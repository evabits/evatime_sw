import { describe, it, expect } from "vitest";
import { batchTotal, suggestBatchName, recurringInvoiceIntro, recurringInvoiceDraft, completeBatchDenial } from "./recurring";

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

const sjabloon = (over: Partial<Parameters<typeof recurringInvoiceDraft>[0]> = {}) => ({
  id: "t1",
  name: "H3X testen",
  customerId: "k-zonneplan",
  billing: "PER_UNIT" as const,
  unitPrice: "20.00",
  defaultQuantity: "120",
  lineDescription: "Testen H3X batterij omvormers",
  invoiceSubject: "Factuur H3X testen",
  tracksQuality: true,
  ...over,
});

const batch = (over = {}) => ({
  id: "p1",
  name: "H3X testen AUG26",
  generatedInvoiceId: null as string | null,
  deliveredAt: "2026-08-20",
  ...over,
});

const invoer = { approved: 118, rejected: 2 };

describe("recurringInvoiceDraft", () => {
  it("bills the total, not the approved count", () => {
    // De twee handmatige voorlopers, 2026-0007 en 2026-0008, waren precies dit:
    // 120 x € 20,00 = € 2.400,00.
    const d = recurringInvoiceDraft(sjabloon(), batch(), invoer);
    expect(d.line.quantity).toBe(120);
    expect(d.line.unitPrice).toBe(20);
    expect(d.line.total).toBe(2400);
    expect(d.subtotal).toBe(2400);
  });

  it("takes subject and line description from the template", () => {
    const d = recurringInvoiceDraft(sjabloon(), batch(), invoer);
    expect(d.subject).toBe("Factuur H3X testen");
    expect(d.line.description).toBe("Testen H3X batterij omvormers");
    expect(d.line.lineType).toBe("OTHER");
  });

  it("falls back to the batch name when the template has no subject", () => {
    // Een factuur zonder onderwerp leest als een fout; de batchnaam is altijd
    // beter dan niets.
    const d = recurringInvoiceDraft(sjabloon({ invoiceSubject: null }), batch(), invoer);
    expect(d.subject).toBe("H3X testen AUG26");
  });

  it("puts the counts in the intro", () => {
    const d = recurringInvoiceDraft(sjabloon(), batch(), invoer);
    expect(d.intro).toContain("118 goedgekeurd en 2 afgekeurd");
    expect(d.intro).toContain("20-AUG-2026");
  });

  it("bills a fixed amount as one unit", () => {
    const vast = sjabloon({ billing: "FIXED", tracksQuality: false, unitPrice: "750.00" });
    const d = recurringInvoiceDraft(vast, batch(), { quantity: 1 });
    expect(d.line.quantity).toBe(1);
    expect(d.line.total).toBe(750);
  });

  it("does not multiply a fixed amount by the number of items tested", () => {
    // Een sjabloon mag een vast bedrag hebben én goed- en afkeur bijhouden. Het
    // scherm liet dan twee aantallen invullen en het vaste bedrag werd met de
    // som vermenigvuldigd: 120 x EUR 750,00. De aantallen horen in de
    // inleiding, niet in de rekensom.
    const vast = sjabloon({ billing: "FIXED", tracksQuality: true, unitPrice: "750.00" });
    const d = recurringInvoiceDraft(vast, batch(), { approved: 118, rejected: 2 });
    expect(d.line.quantity).toBe(1);
    expect(d.line.total).toBe(750);
    expect(d.subtotal).toBe(750);
    expect(d.intro).toContain("118 goedgekeurd en 2 afgekeurd");
  });
});

describe("completeBatchDenial", () => {
  it("allows a normal batch", () => {
    expect(completeBatchDenial(sjabloon(), batch(), invoer)).toBeNull();
  });

  it("refuses a batch that already has an invoice", () => {
    expect(completeBatchDenial(sjabloon(), batch({ generatedInvoiceId: "f1" }), invoer)).toBe(
      "Deze batch is al gefactureerd. Verwijder eerst de conceptfactuur als je opnieuw wilt beginnen.",
    );
  });

  it("refuses billing by hours, which is not built yet", () => {
    expect(completeBatchDenial(sjabloon({ billing: "HOURS" }), batch(), invoer)).toBe(
      "Factureren op uren is nog niet beschikbaar voor herhaalprojecten.",
    );
  });

  it("refuses a template without a rate, and says where to fix it", () => {
    expect(completeBatchDenial(sjabloon({ unitPrice: null }), batch(), invoer)).toBe(
      "Stel eerst een tarief in op het sjabloon.",
    );
    expect(completeBatchDenial(sjabloon({ unitPrice: "0" }), batch(), invoer)).toBe(
      "Stel eerst een tarief in op het sjabloon.",
    );
  });

  it("refuses a batch with nothing to bill", () => {
    expect(completeBatchDenial(sjabloon(), batch(), { approved: 0, rejected: 0 })).toBe(
      "Vul een aantal groter dan nul in.",
    );
  });

  it("refuses negative numbers", () => {
    expect(completeBatchDenial(sjabloon(), batch(), { approved: -1, rejected: 5 })).toBe(
      "Een aantal kan niet negatief zijn.",
    );
  });
});
