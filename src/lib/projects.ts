import { isAdmin } from "./roles";

export type NewProjectInput = {
  status: string;
  customerId?: string | null;
  defaultHourlyRate?: number | null;
  defaultKmRate?: number | null;
};

/**
 * Returns a denial reason string if `role` may NOT create the given project,
 * or null if creation is allowed. Non-admins may only create bare CONCEPT
 * projects (no customer, no rates).
 */
export function projectCreateDenialReason(role: string, input: NewProjectInput): string | null {
  if (isAdmin(role)) return null;
  if (input.status !== "CONCEPT") return "Medewerkers kunnen alleen conceptprojecten aanmaken";
  if (input.customerId) return "Een conceptproject kan geen klant hebben";
  if (input.defaultHourlyRate != null || input.defaultKmRate != null)
    return "Een conceptproject kan geen tarieven hebben";
  return null;
}

export type ProjectLike = { customer?: { id: string } | null };

/**
 * Splits projects for the time-entry dropdown. `matched` is the projects that
 * belong to the selected customer (or all customer-bearing projects when no
 * customer is selected); `customerless` is every project with no customer and
 * is ALWAYS returned so those projects stay bookable regardless of the filter.
 */
export function partitionProjectsByCustomer<T extends ProjectLike>(
  projects: T[],
  selectedCustomerId: string,
): { matched: T[]; customerless: T[] } {
  const customerless = projects.filter((p) => !p.customer);
  const matched =
    selectedCustomerId === ""
      ? projects.filter((p) => p.customer)
      : projects.filter((p) => p.customer?.id === selectedCustomerId);
  return { matched, customerless };
}
