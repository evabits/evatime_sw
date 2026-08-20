import { z } from "zod";
import { WORK_LEVEL_ORDER } from "./work-levels";

// Leeg ("" of null) betekent "geen target" -> de kolom wordt gewist.
// Ontbreekt de sleutel helemaal (undefined), dan blijft de kolom ongemoeid —
// zelfde onderscheid als bij overtimeOpeningDateField hieronder, en om
// dezelfde reden: de PUT-route op /api/users/[id] schrijft elk veld hier
// alleen weg als het `!== undefined` is, zodat een toekomstig scherm dat dit
// veld niet kent het niet stilzwijgend leegmaakt bij het opslaan van iets
// anders. Any provided value must be > 0.
export const weeklyHoursField = z.preprocess(
  (v) => (v === "" ? null : v),
  z.coerce.number().positive("Moet groter zijn dan 0").optional().nullable(),
) as z.ZodType<number | null | undefined>;

// Peildatum van het opgenomen-totaal, als YYYY-MM-DD. Leeg betekent "geen
// peildatum" en laat het saldo op het lopende jaar staan. Zelfde
// undefined-versus-null-onderscheid als hierboven.
export const vacationOpeningDateField = z.preprocess(
  (v) => (v === "" ? null : v),
  z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Datum als jjjj-mm-dd").optional().nullable(),
) as z.ZodType<string | null | undefined>;

// Het totaal aantal vakantie-uren dat tot de peildatum is opgenomen. Nooit
// negatief: je kunt geen uren terugkrijgen. Zelfde onderscheid als hierboven.
export const vacationOpeningUsedField = z.preprocess(
  (v) => (v === "" ? null : v),
  z.coerce.number().min(0, "Kan niet negatief zijn").optional().nullable(),
) as z.ZodType<number | null | undefined>;

// Peildatum van het urensaldo, als YYYY-MM-DD. Dat de datum op de eerste van
// een maand moet liggen wordt niet hier gecontroleerd maar met
// validateOpeningDate — die melding hoort bij de rekenkunde en niet bij het
// formaat. Zelfde undefined-versus-null-onderscheid als de velden hierboven:
// undefined = sleutel ontbreekt in de aanvraag = kolom blijft ongemoeid. null
// of "" = bewust leeggemaakt = kolom wordt gewist.
export const overtimeOpeningDateField = z.preprocess(
  (v) => (v === "" ? null : v),
  z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Datum als jjjj-mm-dd").optional().nullable(),
) as z.ZodType<string | null | undefined>;

// De beginstand in uren. Mag negatief zijn: een medewerker kan met een tekort
// beginnen, anders dan bij de vakantie-uren hierboven. Zelfde
// undefined-versus-null-onderscheid als overtimeOpeningDateField hierboven,
// om dezelfde reden.
export const overtimeOpeningHoursField = z.preprocess(
  (v) => (v === "" ? null : v),
  z.coerce.number().optional().nullable(),
) as z.ZodType<number | null | undefined>;

// Leeg ("" of null) betekent "niet ingesteld" -> de kolom wordt gewist.
// Zelfde undefined-versus-null-onderscheid als hierboven.
export const workLevelField = z.preprocess(
  (v) => (v === "" ? null : v),
  z.enum(WORK_LEVEL_ORDER as [string, ...string[]]).optional().nullable(),
) as z.ZodType<string | null | undefined>;
