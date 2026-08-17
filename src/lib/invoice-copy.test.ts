import { describe, it, expect } from "vitest";
import { invoiceCopyData, type InvoiceForCopy } from "./invoice-copy";

const vandaag = new Date(2026, 7, 17); // 17-AUG-2026

// Zoals Prisma het aanlevert: Decimal komt als string terug.
const bron: InvoiceForCopy = {
  customerId: "klant-1",
  issueDate: new Date(2026, 5, 30), // 30-JUN-2026
  dueDate: new Date(2026, 6, 30), // 30-JUL-2026
  vatRate: "21",
  reference: "MED-JUN26",
  subject: "Uren juni 2026",
  intro: "Hierbij ontvangt u de factuur voor juni.",
  notes: "Binnen 30 dagen overmaken.",
  lines: [
    { description: "Ontwikkeling", quantity: "10", unitPrice: "95", lineType: "HOURS" },
    { description: "Reiskosten", quantity: "120", unitPrice: "0.23", lineType: "KM" },
  ],
};

describe("invoiceCopyData", () => {
  it("makes the copy a draft whatever the source was", () => {
    expect(invoiceCopyData(bron, vandaag).invoice.status).toBe("DRAFT");
  });

  it("takes over customer, reference, subject, intro, notes and vat rate", () => {
    const { invoice } = invoiceCopyData(bron, vandaag);
    expect(invoice.customerId).toBe("klant-1");
    expect(invoice.reference).toBe("MED-JUN26");
    expect(invoice.subject).toBe("Uren juni 2026");
    expect(invoice.intro).toBe("Hierbij ontvangt u de factuur voor juni.");
    expect(invoice.notes).toBe("Binnen 30 dagen overmaken.");
    expect(invoice.vatRate).toBe(21);
  });

  it("dates the copy today and keeps the payment term of the source", () => {
    const { invoice } = invoiceCopyData(bron, vandaag);
    expect(invoice.issueDate).toEqual(vandaag);
    expect(invoice.dueDate).toEqual(new Date(2026, 8, 16)); // 30 dagen later
  });

  it("never lets the copy fall due before it is issued", () => {
    // Brongegevens waarin de vervaldatum vóór de factuurdatum ligt bestaan niet
    // in de praktijk, maar mogen geen kopie opleveren die al verlopen is.
    const krom = { ...bron, dueDate: new Date(2026, 5, 1) };
    const { invoice } = invoiceCopyData(krom, vandaag);
    expect(invoice.dueDate).toEqual(vandaag);
  });

  it("copies the lines and recomputes their totals", () => {
    const { lines } = invoiceCopyData(bron, vandaag);
    expect(lines).toEqual([
      { description: "Ontwikkeling", quantity: 10, unitPrice: 95, total: 950, lineType: "HOURS", sortOrder: 0 },
      { description: "Reiskosten", quantity: 120, unitPrice: 0.23, total: 27.6, lineType: "KM", sortOrder: 1 },
    ]);
  });

  it("recomputes the amounts from the lines instead of copying them", () => {
    const { invoice } = invoiceCopyData(bron, vandaag);
    expect(invoice.subtotal).toBeCloseTo(977.6, 2);
    expect(invoice.vatAmount).toBeCloseTo(205.3, 2);
    expect(invoice.total).toBeCloseTo(1182.9, 2);
  });

  it("carries nothing that identifies the source invoice", () => {
    // Nummer, klantlink, verzenddatums en de koppeling naar uren en uitgaven
    // horen niet in de kopie. Een veld dat er toch in sluipt zou hier opvallen.
    const { invoice, lines } = invoiceCopyData(bron, vandaag);
    expect(Object.keys(invoice).sort()).toEqual([
      "customerId", "dueDate", "intro", "issueDate", "notes", "reference",
      "status", "subject", "subtotal", "total", "vatAmount", "vatRate",
    ]);
    expect(Object.keys(lines[0]).sort()).toEqual([
      "description", "lineType", "quantity", "sortOrder", "total", "unitPrice",
    ]);
  });

  it("leaves empty fields empty instead of undefined", () => {
    const kaal: InvoiceForCopy = {
      customerId: "klant-2",
      issueDate: vandaag,
      dueDate: vandaag,
      vatRate: 9,
      lines: [],
    };
    const { invoice } = invoiceCopyData(kaal, vandaag);
    expect(invoice.reference).toBeNull();
    expect(invoice.subject).toBeNull();
    expect(invoice.intro).toBeNull();
    expect(invoice.notes).toBeNull();
    expect(invoice.subtotal).toBe(0);
    expect(invoice.total).toBe(0);
  });
});
