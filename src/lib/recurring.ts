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
