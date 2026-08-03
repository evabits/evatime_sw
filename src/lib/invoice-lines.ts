import { resolveHourRate, effectiveWorkLevel, type RateEntry } from "./rates";
import { WORK_LEVEL_LABELS } from "./work-levels";

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
