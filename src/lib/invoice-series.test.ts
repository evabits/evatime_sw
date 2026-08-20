import { describe, it, expect } from "vitest";
import { nextInvoiceNumberFrom } from "./invoice-series";

describe("nextInvoiceNumberFrom", () => {
  it("starts at 0001 in a year without invoices", () => {
    expect(nextInvoiceNumberFrom([], 2026)).toBe("2026-0001");
  });

  it("continues after the highest number", () => {
    expect(nextInvoiceNumberFrom(["2026-0001", "2026-0002"], 2026)).toBe("2026-0003");
  });

  it("keeps the gap when earlier invoices are deleted", () => {
    // Dit is de fout waarvoor deze functie bestaat: er stonden vier facturen,
    // genummerd 0005 tot en met 0008, omdat 0001 t/m 0004 verwijderd waren.
    // Tellen gaf 0005, dat al bestond, en de unieke sleutel botste.
    expect(nextInvoiceNumberFrom(["2026-0005", "2026-0006", "2026-0007", "2026-0008"], 2026))
      .toBe("2026-0009");
  });

  it("does not care in what order the numbers arrive", () => {
    expect(nextInvoiceNumberFrom(["2026-0008", "2026-0005", "2026-0007"], 2026)).toBe("2026-0009");
  });

  it("ignores numbers from another year", () => {
    // De reeks loopt per kalenderjaar; een factuur van vorig jaar mag het
    // nieuwe jaar niet vooruit duwen.
    expect(nextInvoiceNumberFrom(["2025-0042", "2026-0001"], 2026)).toBe("2026-0002");
    expect(nextInvoiceNumberFrom(["2025-0042"], 2026)).toBe("2026-0001");
  });

  it("ignores anything that is not a number, instead of failing on it", () => {
    // Een met de hand aangepast nummer mag de reeks niet laten struikelen.
    expect(nextInvoiceNumberFrom(["2026-0003", "2026-HERSTEL", "los", ""], 2026)).toBe("2026-0004");
  });

  it("grows past four digits instead of wrapping", () => {
    // Bij 9999 facturen in een jaar is de breedte op; doortellen is dan beter
    // dan opnieuw bij 0001 beginnen.
    expect(nextInvoiceNumberFrom(["2026-9999"], 2026)).toBe("2026-10000");
  });

  it("copes with stray spaces around a number", () => {
    expect(nextInvoiceNumberFrom([" 2026-0004 "], 2026)).toBe("2026-0005");
  });
});
