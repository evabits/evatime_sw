/**
 * Uren gaan in stappen van een kwartier.
 *
 * Dit bestand is de enige plek waar die regel staat. Hij geldt op vier
 * API-routes en op drie schermen, en als de schermen iets anders zouden
 * rekenen dan de server, dan zou de gebruiker een melding krijgen die nergens
 * op slaat — of erger, er géén krijgen terwijl zijn invoer stilletjes sneuvelt.
 */

/** Eén kwartier, in uren. */
export const QUARTER = 0.25;

/** De weigering. Server en scherm zeggen letterlijk hetzelfde. */
export const NOT_A_QUARTER = "Uren moeten in stappen van 15 minuten (0,25 uur)";

/**
 * Of een urengetal op een kwartier valt.
 *
 * Nul telt mee: een weekpatroon mag een dag op nul zetten, en dat is geen
 * invoerfout maar "die dag niet".
 *
 * Er wordt in kwartiereenheden gerekend in plaats van met `hours % 0.25`,
 * omdat een modulo op floating point net naast nul kan landen. De marge vangt
 * waarden op die uit een som van kwartieren komen; een echte tiende van een uur
 * ligt daar ruim buiten.
 */
export function isQuarter(hours: number): boolean {
  if (!Number.isFinite(hours)) return false;
  const units = hours / QUARTER;
  return Math.abs(units - Math.round(units)) < 1e-9;
}

/**
 * Het aantal uren tussen twee tijdstippen op dezelfde dag, beide als `HH:MM`.
 *
 * Geeft `null` wanneer een van beide ontbreekt, onleesbaar is, of de eindtijd
 * niet ná de begintijd ligt. Een dienst over middernacht bestaat hier niet, dus
 * een omgekeerd paar is altijd een typefout en nooit een nachtdienst.
 *
 * Het resultaat wordt afgerond op twee decimalen omdat het in een
 * `Decimal(5,2)`-kolom belandt. Een tijdvak dat op een kwartier uitkomt is
 * daarmee exact; een tijdvak dat dat niet doet levert een getal op dat verderop
 * door `isQuarter` geweigerd wordt, en dat is de bedoeling.
 */
export function hoursBetween(from: string, to: string): number | null {
  const begin = minutenOpDeDag(from);
  const eind = minutenOpDeDag(to);
  if (begin === null || eind === null || eind <= begin) return null;
  return Math.round(((eind - begin) / 60) * 100) / 100;
}

function minutenOpDeDag(waarde: string): number | null {
  const m = /^(\d{2}):(\d{2})$/.exec(waarde);
  if (!m) return null;
  const uren = Number(m[1]);
  const minuten = Number(m[2]);
  if (uren > 23 || minuten > 59) return null;
  return uren * 60 + minuten;
}
