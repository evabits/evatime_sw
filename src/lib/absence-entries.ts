import { workingDaysBetween } from "./working-days";
import { scheduledHoursOn, type WeekSchedule } from "./work-schedule";
import { QUARTER } from "./quarter-hours";

/**
 * Het project waarop verlof van een bepaalde soort geboekt wordt.
 *
 * De projecten worden NIET automatisch aangemaakt: een admin zet ze klaar op
 * /projects, niet-factureerbaar en zonder deelnemers. Dat laatste maakt ze
 * onbereikbaar voor handmatige invoer — de invoerformulieren tonen alleen
 * projecten waarvan je deelnemer bent — zodat goedkeuring de enige weg naar een
 * verlofregel is.
 *
 * Een klant mógen ze hebben, en in dit bedrijf hangen ze onder EVAbits B.V. Het
 * dashboard waarschuwt namelijk over projecten zonder klant, en die waarschuwing
 * sloeg voorheen uitsluitend op deze vijf. Zie findAbsenceProject in
 * absence-project.ts: dat zoekt op naam en filtert niet meer op klant.
 *
 * Ontbreekt een project, dan weigert de goedkeuring met de naam erbij. Een
 * project dat uit het niets verschijnt is later moeilijk te doorgronden; een
 * weigering die zegt wat je mist niet.
 *
 * De namen zijn gelijk aan de bestaande labels in het afwezigheidsscherm, op
 * VACATION na: daar heet die "Vakantie", hier "Vakantieverlof", omdat de naam
 * in de projectkolom naast echte projectnamen komt te staan.
 */
export const ABSENCE_PROJECT_NAMES: Record<string, string> = {
  VACATION: "Vakantieverlof",
  SICK: "Ziekteverlof",
  PARENTAL_LEAVE: "Ouderschapsverlof",
  SPECIAL_LEAVE: "Bijzonder verlof",
  UNPAID_LEAVE: "Onbetaald verlof",
};

/**
 * Verdeelt het totaal van een aanvraag over de gegeven dagen, in kwartieren.
 *
 * Er wordt in hele kwartiereenheden gerekend en niet in centen: daardoor is elk
 * getal dat hieruit komt per constructie een kwartier, net als elk urengetal dat
 * een mens zelf invoert. De eerste dagen krijgen het restje erbij, niet de
 * laatste — bij een lange periode zou de laatste dag anders structureel de
 * vreemde eend zijn.
 *
 * De som is exact het aangevraagde totaal zolang dat totaal zelf een kwartier
 * is, en dat bewaakt de invoercontrole aan de voorkant. Een oude aanvraag van
 * vóór die regel wordt op het dichtstbijzijnde kwartier afgerond; dat scheelt
 * hooguit 7½ minuut en alleen bij wat er al stond.
 *
 * Een dag die geen kwartier krijgt levert geen urenregel op. Een regel van nul
 * uur boeken heeft geen betekenis, en `patternedEntries` doet hetzelfde voor
 * dagen waarop het patroon nul staat.
 */
export function splitHoursOverDays(
  totalHours: number,
  days: string[],
): Array<{ date: string; hours: number }> {
  if (days.length === 0) return [];

  const units = Math.round(totalHours / QUARTER);
  const basis = Math.floor(units / days.length);
  const rest = units % days.length;

  return days
    .map((date, i) => ({ date, hours: (basis + (i < rest ? 1 : 0)) * QUARTER }))
    .filter((r) => r.hours > 0);
}

/**
 * De urenregels die een weekpatroon oplevert over een gegeven reeks dagen.
 *
 * Dagen waarop het patroon nul staat vallen weg — een regel van nul uur is
 * ruis in de tijdlijn. Weekenddagen die per ongeluk in `days` zitten vallen
 * ook weg, want `scheduledHoursOn` kent geen weekendvelden en geeft daar 0.
 *
 * De dagen worden aangereikt in plaats van hier berekend, omdat de
 * goedkeuringsroute ze al bepaald heeft voor zijn eigen controle op een
 * periode zonder werkdagen.
 */
export function patternedEntries(
  pattern: WeekSchedule,
  days: string[],
): Array<{ date: string; hours: number }> {
  return days
    .map((date) => ({ date, hours: scheduledHoursOn(pattern, date) }))
    .filter((r) => r.hours > 0);
}

/**
 * Wat een patroon over een periode oplevert: de regels én het totaal.
 *
 * Dit is wat het formulier toont vóór het opslaan en wat de server als
 * `hours` wegschrijft. Dat het één functie is, is het punt: het getal dat de
 * gebruiker ziet en het getal dat wordt opgeslagen komen uit dezelfde
 * berekening en kunnen niet uiteenlopen.
 *
 * Het totaal wordt afgerond op twee decimalen omdat de uren `Decimal(4,2)`
 * zijn; een som van vier keer 6,4 landt onafgerond op 25.599999999999998.
 */
