import { describe, it, expect } from "vitest";
import { invoiceFromQuote, quoteConvertDenial, vandaagInAmsterdam } from "./quote-invoice";
import { docCopy } from "./document-copy";

const offerte = {
  customerId: "k1",
  language: "NL" as const,
  vatRate: "21",
  vatAmount: "21",
  subtotal: "100",
  total: "121",
  reference: "PO-123",
  subject: "Recorder cases",
  intro: "Geachte heer Hagenouw,",
  lines: [
    { description: "Inkoop", quantity: "15", unitPrice: "4", total: "60" },
    { description: "Assemblage", quantity: "1", unitPrice: "40", total: "40" },
  ],
};

describe("quoteConvertDenial", () => {
  it("laat concept, verzonden en goedgekeurd door", () => {
    expect(quoteConvertDenial("DRAFT")).toBeNull();
    expect(quoteConvertDenial("SENT")).toBeNull();
    expect(quoteConvertDenial("APPROVED")).toBeNull();
  });

  it("weigert een geannuleerde offerte", () => {
    expect(quoteConvertDenial("CANCELLED")).not.toBeNull();
  });
});

describe("invoiceFromQuote", () => {
  const vandaag = new Date("2026-09-21T00:00:00Z");

  it("zet de betalingstekst eronder en niet de offertecondities", () => {
    const f = invoiceFromQuote(offerte, vandaag);
    expect(f.notes).toBe(docCopy("NL").betalingstekst);
    expect(docCopy("EN").betalingstekst).toBe(
      invoiceFromQuote({ ...offerte, language: "EN" }, vandaag).notes,
    );
  });

  it("neemt kenmerk, onderwerp, inleiding en taal over", () => {
    const f = invoiceFromQuote(offerte, vandaag);
    expect([f.reference, f.subject, f.intro, f.language]).toEqual([
      "PO-123", "Recorder cases", "Geachte heer Hagenouw,", "NL",
    ]);
  });

  it("nummert de regels in de volgorde van de offerte", () => {
    const f = invoiceFromQuote(offerte, vandaag);
    expect(f.lines.map((l) => [l.description, l.sortOrder])).toEqual([["Inkoop", 0], ["Assemblage", 1]]);
  });

  it("vervalt dertig dagen na de factuurdatum", () => {
    const f = invoiceFromQuote(offerte, vandaag);
    expect(f.dueDate.toISOString().slice(0, 10)).toBe("2026-10-21");
  });
});

describe("vandaagInAmsterdam", () => {
  it("geeft om 00:30 Nederlandse tijd de Nederlandse dag, niet de UTC-dag", () => {
    // 20 sep 22:30 UTC is 21 sep 00:30 in Amsterdam (zomertijd).
    expect(vandaagInAmsterdam(new Date("2026-09-20T22:30:00Z")).toISOString()).toBe(
      "2026-09-21T00:00:00.000Z",
    );
  });
});
