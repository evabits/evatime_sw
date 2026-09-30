import { describe, it, expect } from "vitest";
import { batchTotal, suggestBatchName, recurringInvoiceIntro, recurringInvoiceDraft, completeBatchDenial, deleteBatchDenial, batchReference, batchSubject } from "./recurring";

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
    expect(d.lines[0].quantity).toBe(120);
    expect(d.lines[0].unitPrice).toBe(20);
    expect(d.lines[0].total).toBe(2400);
    expect(d.subtotal).toBe(2400);
  });

  it("takes subject and line description from the template", () => {
    const d = recurringInvoiceDraft(sjabloon(), batch(), invoer);
    expect(d.subject).toBe("Factuur H3X testen");
    expect(d.lines[0].description).toBe("Testen H3X batterij omvormers");
    expect(d.lines[0].lineType).toBe("OTHER");
  });

  it("falls back to the batch name when the template has no subject", () => {
    // Een factuur zonder onderwerp leest als een fout; de batchnaam is altijd
    // beter dan niets.
    const d = recurringInvoiceDraft(sjabloon({ invoiceSubject: null }), batch(), invoer);
    expect(d.subject).toBe("H3X testen AUG26");
  });

  it("takes the reference from the template prefix and the delivery date", () => {
    const d = recurringInvoiceDraft(sjabloon({ referencePrefix: "ZP-H3X" }), batch(), invoer);
    expect(d.reference).toBe("ZP-H3X-20AUG26");
  });

  it("leaves the reference empty when the template has no prefix", () => {
    expect(recurringInvoiceDraft(sjabloon(), batch(), invoer).reference).toBeNull();
  });

  it("puts the counts in the intro", () => {
    const d = recurringInvoiceDraft(sjabloon(), batch(), invoer);
    expect(d.intro).toContain("118 goedgekeurd en 2 afgekeurd");
    expect(d.intro).toContain("20-AUG-2026");
  });

  it("bills a fixed amount as one unit", () => {
    const vast = sjabloon({ billing: "FIXED", tracksQuality: false, unitPrice: "750.00" });
    const d = recurringInvoiceDraft(vast, batch(), { quantity: 1 });
    expect(d.lines[0].quantity).toBe(1);
    expect(d.lines[0].total).toBe(750);
  });

  it("does not multiply a fixed amount by the number of items tested", () => {
    // Een sjabloon mag een vast bedrag hebben én goed- en afkeur bijhouden. Het
    // scherm liet dan twee aantallen invullen en het vaste bedrag werd met de
    // som vermenigvuldigd: 120 x EUR 750,00. De aantallen horen in de
    // inleiding, niet in de rekensom.
    const vast = sjabloon({ billing: "FIXED", tracksQuality: true, unitPrice: "750.00" });
    const d = recurringInvoiceDraft(vast, batch(), { approved: 118, rejected: 2 });
    expect(d.lines[0].quantity).toBe(1);
    expect(d.lines[0].total).toBe(750);
    expect(d.subtotal).toBe(750);
    expect(d.intro).toContain("118 goedgekeurd en 2 afgekeurd");
  });
});

