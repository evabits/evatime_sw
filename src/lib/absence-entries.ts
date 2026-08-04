/**
 * Het project waarop verlof van een bepaalde soort geboekt wordt.
 *
 * De projecten worden NIET automatisch aangemaakt: een admin zet ze klaar op
 * /projects, zonder klant, niet-factureerbaar en zonder deelnemers. Dat laatste
 * maakt ze onbereikbaar voor handmatige invoer — de invoerformulieren tonen
 * alleen projecten waarvan je deelnemer bent — zodat goedkeuring de enige weg
 * naar een verlofregel is.
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
 * Verdeelt het totaal van een aanvraag over de gegeven dagen.
 *
 * Elke dag behalve de laatste krijgt het totaal gedeeld door het aantal dagen,
 * naar BENEDEN afgerond op twee decimalen; de laatste dag krijgt het totaal
 * minus de som van de voorgaande. Daarmee is de som exact het aangevraagde
 * totaal — een goedkeuring mag nooit stilzwijgend meer of minder uren boeken
 * dan de medewerker opgaf.
 *
 * Twee decimalen omdat `TimeEntry.hours` een `Decimal(5,2)` is. Fijner afronden
 * laat de database alsnog afkappen en de dagsom stil afwijken.
 */
export function splitHoursOverDays(
  totalHours: number,
  days: string[],
): Array<{ date: string; hours: number }> {
  if (days.length === 0) return [];

  const perDag = Math.floor((totalHours / days.length) * 100) / 100;
  const regels = days.slice(0, -1).map((date) => ({ date, hours: perDag }));
  const rest = Math.round((totalHours - perDag * (days.length - 1)) * 100) / 100;
  regels.push({ date: days[days.length - 1], hours: rest });
  return regels;
}
