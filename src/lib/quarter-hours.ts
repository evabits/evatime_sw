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
 * Rondt uren af op het dichtstbijzijnde kwartier, precies op de helft naar
 * boven.
 *
 * Hiermee hoeft niemand meer zelf uit te rekenen wat 9:00 tot 17:07 in
 * kwartieren is. Het afronden hoort in het scherm en niet op de server: een
 * API-verzoek met 7,67 moet geweigerd blijven worden, want daar zou het een
 * gegeven veranderen dat niemand heeft aangepast. `isQuarter` blijft daarom
 * gewoon bestaan naast deze functie.
 *
 * Naar nul afronden mag: wie 0,1 invult krijgt 0 terug en loopt daarmee tegen
 * de bestaande eis dat uren positief zijn. Er wordt bewust geen minimum van een
 * kwartier opgelegd — daar een kwartier van maken is tijd verzinnen die niet
 * gewerkt is, en dat is erger dan een melding.
 *
 * De uitkomst gaat door dezelfde afronding op twee decimalen als
 * `hoursBetween`, want hij belandt in dezelfde `Decimal(5,2)`-kolom. Een
 * veelvoud van een kwartier heeft hooguit twee decimalen, dus die stap kan het
 * resultaat niet meer van een kwartier af halen.
 */
export function toQuarter(hours: number): number {
  return Math.round((Math.round(hours / QUARTER) * QUARTER) * 100) / 100;
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

/**
 * Vult een getypt tijdstip aan tot `HH:MM`.
 *
 * De tijdvelden zijn tekstvelden en geen `type="time"` — dat laatste rendert
 * volgens de taal van de browser en toont dan AM/PM, wat hier niet gewenst is.
 * Daarmee wordt typen de gewone weg, en `9:00` intikken is dan volstrekt
 * normaal. Zonder deze stap zou dat de melding "de eindtijd moet ná de
 * begintijd liggen" opleveren: een leugen over wat er misging.
 *
 * Bewust geen parser. `930` of `9u30` wordt niet omgezet — de keuzelijst is er
 * voor wie niet wil typen, en iets wat soms iets anders begrijpt dan je bedoelde
 * is erger dan niets.
 *
 * Hij oordeelt niet over het bereik: `25:00` komt er onveranderd uit en wordt
 * verderop door `hoursBetween` geweigerd. Eén plek die over geldigheid gaat.
 */
export function normalizeTime(raw: string): string {
  const m = /^(\d{1,2}):(\d{1,2})$/.exec(raw.trim());
  if (!m) return raw;
  return `${m[1].padStart(2, "0")}:${m[2].padStart(2, "0")}`;
}

/**
 * Alle kwartieren van een etmaal als `HH:MM`, voor de keuzelijst bij van-tot.
 *
 * Berekend uit `QUARTER` en niet met de hand uitgeschreven: een lijst die een
 * waarde aanbiedt die het formulier daarna afrondt, is erger dan geen lijst.
 */
export const TIME_CHOICES: string[] = Array.from({ length: 24 / QUARTER }, (_, i) => {
  const minuten = i * QUARTER * 60;
  return `${String(Math.floor(minuten / 60)).padStart(2, "0")}:${String(minuten % 60).padStart(2, "0")}`;
});

/**
 * Kwartieren van een kwartier tot twaalf uur, voor de keuzelijst bij het
 * uren-veld. Twaalf is ruim boven een lange werkdag; wie meer boekt typt het.
 */
export const HOUR_CHOICES: number[] = Array.from({ length: 12 / QUARTER }, (_, i) => (i + 1) * QUARTER);

function minutenOpDeDag(waarde: string): number | null {
  const m = /^(\d{2}):(\d{2})$/.exec(waarde);
  if (!m) return null;
  const uren = Number(m[1]);
  const minuten = Number(m[2]);
  if (uren > 23 || minuten > 59) return null;
  return uren * 60 + minuten;
}

/**
 * Het tijdvak zoals het in de urenlijst komt te staan: `09:00–17:00`, met de
 * pauze erachter als die er is.
 *
 * Geeft null zodra er geen volledig tijdvak is. Eén van de twee tijden zegt
 * niets — "vanaf 09:00" zonder eindtijd is geen tijdvak — en wie rechtstreeks
 * een aantal uren invult heeft ze allebei niet.
 */
export function formatTimeRange(
  start: string | null | undefined,
  end: string | null | undefined,
  breakMinutes?: number | null,
): string | null {
  const van = start?.trim();
  const tot = end?.trim();
  if (!van || !tot) return null;

  const pauze = breakMinutes && breakMinutes > 0 ? ` (${breakMinutes} min pauze)` : "";
  // Een liggend streepje tussen tijden, geen koppelteken: dit is een bereik.
  return `${normalizeTime(van)}–${normalizeTime(tot)}${pauze}`;
}

/**
 * Het zod-veld voor een kloktijd: `HH:MM`, of leeg.
 *
 * Leeg komt binnen als "", null of undefined en gaat er als null uit, zodat de
 * database geen lege tekst krijgt waar "niet ingevuld" bedoeld is.
 */
export const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;
