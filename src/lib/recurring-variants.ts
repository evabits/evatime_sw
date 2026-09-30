/**
 * De regels rond varianten op een herhaalsjabloon.
 *
 * Los van de route zodat ze te testen zijn zonder database, en op één plek
 * zodat aanmaken en wijzigen dezelfde grenzen hanteren.
 */
export type VariantInput = { id?: string | null; name: string };

/**
 * Waarom deze varianten niet bij dit sjabloon passen, of null als het mag.
 *
 * Varianten en goed-/afkeur sluiten elkaar uit: beide tellen hetzelfde werk,
 * en twee tellingen naast elkaar spreken elkaar vroeg of laat tegen. En alleen
 * bij een stuksprijs, want bij een vast bedrag is het aantal altijd 1 en zou de
 * verdeling over varianten niets aan de factuur veranderen.
 */
export function variantDenial(
  varianten: VariantInput[],
  billing: string,
  tracksQuality: boolean,
): string | null {
  if (varianten.length === 0) return null;
  if (tracksQuality) {
    return "Een sjabloon houdt óf goed- en afkeur bij, óf varianten — niet allebei.";
  }
  if (billing !== "PER_UNIT" && billing !== "NONE") {
    return "Varianten kunnen alleen bij facturatie per stuk of niet facturabel.";
  }
  const namen = varianten.map((v) => v.name.trim());
  if (namen.some((n) => n === "")) return "Geef elke variant een naam.";
  const uniek = new Set(namen.map((n) => n.toLowerCase()));
  if (uniek.size !== namen.length) return "Twee varianten met dezelfde naam kan niet.";
  return null;
}

/**
 * Wat er met de varianten moet gebeuren om bij de nieuwe lijst uit te komen:
 * hernoemen, toevoegen, verwijderen.
 *
 * De volgorde van de lijst is de volgorde op het scherm en op de factuur.
 */
export function variantChanges(
  bestaand: { id: string; name: string; sortOrder: number }[],
  nieuw: VariantInput[],
) {
  const blijft = new Set(nieuw.map((v) => v.id).filter(Boolean) as string[]);
  return {
    verwijderen: bestaand.filter((b) => !blijft.has(b.id)).map((b) => b.id),
    bijwerken: nieuw
      .map((v, i) => ({ ...v, sortOrder: i }))
      .filter((v): v is VariantInput & { id: string; sortOrder: number } => !!v.id)
      .filter((v) => {
        const b = bestaand.find((x) => x.id === v.id);
        return !b || b.name !== v.name.trim() || b.sortOrder !== v.sortOrder;
      })
      .map((v) => ({ id: v.id, name: v.name.trim(), sortOrder: v.sortOrder })),
    toevoegen: nieuw
      .map((v, i) => ({ ...v, sortOrder: i }))
      .filter((v) => !v.id)
      .map((v) => ({ name: v.name.trim(), sortOrder: v.sortOrder })),
  };
}
