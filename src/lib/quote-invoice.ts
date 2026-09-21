import { standaardBetalingstekst } from "./invoice-defaults";
import type { Taal } from "./document-copy";

/**
 * Van offerte naar factuur: wat de factuur overneemt, en wanneer het mag.
 *
 * Hier en niet in de route, omdat de keuzes die dit maakt het punt zijn en een
 * route met een database eromheen niet te testen valt zonder database.
 */

/**
 * De Nederlandse kalenderdag van vandaag, vastgepind op UTC-middernacht.
 *
 * Factuur- en vervaldatum zijn @db.Date-kolommen: Prisma bewaart alleen de
 * datum, en die leidt hij af uit UTC. Een kale `new Date()` zet tussen
 * middernacht en 02:00 Nederlandse tijd dus de vórige dag op de factuur.
 */
export function vandaagInAmsterdam(nu: Date = new Date()): Date {
  return new Date(`${nu.toLocaleDateString("en-CA", { timeZone: "Europe/Amsterdam" })}T00:00:00Z`);
}

/**
 * Waarom deze offerte (nog) geen factuur mag worden, of null als het mag.
 *
 * Niet alleen goedgekeurde offertes: een klant die per mail of telefoon ja
 * zegt, klikt nooit op de goedkeurknop, en dan bleef de knop onvindbaar. Een
 * geannuleerde offerte factureer je niet.
 */
export function quoteConvertDenial(status: string): string | null {
  if (status === "CANCELLED") return "Een geannuleerde offerte kan geen factuur worden";
  return null;
}

/**
 * Generiek over het bedragtype: de route geeft Prisma's Decimal door en krijgt
 * die ongewijzigd terug, de test gebruikt gewone tekst. Er wordt hier niet
 * gerekend, alleen overgenomen.
 */
export type QuoteForInvoice<B> = {
  customerId: string;
  language: Taal;
  vatRate: B;
  vatAmount: B;
  subtotal: B;
  total: B;
  reference: string | null;
  subject: string | null;
  intro: string | null;
  lines: { description: string; quantity: B; unitPrice: B; total: B }[];
};

/** De gegevens voor de conceptfactuur, zonder nummer: dat geeft de route. */
export function invoiceFromQuote<B>(offerte: QuoteForInvoice<B>, vandaag: Date) {
  return {
    customerId: offerte.customerId,
    issueDate: vandaag,
    dueDate: new Date(vandaag.getTime() + 30 * 24 * 60 * 60 * 1000),
    status: "DRAFT" as const,
    vatRate: offerte.vatRate,
    vatAmount: offerte.vatAmount,
    subtotal: offerte.subtotal,
    total: offerte.total,
    reference: offerte.reference,
    subject: offerte.subject,
    intro: offerte.intro,
    // De betalingstekst en niet de opmerkingen van de offerte: daarin staan de
    // offertecondities, en "deze offerte is geldig tot…" hoort niet op een
    // factuur.
    notes: standaardBetalingstekst(offerte.language),
    // Dezelfde taal als de offerte die eraan voorafging.
    language: offerte.language,
    lines: offerte.lines.map((l, i) => ({
      description: l.description,
      quantity: l.quantity,
      unitPrice: l.unitPrice,
      total: l.total,
      lineType: "OTHER" as const,
      // Expliciet genummerd: regels uit één create hebben allemaal dezelfde
      // createdAt, dus zonder sortOrder is hun volgorde op de factuur toeval.
      sortOrder: i,
    })),
  };
}
