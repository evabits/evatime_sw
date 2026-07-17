import { z } from "zod";

// Empty input ("" / null / undefined) means "no target" -> undefined.
// Any provided value must be > 0. Callers store `weeklyHours ?? null`.
export const weeklyHoursField = z.preprocess(
  (v) => (v === "" || v == null ? undefined : v),
  z.coerce.number().positive("Moet groter zijn dan 0").optional(),
) as z.ZodType<number | undefined>;
