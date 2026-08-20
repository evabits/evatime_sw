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

/**
 * Is dit een woon-werkrit? Bepaald op de **inhoud** en niet op de herkomst:
 * komen project én kilometers overeen met het beheerde sjabloon, dan is het de
 * woon-werkrit — of iemand hem nu via het sjabloonmenu invoerde of met de hand
 * typte.
 *
 * Eerder keek de server alleen of het sjabloon in het menu gekozen was. Daardoor
 * bleef het vinkje op het urenscherm leeg voor vrijwel de hele historie: van de
 * 121 kilometerregistraties waren er 3 gemarkeerd terwijl er 107 exact op een
 * sjabloon pasten.
 */
export function matchesCommuteTemplate(
  sjabloon: CommuteTemplate | null,
  rit: { projectId: string; km: number | string },
): boolean {
  if (!sjabloon) return false;
  return rit.projectId === sjabloon.projectId && Number(rit.km) === Number(sjabloon.km);
}

/**
 * Waarom deze rit niet mag, of `null` als het mag.
 *
 * Er hoort hoogstens één woon-werkrit per dag te staan. Een tweede rit die óók
 * exact op het sjabloon past wordt daarom geweigerd. Die weigering is bewust
 * nauw: een rit met een andere afstand of op een ander project raakt hem niet,
 * dus twee klantbezoeken op één dag blijven gewoon te boeken.
 */
export function commuteDuplicateDenial(opts: {
  sjabloon: CommuteTemplate | null;
  rit: { projectId: string; km: number | string };
  /** Staat er die dag al een gemarkeerde woon-werkrit van deze medewerker? */
  bestaatAl: boolean;
}): string | null {
  if (!opts.bestaatAl) return null;
  if (!matchesCommuteTemplate(opts.sjabloon, opts.rit)) return null;
  return "Er staat op deze dag al een woon-werkrit. Pas die aan, of gebruik een ander project of een andere afstand.";
}
