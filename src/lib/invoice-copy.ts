import { addDays, differenceInCalendarDays } from "date-fns";

/**
 * Een factuur kopiëren: wat de kopie overneemt en wat hij juist niet meekrijgt.
 *
 * Hier apart van de route, omdat de keuzes die dit maakt het hele punt zijn en
 * een route met een database eromheen niet te testen valt zonder database.
 *
 * Wat bewust NIET meekomt:
 *
 * - Het factuurnummer en de klantlink. Beide zijn uniek; de route zet er een
 *   nieuw nummer op en de database maakt zelf een nieuw token.
 * - Verzonden-op en herinnering-op. De kopie is niet verstuurd.
 * - De koppeling naar uren, ritten en uitgaven. Een registratie hangt met
 *   `invoiceLineId` aan precies één factuurregel en staat op `invoiced`. Nam de
 *   kopie ze over, dan verhuizen ze van de bron naar de kopie: de bronfactuur
 *   verliest zijn onderbouwing en dezelfde uren staan twee keer in rekening.
 *   De regels komen dus mee als tekst en bedrag, zonder hun herkomst.
 */
export type InvoiceLineForCopy = {
  description: string;
  quantity: number | string;
  unitPrice: number | string;
  lineType: "HOURS" | "KM" | "EXPENSE" | "OTHER";
};

export type InvoiceForCopy = {
  customerId: string;
  issueDate: Date | string;
  dueDate: Date | string;
  vatRate: number | string;
  reference?: string | null;
  subject?: string | null;
  intro?: string | null;
  notes?: string | null;
  lines: InvoiceLineForCopy[];
};

export type InvoiceCopy = {
  invoice: {
    customerId: string;
    issueDate: Date;
    dueDate: Date;
    status: "DRAFT";
    vatRate: number;
    reference: string | null;
    subject: string | null;
    intro: string | null;
    notes: string | null;
    subtotal: number;
    vatAmount: number;
    total: number;
  };
  lines: {
    description: string;
    quantity: number;
    unitPrice: number;
    total: number;
    lineType: InvoiceLineForCopy["lineType"];
    sortOrder: number;
  }[];
};

/**
 * De gegevens voor de kopie, gerekend vanaf `vandaag`.
 *
 * De kopie is altijd een concept, wat de bron ook was — je stuurt hem pas na
 * het nalopen. De factuurdatum wordt vandaag en de vervaldatum schuift mee met
 * dezelfde betalingstermijn als de bron had: een kopie is vrijwel altijd de
 * factuur van een volgende periode, en dan is de datum van de bron fout.
 *
 * Bedragen worden opnieuw uit de regels gerekend en niet overgenomen. Een
 * kopie die andere totalen toont dan zijn eigen regels is erger dan geen kopie.
 */
export function invoiceCopyData(bron: InvoiceForCopy, vandaag: Date): InvoiceCopy {
  const lines = bron.lines.map((l, i) => {
    const quantity = Number(l.quantity);
    const unitPrice = Number(l.unitPrice);
    return {
      description: l.description,
      quantity,
      unitPrice,
      total: quantity * unitPrice,
      lineType: l.lineType,
      // Opnieuw genummerd vanaf nul. Facturen van vóór sortOrder staan allemaal
      // op nul; de kopie legt de volgorde vast waarin ze nu getoond worden.
      sortOrder: i,
    };
  });

  const vatRate = Number(bron.vatRate);
  const subtotal = lines.reduce((som, l) => som + l.total, 0);
  const vatAmount = (subtotal * vatRate) / 100;

  // Een vervaldatum vóór de factuurdatum bestaat niet; bij zulke brongegevens
  // vervalt de kopie dezelfde dag in plaats van in het verleden.
  const termijn = Math.max(
    0,
    differenceInCalendarDays(new Date(bron.dueDate), new Date(bron.issueDate)),
  );

  return {
    invoice: {
      customerId: bron.customerId,
      issueDate: vandaag,
      dueDate: addDays(vandaag, termijn),
      status: "DRAFT",
      vatRate,
      reference: bron.reference ?? null,
      subject: bron.subject ?? null,
      intro: bron.intro ?? null,
      notes: bron.notes ?? null,
      subtotal,
      vatAmount,
      total: subtotal + vatAmount,
    },
    lines,
  };
}
