import { resolveHourRate, effectiveWorkLevel, type RateEntry } from "./rates";
import { WORK_LEVEL_LABELS } from "./work-levels";
import { kmRate } from "./report-totals";

export type HourEntryForInvoice = RateEntry & {
  id: string;
  hours: number | string;
  project?: { id: string; name: string } | null;
};

export type HourInvoiceLine = {
  description: string;
  quantity: number;
  unitPrice: number;
  timeEntryIds: string[];
};

/**
 * Groepeert urenregels tot factuurregels voor de factuuropbouw.
 *
 * Sleutel is project-id + tarief + werkniveau, niet de projectnaam: namen zijn
 * niet uniek in dit schema (Task 2 had daarom al een dubbele-naam-bewaking
 * nodig), dus twee verschillende projecten met hetzelfde tarief zouden anders
 * tot één regel samensmelten met een dubbelzinnige omschrijving en een
 * entry-koppeling die aan het verkeerde project hangt. Het niveau zit in de
 * sleutel zodat twee niveaus die toevallig hetzelfde tarief delen nooit onder
 * hetzelfde label samenvallen — dan zou de omschrijving het niveau van welke
 * entry er toevallig als eerste in de groep stond kunnen tonen, terwijl het
 * bedrag over beide niveaus liep.
 *
 * De omschrijving toont het niveau pas zodra hetzelfde project in meerdere
 * regels uiteenvalt (verschillend tarief en/of niveau); met één regel per
 * project blijft de omschrijving de kale projectnaam, zoals vandaag.
 */
export function groupHourEntriesForInvoice(entries: HourEntryForInvoice[]): HourInvoiceLine[] {
  const withRate = entries.filter((e) => resolveHourRate(e) != null);
  if (withRate.length === 0) return [];

  const grouped = new Map<string, HourEntryForInvoice[]>();
  withRate.forEach((e) => {
    const level = effectiveWorkLevel(e) ?? "";
    const key = `${e.project?.id ?? "geen-project"}|${resolveHourRate(e)}|${level}`;
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key)!.push(e);
  });

  const labelCounts = new Map<string, number>();
  grouped.forEach((groupEntries) => {
    const label = groupEntries[0].project?.name ?? "Werkzaamheden";
    labelCounts.set(label, (labelCounts.get(label) ?? 0) + 1);
  });

  return Array.from(grouped.values()).map((groupEntries) => {
    const label = groupEntries[0].project?.name ?? "Werkzaamheden";
    const rate = resolveHourRate(groupEntries[0])!;
    const level = effectiveWorkLevel(groupEntries[0]);
    const description =
      (labelCounts.get(label) ?? 0) > 1 && level
        ? `${label} (${WORK_LEVEL_LABELS[level]})`
        : label;
    return {
      description,
      quantity: groupEntries.reduce((s, e) => s + Number(e.hours), 0),
      unitPrice: rate,
      timeEntryIds: groupEntries.map((e) => e.id),
    };
  });
}

export type KmEntryForInvoice = {
  id: string;
  km: number | string;
  rateOverride?: number | string | null;
  project?: { defaultKmRate?: number | string | null } | null;
};

export type KmInvoiceLine = {
  description: string;
  quantity: number;
  unitPrice: number;
  kmEntryIds: string[];
};

/**
 * Groepeert kilometerregels tot factuurregels, één per tarief.
 *
 * Hiervoor werd er één regel gemaakt voor de hele selectie, met het tarief van
 * de eerste regel erin. Bij een klant met twee projecten à 0,23 en 0,40 per
 * kilometer werd daarmee alles tegen het laagste van de twee gefactureerd,
 * zonder dat iets erover klaagde. De urenkant groepeert al per tarief; dit is
 * dezelfde gedachte.
 *
 * Er wordt op het tarief gegroepeerd en niet op project: bij één tarief — het
 * gewone geval — blijft het precies één regel "Reiskosten", zoals altijd.
 * Vallen de tarieven uiteen, dan staan er twee regels met dezelfde
 * omschrijving maar een eigen prijs en aantal, en dat is op een factuur
 * gewoon te lezen.
 *
 * Een regel zonder tarief valt weg in plaats van tegen nul euro mee te gaan:
 * nul per kilometer is geen factureerbaar tarief, en `unitPrice` moet van de
 * factuurroute positief zijn. Het scherm laat zo'n regel daarom niet
 * aanvinken, net als bij uren zonder tarief.
 */
export function groupKmEntriesForInvoice(entries: KmEntryForInvoice[]): KmInvoiceLine[] {
  const grouped = new Map<number, KmEntryForInvoice[]>();

  for (const e of entries) {
    const tarief = kmRate(e);
    if (tarief <= 0) continue;
    if (!grouped.has(tarief)) grouped.set(tarief, []);
    grouped.get(tarief)!.push(e);
  }

  return Array.from(grouped.entries()).map(([tarief, groep]) => ({
    description: "Reiskosten",
    quantity: groep.reduce((s, e) => s + Number(e.km), 0),
    unitPrice: tarief,
    kmEntryIds: groep.map((e) => e.id),
  }));
}

export type ExpenseForInvoice = {
  id: string;
  amount: number | string;
  description?: string | null;
  category?: { name: string } | null;
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
 * Uren en kilometers groeperen op tarief omdat hun omschrijving toch vast
 * staat. Bij een uitgave is die omschrijving juist het punt — "Late levering
 * SAMTEC connectors" is wat de klant wil lezen — en die zou bij groeperen
 * verdwijnen.
 *
 * Zonder eigen omschrijving valt hij terug op de categorie; is die er ook niet,
 * dan blijft er "Uitgave" over, want een factuurregel zonder omschrijving is
 * geen factuurregel.
 *
 * Een bedrag van nul of minder valt weg, net als een urenregel zonder tarief:
 * de factuurroute eist een positieve prijs.
 */
export function expenseInvoiceLines(expenses: ExpenseForInvoice[]): ExpenseInvoiceLine[] {
  return expenses
    .filter((e) => Number(e.amount) > 0)
    .map((e) => ({
      description: e.description?.trim() || e.category?.name || "Uitgave",
      quantity: 1,
      unitPrice: Number(e.amount),
      expenseIds: [e.id],
    }));
}
