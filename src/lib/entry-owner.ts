import { isAdmin } from "./roles";

/**
 * Bepaalt onder wiens naam een nieuwe of bijgewerkte registratie komt te staan.
 * Alleen een admin mag een andere medewerker opgeven; bij iedereen anders wordt
 * het meegestuurde userId genegeerd (zelfde patroon als rateOverride).
 */
export function resolveEntryUserId(
  role: string,
  sessionUserId: string,
  requestedUserId?: string | null,
): string {
  if (isAdmin(role) && requestedUserId) return requestedUserId;
  return sessionUserId;
}

export type EntryMutationVerdict = "ok" | "not-found" | "forbidden" | "invoiced";

/** Mag deze gebruiker een bestaande registratie wijzigen of verwijderen? */
export function checkEntryMutation(
  role: string,
  sessionUserId: string,
  entry: { userId: string; invoiced: boolean } | null,
): EntryMutationVerdict {
  if (!entry) return "not-found";
  if (!isAdmin(role) && entry.userId !== sessionUserId) return "forbidden";
  if (entry.invoiced) return "invoiced";
  return "ok";
}
