import { isAdmin } from "./roles";

export type NewProjectInput = {
  status: string;
  customerId?: string | null;
  defaultKmRate?: number | null;
  levelRates?: unknown[] | null;
  billable?: boolean;
  memberIds?: string[] | null;
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
  if (input.defaultKmRate != null || (input.levelRates?.length ?? 0) > 0)
    return "Een conceptproject kan geen tarieven hebben";
  // billable: false is a real attempt to change the schema default (true) and
  // is refused, same as the other fields above. billable: true/undefined is
  // indistinguishable from doing nothing, so it's allowed through — refusing
  // it would just add friction with no protective value.
  if (input.billable === false) return "Medewerkers kunnen factureerbaarheid niet aanpassen";
  // The route always makes the caller a member of the concept project it
  // creates, regardless of what's sent here — so a non-admin never needs to
  // pass memberIds. Letting it through anyway would let them hand booking
  // rights on their bare project to arbitrary other users via a raw API call.
  if ((input.memberIds?.length ?? 0) > 0)
    return "Medewerkers kunnen geen deelnemers toewijzen bij het aanmaken van een project";
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

export type MergeProject = { id: string; status: string; archivedAt: Date | null };

export type InvoicedCounts = { timeEntries: number; kmEntries: number; expenses: number };

/**
 * Waarom een conceptproject NIET met een doelproject mag worden samengevoegd,
 * of null als het mag. Zelfde vorm als projectCreateDenialReason hierboven.
 *
 * De volgorde is opzet. Bestaan gaat voor alles, want zonder de projecten valt
 * er niets te zeggen. "Met zichzelf" komt vóór de statuscontrole omdat dat de
 * begrijpelijkste melding is voor wat overduidelijk een vergissing is. De
 * factuurcontroles staan achteraan: ze zijn het duurst om op te halen en het
 * zeldzaamst, en de goedkopere weigeringen hebben dan al afgevangen.
 *
 * Gefactureerd is een harde stop en geen waarschuwing: een factuurregel die na
 * het samenvoegen naar een ander project verwijst, is niet uit te leggen aan
 * wie die factuur controleert.
 */
export function projectMergeDenialReason(
  source: MergeProject | null,
  target: MergeProject | null,
  invoiced: InvoicedCounts,
): string | null {
  if (!source) return "Het bronproject bestaat niet";
  if (!target) return "Het doelproject bestaat niet";
  if (source.id === target.id) return "Een project kan niet met zichzelf worden samengevoegd";
  if (source.status !== "CONCEPT") return "Alleen een conceptproject kan worden samengevoegd";
  if (source.archivedAt) return "Een gearchiveerd project kan niet worden samengevoegd";
  if (target.archivedAt) return "Het doelproject is gearchiveerd";
  if (invoiced.timeEntries > 0) return "Er staan gefactureerde uren op dit project";
  if (invoiced.kmEntries > 0) return "Er staan gefactureerde kilometers op dit project";
  if (invoiced.expenses > 0) return "Er staan gefactureerde uitgaven op dit project";
  return null;
}
