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
 * omdat een modulo op floating point net naast nul kan landen. Dat vergt hier
 * geen marge: 0,25 is een macht van twee (2⁻²) en dus exact weer te geven in
 * binaire floating point, dus elk geldig veelvoud van een kwartier deelt
 * precies op — een tolerantie zou alleen een net-niet-kwartier als
 * `0,2500000001` ten onrechte doorlaten. `Number.isInteger` geeft vanzelf
 * `false` voor `NaN` en `Infinity`, dus een aparte `Number.isFinite`-check is
 * overbodig.
 *
 * De functie oordeelt alleen over de stap, niet over het teken of het bereik:
 * `isQuarter(-0.5)` is `true`. Callers die alleen positieve of niet-negatieve
 * uren toestaan, moeten dat zelf afdwingen (`.positive()`, `.min(0)`, e.d.).
 */
export function isQuarter(hours: number): boolean {
  return Number.isInteger(hours / QUARTER);
}

/**
 * Het aantal uren tussen twee tijdstippen op dezelfde dag, beide als `HH:MM`,
 * minus een eventuele pauze in minuten.
 *
 * Geeft `null` wanneer een van beide tijdstippen ontbreekt, onleesbaar is, of de
 * eindtijd niet ná de begintijd ligt. Een dienst over middernacht bestaat hier
 * niet, dus een omgekeerd paar is altijd een typefout en nooit een nachtdienst.
 *
 * De pauze zit in deze functie en niet in een tweede ernaast, zodat er één plek
 * blijft waar een tijdvak uren wordt; een volgend scherm kan dan niet de
 * verkeerde kiezen. Weglaten is hetzelfde als nul.
 *
 * Ook `null` wanneer de pauze het tijdvak opeet of overtreft — van 9:00 tot 9:30
 * met een uur pauze is geen negatieve dag maar een typefout — en wanneer de
 * pauze negatief of geen getal is, want dat zou uren bíjtellen.
 *
 * Over de stap van een kwartier oordeelt deze functie niet, net zomin als hij
 * dat over het tijdvak doet: een pauze van 20 minuten levert gewoon 7,67 op. De
 * aanroeper weigert dat met `isQuarter`, en kan de melding dan bij het veld
 * zetten waar de fout zit.
 *
 * Het resultaat wordt afgerond op twee decimalen omdat het in een
 * `Decimal(5,2)`-kolom belandt.
 */
export function hoursBetween(from: string, to: string, pauseMinutes = 0): number | null {
  const begin = minutenOpDeDag(from);
  const eind = minutenOpDeDag(to);
  if (begin === null || eind === null || eind <= begin) return null;
  if (!Number.isFinite(pauseMinutes) || pauseMinutes < 0) return null;
  const netto = eind - begin - pauseMinutes;
  if (netto <= 0) return null;
  return Math.round((netto / 60) * 100) / 100;
}

function minutenOpDeDag(waarde: string): number | null {
  const m = /^(\d{2}):(\d{2})$/.exec(waarde);
  if (!m) return null;
  const uren = Number(m[1]);
  const minuten = Number(m[2]);
  if (uren > 23 || minuten > 59) return null;
  return uren * 60 + minuten;
}
