/**
 * De projectenlijst zoals je hem wilt zien als je er één uit moet kiezen:
 * op klant gesorteerd en op een steekwoord te doorzoeken.
 *
 * Apart van het scherm omdat de volgorde en het filter het werk doen; een
 * keuzelijst die de projecten aanlevert zoals de database ze toevallig
 * teruggaf is precies wat dit vervangt.
 */
export type PickableProject = {
  id: string;
  name: string;
  archivedAt?: Date | string | null;
  customer?: { name: string } | null;
};

export type ProjectOption = {
  id: string;
  /** De naam van het project zelf. */
  name: string;
  /** De klant, of "Zonder klant" als het project er geen heeft. */
  customerName: string;
  /** Wat er in de lijst staat: "Acquaint — Onderhoud". */
  label: string;
};

export const ZONDER_KLANT = "Zonder klant";

/**
 * Gesorteerd op klantnaam, dan op projectnaam, allebei in het Nederlands zodat
 * accenten en hoofdletters vallen zoals je ze in een lijst verwacht.
 *
 * Projecten zonder klant staan achteraan. Ze horen bij niemand, en tussen de
 * klanten in zouden ze bovenaan belanden puur omdat hun klantnaam leeg is.
 *
 * `excludeId` laat het project weg waar je vandaan komt — bij samenvoegen mag
 * de bron nooit ook het doel zijn. Gearchiveerde projecten vallen altijd af.
 */
export function projectOptions(
  projects: PickableProject[],
  opties: { excludeId?: string; zoek?: string } = {},
): ProjectOption[] {
  const gesorteerd = projects
    .filter((p) => !p.archivedAt && p.id !== opties.excludeId)
    .map((p) => {
      const customerName = p.customer?.name?.trim() || ZONDER_KLANT;
      return { id: p.id, name: p.name, customerName, label: `${customerName} — ${p.name}` };
    })
    .sort((a, b) => {
      const aLos = a.customerName === ZONDER_KLANT;
      const bLos = b.customerName === ZONDER_KLANT;
      if (aLos !== bLos) return aLos ? 1 : -1;
      const klant = a.customerName.localeCompare(b.customerName, "nl", { sensitivity: "base" });
      return klant !== 0 ? klant : a.name.localeCompare(b.name, "nl", { sensitivity: "base" });
    });

  return filterProjectOptions(gesorteerd, opties.zoek);
}

/**
 * Alle getypte woorden moeten voorkomen, ergens in klantnaam of projectnaam.
 * Zo vindt "acq juli" het juliproject van Acquaint zonder dat je weet of de
 * klant of het project vooraan staat.
 */
export function filterProjectOptions(options: ProjectOption[], zoek?: string): ProjectOption[] {
  const termen = (zoek ?? "").trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (termen.length === 0) return options;
  return options.filter((o) => {
    const hooiberg = o.label.toLowerCase();
    return termen.every((t) => hooiberg.includes(t));
  });
}
