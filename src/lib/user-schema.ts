import { z } from "zod";
import { WORK_LEVEL_ORDER } from "./work-levels";

// Empty input ("" / null / undefined) means "no target" -> undefined.
// Any provided value must be > 0. Callers store `weeklyHours ?? null`.
export const weeklyHoursField = z.preprocess(
  (v) => (v === "" || v == null ? undefined : v),
  z.coerce.number().positive("Moet groter zijn dan 0").optional(),
) as z.ZodType<number | undefined>;

// Empty input ("" / null / undefined) means "not set" -> undefined.
// Callers store `workLevel ?? null`.
export const workLevelField = z.preprocess(
  (v) => (v === "" || v == null ? undefined : v),
  z.enum(WORK_LEVEL_ORDER as [string, ...string[]]).optional(),
) as z.ZodType<string | undefined>;
