import { describe, it, expect } from "vitest";
import { splitInvoicePeriod } from "./invoice-period";

// Zoals de API ze levert: een volledige ISO-tijdstempel, geen kale datum.
const regel = (id: string, dag: string) => ({ id, date: `${dag}T00:00:00.000Z` });

describe("splitInvoicePeriod", () => {
  it("keeps the first and last day of the period", () => {
    const regels = [regel("a", "2026-07-01"), regel("b", "2026-07-31")];
    const uitkomst = splitInvoicePeriod(regels, "2026-07-01", "2026-07-31");
    expect(uitkomst.binnen.map((r) => r.id)).toEqual(["a", "b"]);
    expect(uitkomst.ervoorAantal).toBe(0);
  });

  it("counts the day before the period as backlog", () => {
    const regels = [regel("oud", "2026-06-30"), regel("nieuw", "2026-07-01")];
    const uitkomst = splitInvoicePeriod(regels, "2026-07-01", "2026-07-31");
    expect(uitkomst.binnen.map((r) => r.id)).toEqual(["nieuw"]);
    expect(uitkomst.ervoorAantal).toBe(1);
    expect(uitkomst.ervoorOudste).toBe("2026-06-30");
  });

  it("ignores an entry after the period entirely", () => {
    // Wie in augustus juli factureert heeft altijd openstaande augustusregels.
    // Dat is de factuur van volgende maand, geen achterstand.
    const regels = [regel("later", "2026-08-03")];
    const uitkomst = splitInvoicePeriod(regels, "2026-07-01", "2026-07-31");
    expect(uitkomst.binnen).toEqual([]);
    expect(uitkomst.ervoorAantal).toBe(0);
    expect(uitkomst.ervoorOudste).toBeNull();
  });

  it("reports the earliest date of everything before the period", () => {
    const regels = [
      regel("a", "2026-03-15"),
      regel("b", "2026-01-14"),
      regel("c", "2026-06-30"),
    ];
    const uitkomst = splitInvoicePeriod(regels, "2026-07-01", "2026-07-31");
    expect(uitkomst.ervoorAantal).toBe(3);
    expect(uitkomst.ervoorOudste).toBe("2026-01-14");
  });

  it("gives no oldest date when nothing precedes the period", () => {
    const uitkomst = splitInvoicePeriod([regel("a", "2026-07-10")], "2026-07-01", "2026-07-31");
    expect(uitkomst.ervoorAantal).toBe(0);
    expect(uitkomst.ervoorOudste).toBeNull();
  });

  it("handles an empty list", () => {
    expect(splitInvoicePeriod([], "2026-07-01", "2026-07-31")).toEqual({
      binnen: [],
      ervoorAantal: 0,
      ervoorOudste: null,
    });
  });

  it("compares on the day, not on the timestamp", () => {
    // Een regel laat op de laatste dag van de periode hoort er nog bij; op de
    // hele tijdstempel vergelijken zou hem eruit gooien.
    const laat = { id: "laat", date: "2026-07-31T22:30:00.000Z" };
    const uitkomst = splitInvoicePeriod([laat], "2026-07-01", "2026-07-31");
    expect(uitkomst.binnen.map((r) => r.id)).toEqual(["laat"]);
  });

  it("keeps the order the entries came in", () => {
    // De lijst komt gesorteerd uit de API; die volgorde is wat het scherm toont.
    const regels = [regel("a", "2026-07-20"), regel("b", "2026-07-02")];
    const uitkomst = splitInvoicePeriod(regels, "2026-07-01", "2026-07-31");
    expect(uitkomst.binnen.map((r) => r.id)).toEqual(["a", "b"]);
  });
});
