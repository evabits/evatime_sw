import {
  format,
  startOfMonth, endOfMonth, subMonths,
  startOfWeek, endOfWeek, subWeeks,
  startOfYear,
} from "date-fns";

export type PeriodPreset =
  | "this-month"
  | "last-month"
  | "this-week"
  | "last-week"
  | "this-year"
  | "custom";

/** De volgorde waarin de keuzelijst de opties toont. */
export const PERIOD_ORDER: PeriodPreset[] = [
  "this-month",
  "last-month",
  "this-week",
  "last-week",
  "this-year",
  "custom",
];

export const PERIOD_LABELS: Record<PeriodPreset, string> = {
  "this-month": "Deze maand",
  "last-month": "Vorige maand",
  "this-week": "Deze week",
  "last-week": "Vorige week",
  "this-year": "Dit jaar",
  custom: "Aangepast",
};

// Maandag, net als overal elders in deze app.
const WEEK = { weekStartsOn: 1 } as const;

const fmt = (d: Date) => format(d, "yyyy-MM-dd");

/**
 * Zet een preset om in een datumbereik. Geeft null voor "custom", zodat de
 * aanroeper de datums laat staan die de gebruiker zelf heeft ingevuld.
 */
export function resolvePeriod(
  preset: PeriodPreset,
  now: Date,
): { from: string; to: string } | null {
  switch (preset) {
    case "this-month":
      return { from: fmt(startOfMonth(now)), to: fmt(endOfMonth(now)) };
    case "last-month": {
      const ref = subMonths(now, 1);
      return { from: fmt(startOfMonth(ref)), to: fmt(endOfMonth(ref)) };
    }
    case "this-week":
      return { from: fmt(startOfWeek(now, WEEK)), to: fmt(endOfWeek(now, WEEK)) };
    case "last-week": {
      const ref = subWeeks(now, 1);
      return { from: fmt(startOfWeek(ref, WEEK)), to: fmt(endOfWeek(ref, WEEK)) };
    }
    case "this-year":
      // Bewust tot en met vandaag, niet tot en met 31 december.
      return { from: fmt(startOfYear(now)), to: fmt(now) };
    case "custom":
      return null;
  }
}
