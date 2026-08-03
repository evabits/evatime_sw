/**
 * De vier werkniveaus. Bewust een string-union en geen import van de door
 * Prisma gegenereerde enum, zodat clientcomponenten dit type kunnen gebruiken
 * zonder @prisma/client mee te bundelen. De waarden zijn identiek aan de enum
 * in schema.prisma.
 */
export type WorkLevel = "PRODUCTION" | "JUNIOR" | "MEDIOR" | "SENIOR";

/** Van minst naar meest senior; dit is ook de volgorde in elke keuzelijst. */
export const WORK_LEVEL_ORDER: WorkLevel[] = ["PRODUCTION", "JUNIOR", "MEDIOR", "SENIOR"];

export const WORK_LEVEL_LABELS: Record<WorkLevel, string> = {
  PRODUCTION: "Productie",
  JUNIOR: "Junior Engineer",
  MEDIOR: "Medior Engineer",
  SENIOR: "Senior Engineer",
};
