import { format } from "date-fns";

/**
 * De woon-werkrit: welk sjabloon ervoor geldt, welke dagen hem al hebben, en
 * wanneer aan- of uitzetten niet mag.
 *
 * Geen React en geen Prisma, zodat het te testen is zonder database en zonder
 * scherm — de conventie van dit project.
 *
 * Er is bewust geen aparte registratie "op kantoor geweest": de
 * kilometerregistratie is de enige waarheid en het vinkje weerspiegelt haar.
 * Twee dingen die synchroon moeten blijven is precies waar dit soort
 * automatismen op stukloopt.
 */
export type CommuteTemplate = {
  id: string;
  name: string;
  projectId: string;
  /** Prisma levert Decimal als string aan. */
  km: number | string;
  description?: string | null;
  managedByAdmin: boolean;
  updatedAt: Date | string;
};

/**
 * Het woon-werksjabloon van een medewerker: dat wat een beheerder onder
 * Personeel heeft ingesteld. Zelfgemaakte sjablonen tellen niet mee — anders
 * zou iedereen zijn eigen afstand kunnen bepalen.
 *
 * Heeft iemand er per ongeluk twee, dan wint de laatst gewijzigde. Dat hoort
 * niet te kunnen, maar weigeren zou de medewerker gijzelen voor een datafout
 * die hij niet zelf kan oplossen.
 */
export function pickCommuteTemplate(templates: CommuteTemplate[]): CommuteTemplate | null {
  const beheerd = templates.filter((t) => t.managedByAdmin);
  if (beheerd.length === 0) return null;
  return beheerd.reduce((laatste, kandidaat) =>
    new Date(kandidaat.updatedAt) > new Date(laatste.updatedAt) ? kandidaat : laatste,
  );
}

/**
 * De dagen waarop een woon-werkrit staat, als `yyyy-MM-dd`.
 *
 * Ontdubbeld: staan er door een eerdere fout twee ritten op één dag, dan is dat
 * één aangevinkte dag en geen twee.
 */
export function commuteDates(ritten: { date: Date | string; commute: boolean }[]): string[] {
  const dagen = new Set<string>();
  for (const rit of ritten) {
    if (rit.commute) dagen.add(format(new Date(rit.date), "yyyy-MM-dd"));
  }
  return [...dagen];
}

/**
 * Wat er weggeschreven wordt als je een dag aanvinkt.
 *
 * De omschrijving valt terug op de naam van het sjabloon: een lege omschrijving
 * zou een naamloze regel in de kilometerlijst opleveren.
 */
export function commuteEntryData(
  sjabloon: CommuteTemplate,
): { projectId: string; km: number; description: string } {
  return {
    projectId: sjabloon.projectId,
    km: Number(sjabloon.km),
    description: sjabloon.description?.trim() || sjabloon.name,
  };
}

/**
 * Waarom het aan- of uitzetten van een dag niet mag, of `null` als het mag.
 *
 * Uitzetten heeft geen sjabloon nodig: dat kan verwijderd zijn nadat de rit is
 * aangemaakt, en dan moet je die rit nog steeds kwijt kunnen.
 */
export function commuteToggleDenial(opts: {
  template: CommuteTemplate | null;
  bestaand: { invoiced: boolean } | null;
  present: boolean;
}): string | null {
  if (opts.present && !opts.template) {
    return "Er is nog geen woon-werksjabloon ingesteld. Vraag een beheerder dit onder Personeel in te stellen.";
  }
  if (!opts.present && opts.bestaand?.invoiced) {
    return "Deze rit is al gefactureerd en kan niet meer worden verwijderd";
  }
  return null;
}
