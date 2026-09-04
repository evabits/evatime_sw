import { formatHoursDecimal } from "./utils";

/**
 * De meldingen die een medewerker op elke pagina meekrijgt.
 *
 * Ze stonden als kaart op het dashboard, waar kennelijk niemand kwam. Deze
 * lijst is bewust kort: een strook die altijd in beeld staat werkt alleen
 * zolang er zelden iets in staat. Alleen dingen die jíj moet doen horen hier;
 * hoe het bedrijf ervoor staat blijft op het dashboard.
 *
 * Een pure functie, los van de database, zodat de regels te testen zijn zonder
 * er een week aan uren omheen te bouwen.
 */
export type Melding = {
  /** Stabiel per soort, zodat React ze uit elkaar houdt. */
  id: string;
  tekst: string;
  href: string;
};

export type MeldingInput = {
  /** Het lopende functioneringsgesprek, of null als er geen loopt. */
  review: { period: string; status: string } | null;
  /**
   * De uren van deze week tegen het doel tot en met gisteren. Null voor wie
   * geen rooster en geen weekuren heeft: van hem wordt niets verwacht en dan
   * is "je bent achter" een loze klacht.
   */
  uren: { geboekt: number; doel: number } | null;
};

export function meldingenVoor({ review, uren }: MeldingInput): Melding[] {
  const meldingen: Melding[] = [];

  // Alleen zolang hij niet is ingediend. Na het indienen ligt de bal bij de
  // leidinggevende en kan de medewerker er niets meer mee.
  if (review && review.status === "PLANNED") {
    meldingen.push({
      id: "zelfreflectie",
      tekst: `Je zelfreflectie voor ${review.period} staat nog open`,
      href: "/beoordelingen",
    });
  }

  if (uren && uren.doel > 0 && uren.geboekt < uren.doel) {
    meldingen.push({
      id: "uren",
      tekst: `Je uren van deze week zijn niet compleet: ${formatHoursDecimal(uren.geboekt)} van ${formatHoursDecimal(uren.doel)} uur geboekt`,
      href: "/time",
    });
  }

  return meldingen;
}
