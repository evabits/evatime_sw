import { describe, it, expect } from "vitest";
import { docCopy } from "./document-copy";

describe("docCopy", () => {
  it("geeft Nederlands voor NL", () => {
    expect(docCopy("NL").factuur).toBe("FACTUUR");
  });

  it("geeft Engels voor EN", () => {
    expect(docCopy("EN").factuur).toBe("INVOICE");
  });

  it("valt terug op Nederlands bij niets of onbekend", () => {
    // Elke bestaande factuur is Nederlands; dat hoort de terugval te zijn.
    expect(docCopy(null).factuur).toBe("FACTUUR");
    expect(docCopy(undefined).factuur).toBe("FACTUUR");
    expect(docCopy("DE").factuur).toBe("FACTUUR");
  });

  it("houdt de IBAN in de betalingstekst van beide talen", () => {
    // De tekst is vertaald, het rekeningnummer niet: daar wordt echt op betaald.
    expect(docCopy("NL").betalingstekst).toContain("NL90 INGB 0008 9967 99");
    expect(docCopy("EN").betalingstekst).toContain("NL90 INGB 0008 9967 99");
  });

  it("zet de getallen op hun plek in de samengestelde zinnen", () => {
    expect(docCopy("NL").batchKwaliteit(120, 118, 2)).toBe(
      "Van de 120 geteste exemplaren zijn er 118 goedgekeurd en 2 afgekeurd.",
    );
    expect(docCopy("EN").batchKwaliteit(120, 118, 2)).toBe(
      "Of the 120 units tested, 118 passed and 2 were rejected.",
    );
  });

  it("gebruikt de Engelse notatie voor bedragen en datums", () => {
    expect(docCopy("NL").locale).toBe("nl-NL");
    expect(docCopy("EN").locale).toBe("en-GB");
  });
});
