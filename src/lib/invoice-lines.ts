import { resolveHourRate, type RateEntry } from "./rates";
import { kmRate } from "./report-totals";
import { formatDate } from "./utils";

/**
 * De opbouw van elke factuurregel: datum, wie het deed, waar het op geboekt is
 * en wat er is ingevuld. Eén vorm voor uren, ritten en uitgaven, want een
 * factuur waarop de regels verschillend zijn opgebouwd leest als drie facturen.
 *
 * Lege stukken vallen weg in plaats van als streepje of dubbele scheiding te
 * blijven staan; blijft er niets over, dan draagt `terugval` de regel.
 */
function regelOmschrijving(
  datum: string | Date,
  wie: string | undefined,
  project: string | undefined,
  eigen: string | null | undefined,
  terugval: string,
): string {
  const delen = [formatDate(datum), wie, project, eigen?.trim()].filter(
    (d): d is string => !!d && d.length > 0,
  );
  return delen.length > 0 ? delen.join(" — ") : terugval;
}

/** Datum eerst, dan naam: zonder vaste volgorde is een lange factuur onleesbaar. */
function opDatumEnNaam<T extends { date: string | Date; user?: { name?: string } | null }>(
  a: T,
  b: T,
): number {
  const da = new Date(a.date).getTime();
  const db = new Date(b.date).getTime();
  return da - db || (a.user?.name ?? "").localeCompare(b.user?.name ?? "");
}

export type HourEntryForInvoice = RateEntry & {
  id: string;
  date: string | Date;
  hours: number | string;
  description?: string | null;
  user?: { name?: string; workLevel?: import("./work-levels").WorkLevel | null } | null;
  project?: { id: string; name: string } | null;
};

export type HourInvoiceLine = {
  description: string;
  quantity: number;
  unitPrice: number;
  timeEntryIds: string[];
};

/**
 * Eén factuurregel per urenregistratie.
 *
 * Er wordt niet meer gegroepeerd: de klant wil zien wie wat op welke dag heeft
 * gedaan, en dat is precies wat groeperen weggooide. Het werkniveau staat er
 * niet meer bij — dat zat er alleen in om twee tarieven van hetzelfde project
 * uit elkaar te houden, en met een regel per registratie zegt de naam van de
 * medewerker meer.
 *
 * Een regel zonder tarief valt weg: `unitPrice` moet van de factuurroute
 * positief zijn, en het scherm laat zo'n regel daarom ook niet aanvinken.
 */
export function hourInvoiceLines(entries: HourEntryForInvoice[]): HourInvoiceLine[] {
  return entries
    .filter((e) => resolveHourRate(e) != null)
    .slice()
    .sort(opDatumEnNaam)
    .map((e) => ({
      description: regelOmschrijving(
        e.date,
        e.user?.name,
        e.project?.name,
        e.description,
        "Werkzaamheden",
      ),
      quantity: Number(e.hours),
      unitPrice: resolveHourRate(e)!,
      timeEntryIds: [e.id],
    }));
}

export type KmEntryForInvoice = {
  id: string;
  date: string | Date;
  km: number | string;
  description?: string | null;
  rateOverride?: number | string | null;
  user?: { name?: string } | null;
  project?: { name?: string; defaultKmRate?: number | string | null } | null;
};

export type KmInvoiceLine = {
  description: string;
  quantity: number;
  unitPrice: number;
  kmEntryIds: string[];
};

/**
 * Eén factuurregel per rit, met dezelfde opbouw als de uren.
 *
 * Een rit zonder tarief valt weg in plaats van tegen nul euro mee te gaan: nul
 * per kilometer is geen factureerbaar tarief.
 */
export function kmInvoiceLines(entries: KmEntryForInvoice[]): KmInvoiceLine[] {
  return entries
    .filter((e) => kmRate(e) > 0)
    .slice()
    .sort(opDatumEnNaam)
    .map((e) => ({
      description: regelOmschrijving(
        e.date,
        e.user?.name,
        e.project?.name,
        e.description,
        "Reiskosten",
      ),
      quantity: Number(e.km),
      unitPrice: kmRate(e),
      kmEntryIds: [e.id],
    }));
}

export type ExpenseForInvoice = {
  id: string;
  date: string | Date;
  amount: number | string;
  description?: string | null;
  category?: { name: string } | null;
  user?: { name?: string } | null;
  project?: { name?: string } | null;
};

export type ExpenseInvoiceLine = {
  description: string;
  quantity: number;
  unitPrice: number;
  expenseIds: string[];
};

/**
 * Zet uitgaven om naar factuurregels: één regel per uitgave, niet gegroepeerd.
 *
 * Dezelfde opbouw als uren en ritten: datum, medewerker, project en dan wat de
 * uitgave zelf zegt.
 *
 * Zonder eigen omschrijving valt hij terug op de categorie; is die er ook niet,
 * dan draagt de datum met de medewerker de regel, en anders blijft "Uitgave"
 * over — een factuurregel zonder omschrijving is geen factuurregel.
 *
 * Een bedrag van nul of minder valt weg, net als een urenregel zonder tarief:
 * de factuurroute eist een positieve prijs.
 */
export function expenseInvoiceLines(expenses: ExpenseForInvoice[]): ExpenseInvoiceLine[] {
  return expenses
    .filter((e) => Number(e.amount) > 0)
    .slice()
    .sort(opDatumEnNaam)
    .map((e) => ({
      description: regelOmschrijving(
        e.date,
        e.user?.name,
        e.project?.name,
        e.description?.trim() || e.category?.name,
        "Uitgave",
      ),
      quantity: 1,
      unitPrice: Number(e.amount),
      expenseIds: [e.id],
    }));
}
