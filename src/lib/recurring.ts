import { MAANDEN, formatDate } from "./utils";

/**
 * Herhaalprojecten: terugkerend productie- en testwerk dat telkens hetzelfde
 * factuurtje oplevert.
 *
 * Geen React en geen Prisma, zodat het te testen is zonder database en zonder
 * scherm — de conventie van dit project.
 */
export type BillingMode = "PER_UNIT" | "FIXED" | "HOURS";

export type BatchInput = {
  /** Bij een sjabloon dat geen goed- en afkeur bijhoudt. */
  quantity?: number | null;
  approved?: number | null;
  rejected?: number | null;
};

/**
 * Het te factureren aantal.
 *
 * Bij testwerk is dat de som van goedgekeurd en afgekeurd: alles is getest, dus
 * alles wordt gefactureerd. Een batch van 118 goedgekeurd en 2 afgekeurd levert
 * dus een factuur van 120 op.
 *
 * Eén functie voor scherm en server, zodat het bedrag dat je in het venster ziet
 * gegarandeerd hetzelfde is als wat er op de factuur komt.
 */
export function batchTotal(invoer: BatchInput, tracksQuality: boolean): number {
  if (tracksQuality) return Number(invoer.approved ?? 0) + Number(invoer.rejected ?? 0);
  return Number(invoer.quantity ?? 0);
}

/**
 * De voorgestelde naam van een nieuwe batch: `H3X testen AUG26`.
 *
 * Sluit aan op de naamgeving die er met de hand al was — `IOmodule (Prod. JUN26
 * 50x)`, `ACQstacks 10x JUL26` — en gebruikt dezelfde maandafkortingen als elke
 * datum in de app. Een voorstel, geen dwang: het scherm laat hem aanpassen.
 */
export function suggestBatchName(sjabloonnaam: string, vandaag: Date): string {
  const maand = MAANDEN[vandaag.getMonth()];
  const jaar = String(vandaag.getFullYear()).slice(-2);
  return `${sjabloonnaam} ${maand}${jaar}`;
}

/**
 * De inleidende zin boven de factuurregels.
 *
 * De aantallen staan hier en niet in de regelomschrijving: de zin vertelt het
 * verhaal — wat er getest is, wat eruit kwam, wanneer het is opgeleverd — en de
 * regel houdt het totaal met het bedrag.
 */
export function recurringInvoiceIntro(opts: {
  batchnaam: string;
  opgeleverdOp: Date | string;
  totaal: number;
  tracksQuality: boolean;
  approved?: number | null;
  rejected?: number | null;
}): string {
  const eerste = `Hierbij ontvangt u de factuur voor ${opts.batchnaam}, opgeleverd op ${formatDate(opts.opgeleverdOp)}.`;
  if (!opts.tracksQuality) return eerste;
  return (
    `${eerste} Van de ${opts.totaal} geteste exemplaren zijn er ` +
    `${Number(opts.approved ?? 0)} goedgekeurd en ${Number(opts.rejected ?? 0)} afgekeurd.`
  );
}

export type RecurringTemplateData = {
  id: string;
  name: string;
  customerId: string;
  billing: BillingMode;
  /** Prisma levert Decimal als string aan. */
  unitPrice: number | string | null;
  defaultQuantity: number | string | null;
  lineDescription: string;
  invoiceSubject: string | null;
  tracksQuality: boolean;
};

export type BatchData = {
  id: string;
  name: string;
  generatedInvoiceId: string | null;
  deliveredAt: Date | string;
};

/** Eén factuurregel plus de bijbehorende kopteksten. */
export type RecurringDraft = {
  subject: string;
  intro: string;
  line: {
    description: string;
    quantity: number;
    unitPrice: number;
    total: number;
    lineType: "OTHER";
  };
  subtotal: number;
};

/**
 * De conceptfactuur die uit een voltooide batch volgt.
 *
 * Eén regel van het type OTHER: dit is geen tijd- of kilometerregistratie maar
 * een afgesproken stukprijs, en die hoort niet aan uren gekoppeld te worden.
 */
export function recurringInvoiceDraft(
  sjabloon: RecurringTemplateData,
  batch: BatchData,
  invoer: BatchInput,
): RecurringDraft {
  const totaal = batchTotal(invoer, sjabloon.tracksQuality);
  const prijs = Number(sjabloon.unitPrice ?? 0);
  // Bij een vast bedrag is het gefactureerde aantal altijd 1: het tarief is dan
  // de prijs voor de hele batch en niet per stuk. Zonder deze regel zou een
  // sjabloon dat óók goed- en afkeur bijhoudt dat vaste bedrag met het aantal
  // stuks vermenigvuldigen. Het aantal geteste exemplaren blijft wel in de
  // inleiding staan; dat is het verhaal, niet de rekensom.
  const aantal = sjabloon.billing === "FIXED" ? 1 : totaal;
  const bedrag = Math.round(aantal * prijs * 100) / 100;

  return {
    // Een factuur zonder onderwerp leest als een fout; de batchnaam is altijd
    // beter dan niets.
    subject: sjabloon.invoiceSubject?.trim() || batch.name,
    intro: recurringInvoiceIntro({
      batchnaam: batch.name,
      opgeleverdOp: batch.deliveredAt,
      totaal,
      tracksQuality: sjabloon.tracksQuality,
      approved: invoer.approved,
      rejected: invoer.rejected,
    }),
    line: {
      description: sjabloon.lineDescription,
      quantity: aantal,
      unitPrice: prijs,
      total: bedrag,
      lineType: "OTHER",
    },
    subtotal: bedrag,
  };
}

/**
 * Waarom een batch niet voltooid mag worden, of `null` als het mag.
 *
 * De volgorde is bewust: eerst wat er niet aan te doen is (al gefactureerd, een
 * manier die nog niet bestaat), dan wat de beheerder moet instellen, dan wat de
 * invoer zelf mankeert. Zo krijgt iemand de melding die hem verder helpt.
 */
export function completeBatchDenial(
  sjabloon: RecurringTemplateData,
  batch: BatchData,
  invoer: BatchInput,
): string | null {
  if (batch.generatedInvoiceId) {
    return "Deze batch is al gefactureerd. Verwijder eerst de conceptfactuur als je opnieuw wilt beginnen.";
  }
  if (sjabloon.billing === "HOURS") {
    return "Factureren op uren is nog niet beschikbaar voor herhaalprojecten.";
  }
  if (Number(sjabloon.unitPrice ?? 0) <= 0) {
    return "Stel eerst een tarief in op het sjabloon.";
  }

  const getallen = [invoer.quantity, invoer.approved, invoer.rejected]
    .filter((n) => n !== null && n !== undefined)
    .map(Number);
  if (getallen.some((n) => n < 0)) return "Een aantal kan niet negatief zijn.";

  if (batchTotal(invoer, sjabloon.tracksQuality) <= 0) return "Vul een aantal groter dan nul in.";
  return null;
}
