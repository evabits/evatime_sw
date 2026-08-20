import { z } from "zod";
import { WORK_LEVEL_ORDER } from "./work-levels";

// Empty input ("" / null / undefined) means "no target" -> undefined.
// Any provided value must be > 0. Callers store `weeklyHours ?? null`.
export const weeklyHoursField = z.preprocess(
  (v) => (v === "" || v == null ? undefined : v),
  z.coerce.number().positive("Moet groter zijn dan 0").optional(),
) as z.ZodType<number | undefined>;

// Peildatum van het opgenomen-totaal, als YYYY-MM-DD. Leeg betekent "geen
// peildatum" en laat het saldo op het lopende jaar staan.
export const vacationOpeningDateField = z.preprocess(
  (v) => (v === "" || v == null ? undefined : v),
  z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Datum als jjjj-mm-dd").optional(),
) as z.ZodType<string | undefined>;

// Het totaal aantal vakantie-uren dat tot de peildatum is opgenomen. Nooit
// negatief: je kunt geen uren terugkrijgen.
export const vacationOpeningUsedField = z.preprocess(
  (v) => (v === "" || v == null ? undefined : v),
  z.coerce.number().min(0, "Kan niet negatief zijn").optional(),
) as z.ZodType<number | undefined>;

// Peildatum van het urensaldo, als YYYY-MM-DD. Leeg betekent: deze medewerker
// heeft geen saldo. Dat de datum op de eerste van een maand moet liggen wordt
// niet hier gecontroleerd maar met validateOpeningDate — die melding hoort bij
// de rekenkunde en niet bij het formaat.
export const overtimeOpeningDateField = z.preprocess(
  (v) => (v === "" || v == null ? undefined : v),
  z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Datum als jjjj-mm-dd").optional(),
) as z.ZodType<string | undefined>;

// De beginstand in uren. Mag negatief zijn: een medewerker kan met een tekort
// beginnen, anders dan bij de vakantie-uren hierboven.
export const overtimeOpeningHoursField = z.preprocess(
  (v) => (v === "" || v == null ? undefined : v),
  z.coerce.number().optional(),
) as z.ZodType<number | undefined>;

// Empty input ("" / null / undefined) means "not set" -> undefined.
// Callers store `workLevel ?? null`.
export const workLevelField = z.preprocess(
  (v) => (v === "" || v == null ? undefined : v),
  z.enum(WORK_LEVEL_ORDER as [string, ...string[]]).optional(),
) as z.ZodType<string | undefined>;
