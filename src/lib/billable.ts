/**
 * Of een registratie factureerbaar is, komt volledig van het project.
 *
 * Drie uitkomsten, en het onderscheid tussen de laatste twee is het punt:
 *   true   het project is geladen en factureerbaar
 *   false  het project is geladen en niet factureerbaar, of er is geen project
 *   null   de projectrelatie is niet meegeladen, dus we weten het niet
 *
 * null mag nooit als false behandeld worden. Vergeet een query zijn include,
 * dan zou een stille false omzet uit een rapport laten verdwijnen zonder dat
 * iets klaagt. Aanroepers tonen null zichtbaar en laten zo'n regel buiten de
 * omzet en buiten de factuur.
 */
export function isBillable(entry: { project?: { billable: boolean } | null }): boolean | null {
  if (!("project" in entry) || entry.project === undefined) return null;
  if (entry.project === null) return false;
  return entry.project.billable;
}

export type BillableDerivation =
  | { status: "ok"; value: boolean; reason: "override" | "all-billable" | "all-non-billable" | "empty" }
  | { status: "needs-choice" };

/**
 * Bepaalt de waarde van Project.billable bij de eenmalige backfill, op basis
 * van de vlaggen die vandaag op de boekingen van dat project staan.
 *
 * Een gemengd project kan er straks maar één zijn; daar weigert deze functie
 * te gokken en moet de gebruiker kiezen.
 */
export function deriveProjectBillable(entryFlags: boolean[], override?: boolean): BillableDerivation {
  if (override !== undefined) return { status: "ok", value: override, reason: "override" };
  if (entryFlags.length === 0) return { status: "ok", value: true, reason: "empty" };
  if (entryFlags.every((f) => f)) return { status: "ok", value: true, reason: "all-billable" };
  if (entryFlags.every((f) => !f)) return { status: "ok", value: false, reason: "all-non-billable" };
  return { status: "needs-choice" };
}
