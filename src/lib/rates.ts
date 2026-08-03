import { z } from "zod";
import { WORK_LEVEL_ORDER, type WorkLevel } from "./work-levels";

/** De payload-vorm voor tarieven per niveau op een klant of project. */
export const levelRatesField = z
  .array(
    z.object({
      level: z.enum(WORK_LEVEL_ORDER as [string, ...string[]]),
      rate: z.number().positive(),
    }),
  )
  .optional();

export type LevelRate = { level: WorkLevel; rate: number | string };

export type RateEntry = {
  rateOverride?: number | string | null;
  workLevel?: WorkLevel | null;
  user?: { workLevel?: WorkLevel | null } | null;
  project?: {
    levelRates?: LevelRate[];
    customer?: { levelRates?: LevelRate[] } | null;
  } | null;
};

/**
 * Het niveau dat voor deze regel geldt: de momentopname op de regel zelf, en
 * anders het huidige niveau van de eigenaar. Die tweede helft is de
 * overgangsregel voor regels van vóór de invoering van werkniveaus.
 */
export function effectiveWorkLevel(entry: RateEntry): WorkLevel | null {
  return entry.workLevel ?? entry.user?.workLevel ?? null;
}

function findRate(rates: LevelRate[] | undefined, level: WorkLevel): number | null {
  const hit = rates?.find((r) => r.level === level);
  return hit == null ? null : Number(hit.rate);
}

/**
 * Het uurtarief voor een urenregel, of null als er geen te bepalen valt.
 *
 * null betekent onbepaalbaar, niet nul: aanroepers tonen "Geen tarief" en
 * laten zo'n regel buiten de omzet, in plaats van hem stil als € 0,00 mee te
 * rekenen.
 */
export function resolveHourRate(entry: RateEntry): number | null {
  if (entry.rateOverride != null && entry.rateOverride !== "") return Number(entry.rateOverride);
  const level = effectiveWorkLevel(entry);
  if (!level) return null;
  return (
    findRate(entry.project?.levelRates, level) ??
    findRate(entry.project?.customer?.levelRates, level)
  );
}