export function patternSummary(
  pattern: WeekSchedule,
  from: string,
  to: string,
): { entries: Array<{ date: string; hours: number }>; total: number } {
  const entries = patternedEntries(pattern, workingDaysBetween(from, to));
  const total = Math.round(entries.reduce((som, e) => som + e.hours, 0) * 100) / 100;
  return { entries, total };
}

/**
 * De dagen uit `dagen` waarop het weekrooster werk kent.
 *
 * Zonder rooster verandert er niets: dan is elke werkdag een werkdag, precies
 * zoals het altijd ging. Mét rooster vallen de vaste vrije dagen weg, zodat een
 * week verlof van iemand die maandags niet werkt vier regels oplevert en niet
 * vijf met een uitgesmeerde maandag erbij.
 *
 * Laat het rooster geen enkele dag over, dan geeft hij alle dagen terug. Dat
 * gebeurt wanneer iemand uitdrukkelijk verlof opgeeft op een vaste vrije dag;
 * het formulier stelt daar nul uur voor, dus wie er toch een getal intypt
 * bedoelt die dag. Uren stil laten verdwijnen is dan het slechtere antwoord.
 */
function roosterDagen(schedule: WeekSchedule | null, dagen: string[]): string[] {
  if (!schedule) return dagen;
  const werkdagen = dagen.filter((d) => scheduledHoursOn(schedule, d) > 0);
  return werkdagen.length > 0 ? werkdagen : dagen;
}

/**
 * Wat een verlofaanvraag oplevert: de urenregels, of de reden dat het er geen
 * zijn.
 *
 * Deze functie bestaat omdat drie plekken hem nodig hebben — een admin die een
 * aanvraag aanmaakt, het goedkeuren, en een admin die een goedgekeurde aanvraag
 * wijzigt. Drie kopieën van deze keuze zouden vroeg of laat uiteenlopen, en dan
 * wijkt de tijdlijn af van de aanvraag zonder dat iets klaagt.
 *
 * Hij geeft de weigering terug als waarde en niet als HTTP-antwoord, zodat hij
 * los van een route te testen is. De aanroeper maakt er een 400 van.
 *
 * Het weekrooster van de medewerker gaat als laatste argument mee en bepaalt
 * op welke dagen een aanvraag zónder patroon mag landen. Een aanvraag mét
 * patroon raakt het niet: dat patroon is een uitdrukkelijke keuze van de
 * aanvrager en gaat vóór het rooster.
 */
export type AbsenceLinesResult =
  | { ok: true; entries: Array<{ date: string; hours: number }> }
  | { ok: false; error: string };

export function absenceLines(
  hours: number,
  pattern: WeekSchedule | null,
  from: string,
  to: string,
  schedule: WeekSchedule | null = null,
): AbsenceLinesResult {
  const dagen = workingDaysBetween(from, to);
  if (dagen.length === 0) {
    return { ok: false, error: "Deze periode bevat geen werkdagen" };
  }

  // Met patroon: alleen de dagen die erop passen, met de uren van die dag; het
  // opgegeven totaal doet dan niet mee. Zonder patroon, mét rooster: eerst
  // kijken of het opgegeven totaal het roostertotaal is — dat is precies het
  // getal dat het dialoog voorstelde via patternSummary. Is dat zo, dan komen
  // de uren dag voor dag van het rooster zelf, niet plat verdeeld: bij een
  // ongelijk rooster (0/8/8/8/4) zou plat verdelen 7,00 uur op de vrijdag van
  // vier boeken. Week de aanvrager af — een halve dag, bijvoorbeeld — dan is er
  // niets om uit het rooster te lezen en geldt de platte verdeling, zoals altijd.
  let entries: Array<{ date: string; hours: number }>;
  if (pattern) {
    entries = patternedEntries(pattern, dagen);
  } else if (schedule) {
    const roosterUitkomst = patternSummary(schedule, from, to);
    entries =
      roosterUitkomst.total === hours
        ? roosterUitkomst.entries
        : splitHoursOverDays(hours, roosterDagen(schedule, dagen));
  } else {
    entries = splitHoursOverDays(hours, dagen);
  }

  // Alleen bereikbaar mét patroon: een woensdagpatroon over maandag en dinsdag.
  // Zonder patroon kan dit niet, want de invoercontrole eist een positief
  // veelvoud van 0,25 en dat levert altijd minstens één kwartier op.
  if (entries.length === 0) {
    return { ok: false, error: "Deze periode bevat geen dagen die op het patroon passen" };
  }

  return { ok: true, entries };
}