describe("batchReference", () => {
  it("puts the delivery date behind the prefix", () => {
    // Zo stond het met de hand op 2026-0008: ZP-H3X-12AUG26.
    expect(batchReference("ZP-H3X", "2026-08-12")).toBe("ZP-H3X-12AUG26");
  });

  it("leaves out the leading zero on the day", () => {
    // En zo op 2026-0007: 6AUG26, niet 06AUG26.
    expect(batchReference("ZP-H3X", "2026-08-06")).toBe("ZP-H3X-6AUG26");
  });

  it("uses the same month abbreviations as every other date in the app", () => {
    expect(batchReference("ZP-H3X", "2026-03-01")).toBe("ZP-H3X-1MRT26");
    expect(batchReference("ZP-H3X", "2026-12-31")).toBe("ZP-H3X-31DEC26");
  });

  it("gives nothing when the template has no prefix", () => {
    // Geen kenmerk is de bestaande toestand van elke andere factuur; een los
    // streepje met een datum erachter zou erger zijn dan een leeg veld.
    expect(batchReference(null, "2026-08-12")).toBeNull();
    expect(batchReference("", "2026-08-12")).toBeNull();
    expect(batchReference("   ", "2026-08-12")).toBeNull();
  });

  it("trims a prefix that was typed with a trailing space or dash", () => {
    expect(batchReference(" ZP-H3X ", "2026-08-12")).toBe("ZP-H3X-12AUG26");
    expect(batchReference("ZP-H3X-", "2026-08-12")).toBe("ZP-H3X-12AUG26");
  });

  it("reads a date from the database on the right day", () => {
    // @db.Date komt binnen als UTC-middernacht; in Amsterdam is dat dezelfde
    // dag, en dat moet zo blijven — hier is al drie keer een dagfout op gemaakt.
    expect(batchReference("ZP-H3X", new Date("2026-08-12T00:00:00Z"))).toBe("ZP-H3X-12AUG26");
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

describe("recurringInvoiceIntro in het Engels", () => {
  it("schrijft de inleiding en de aantallen in het Engels", () => {
    expect(
      recurringInvoiceIntro({
        batchnaam: "H3X AUG26",
        opgeleverdOp: "2026-03-12",
        totaal: 120,
        tracksQuality: true,
        approved: 118,
        rejected: 2,
        taal: "EN",
      }),
    ).toBe(
      "Please find enclosed the invoice for H3X AUG26, delivered on 12-MAR-2026. " +
        "Of the 120 units tested, 118 passed and 2 were rejected.",
    );
  });

  it("blijft Nederlands zonder taal", () => {
    expect(
      recurringInvoiceIntro({
        batchnaam: "H3X AUG26",
        opgeleverdOp: "2026-03-12",
        totaal: 120,
        tracksQuality: false,
      }),
    ).toBe("Hierbij ontvangt u de factuur voor H3X AUG26, opgeleverd op 12-MRT-2026.");
  });
});

describe("batchSubject", () => {
  it("zet de projectcode achter het onderwerp", () => {
    expect(batchSubject("Factuur H3X testen", "H3X AUG26", "PROJ-441")).toBe(
      "Factuur H3X testen - PROJ-441",
    );
  });

  it("valt terug op de batchnaam als het sjabloon geen onderwerp heeft", () => {
    expect(batchSubject(null, "H3X AUG26", "PROJ-441")).toBe("H3X AUG26 - PROJ-441");
  });

  it("laat het onderwerp heel zonder projectcode", () => {
    expect(batchSubject("Factuur H3X testen", "H3X AUG26", null)).toBe("Factuur H3X testen");
    expect(batchSubject("Factuur H3X testen", "H3X AUG26", "   ")).toBe("Factuur H3X testen");
  });
});

describe("varianten", () => {
  const sjabloon = {
    id: "s1", name: "SaltBuddies en SSW", customerId: "k1", billing: "PER_UNIT" as const,
    unitPrice: 4, defaultQuantity: 200, lineDescription: "Testen en inpakken",
    invoiceSubject: "Factuur SaltBuddies en SSWs", tracksQuality: false, referencePrefix: null,
    variants: [{ id: "v1", name: "SaltBuddies" }, { id: "v2", name: "Slim Smart Watches" }],
  };
  const batch = { id: "b1", name: "SaltBuddies en SSW SEP26", generatedInvoiceId: null, deliveredAt: "2026-09-30" };
  const invoer = {
    variants: [
      { id: "v1", name: "SaltBuddies", quantity: 120 },
      { id: "v2", name: "Slim Smart Watches", quantity: 80 },
    ],
  };

  it("telt het totaal op uit de varianten", () => {
    expect(batchTotal(invoer, false)).toBe(200);
  });

  it("maakt een regel per variant met het gedeelde tarief", () => {
    const d = recurringInvoiceDraft(sjabloon, batch, invoer);
    expect(d.lines).toEqual([
      { description: "Testen en inpakken - SaltBuddies", quantity: 120, unitPrice: 4, total: 480, lineType: "OTHER" },
      { description: "Testen en inpakken - Slim Smart Watches", quantity: 80, unitPrice: 4, total: 320, lineType: "OTHER" },
    ]);
    expect(d.subtotal).toBe(800);
  });

  it("laat een variant zonder aantal van de factuur", () => {
    const d = recurringInvoiceDraft(sjabloon, batch, {
      variants: [
        { id: "v1", name: "SaltBuddies", quantity: 120 },
        { id: "v2", name: "Slim Smart Watches", quantity: 0 },
      ],
    });
    expect(d.lines.map((r) => r.description)).toEqual(["Testen en inpakken - SaltBuddies"]);
    expect(d.subtotal).toBe(480);
  });

  it("weigert een batch waarin geen enkele variant een aantal heeft", () => {
    const leeg = { variants: [{ id: "v1", name: "SaltBuddies", quantity: 0 }] };
    expect(completeBatchDenial(sjabloon, batch, leeg)).toBe("Vul een aantal groter dan nul in.");
  });

  it("weigert een negatief aantal bij een variant", () => {
    const fout = { variants: [{ id: "v1", name: "SaltBuddies", quantity: -1 }] };
    expect(completeBatchDenial(sjabloon, batch, fout)).toBe("Een aantal kan niet negatief zijn.");
  });

  it("houdt het gedrag van een sjabloon zonder varianten gelijk", () => {
    const d = recurringInvoiceDraft({ ...sjabloon, variants: [] }, batch, { quantity: 200 });
    expect(d.lines).toHaveLength(1);
    expect(d.lines[0].description).toBe("Testen en inpakken");
    expect(d.subtotal).toBe(800);
  });
});

describe("deleteBatchDenial", () => {
  const lopend = { templateId: "t1", status: "ACTIVE", generatedInvoiceId: null };
  const leeg = { timeEntries: 0, kmEntries: 0, expenses: 0 };

  it("allows a running batch without bookings", () => {
    expect(deleteBatchDenial(lopend, leeg)).toBeNull();
  });

  it("refuses an ordinary project", () => {
    expect(deleteBatchDenial({ ...lopend, templateId: null }, leeg)).not.toBeNull();
  });

  it("refuses a completed or invoiced batch", () => {
    expect(deleteBatchDenial({ ...lopend, status: "COMPLETED" }, leeg)).not.toBeNull();
    expect(deleteBatchDenial({ ...lopend, generatedInvoiceId: "f1" }, leeg)).not.toBeNull();
  });

  it("refuses when anything is booked on it, so no hours vanish", () => {
    expect(deleteBatchDenial(lopend, { ...leeg, timeEntries: 1 })).not.toBeNull();
    expect(deleteBatchDenial(lopend, { ...leeg, kmEntries: 1 })).not.toBeNull();
    expect(deleteBatchDenial(lopend, { ...leeg, expenses: 1 })).not.toBeNull();
  });
});
