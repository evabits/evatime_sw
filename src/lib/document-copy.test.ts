import { describe, it, expect } from "vitest";
import { docCopy, standaardInTaal } from "./document-copy";

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

describe("offerteCondities", () => {
  it("staat in beide talen met dezelfde facturering", () => {
    expect(docCopy("NL").offerteCondities).toContain("40% bij opdracht");
    expect(docCopy("EN").offerteCondities).toContain("40% upon order");
  });

  it("heeft geen aanhef: die hoort bij één offerte", () => {
    expect(docCopy("NL").offerteCondities).not.toMatch(/Geachte/);
    expect(docCopy("NL").offerteCondities.startsWith("Algemene condities:")).toBe(true);
  });
});

describe("standaardInTaal", () => {
  const kies = (t: ReturnType<typeof docCopy>) => t.offerteCondities;

  it("wisselt de standaardtekst mee met de taal van de klant", () => {
    expect(standaardInTaal(docCopy("NL").offerteCondities, kies, "EN")).toBe(docCopy("EN").offerteCondities);
    expect(standaardInTaal(docCopy("EN").offerteCondities, kies, "NL")).toBe(docCopy("NL").offerteCondities);
  });

  it("laat een bewust leeggemaakt veld leeg", () => {
    expect(standaardInTaal("", kies, "EN")).toBe("");
  });

  it("laat aangepaste tekst staan", () => {
    const eigen = docCopy("NL").offerteCondities + "\nLevering in week 40";
    expect(standaardInTaal(eigen, kies, "EN")).toBe(eigen);
  });
});

describe("standaardInTaal voor de betalingstekst", () => {
  const kies = (t: ReturnType<typeof docCopy>) => t.betalingstekst;

  it("wisselt de betalingstekst mee naar een Engelse klant", () => {
    expect(standaardInTaal(docCopy("NL").betalingstekst, kies, "EN")).toBe(docCopy("EN").betalingstekst);
  });

  it("laat een aangepaste betalingstekst staan", () => {
    const eigen = "Betaling binnen 14 dagen.";
    expect(standaardInTaal(eigen, kies, "EN")).toBe(eigen);
  });
});
