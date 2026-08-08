/**
 * Wie een gebruiker op een lijstscherm uit beeld heeft geklikt.
 *
 * Twee schermen tonen één regel per medewerker en zijn allebei te lang voor
 * waar ze voor gebruikt worden: de standup, waar de leider zijn eigen mensen
 * wil zien, en de loonverwerking, waar de systeemaccounts elke maand
 * meescrollen. Dat is in beide gevallen een schermvoorkeur en geen
 * organisatiestructuur — er is bewust geen team in het datamodel.
 *
 * Opgeslagen wordt wie is WEGGEKLIKT, niet wie zichtbaar is. Dat verschil telt
 * bij een nieuwe collega: die staat er dan vanzelf bij, in plaats van
 * onzichtbaar te blijven tot iemand eraan denkt hem toe te voegen. In een
 * dagelijks ritueel valt zo iemand lang niet op, en in een maandelijkse
 * loonronde helemaal niet; iemand zien die je niet nodig had is de goedkopere
 * fout.
 */

/**
 * De sleutel in localStorage, met het scherm én het gebruikers-id erin.
 *
 * De scope scheidt de twee schermen: wie op de standup mensen wegklikt bedoelt
 * daar niet mee dat ze ook van de loonlijst af moeten. `"standup"` levert
 * bewust exact de sleutel op die er vóór de loonverwerking al was — anders
 * zouden bestaande gebruikers hun selectie kwijtraken bij een deploy.
 *
 * Het gebruikers-id staat erin omdat er meer dan één persoon op dezelfde
 * computer kan inloggen; zonder id zou de een de selectie van de ander erven.
 * Zelfde opzet als `time-filters:<userId>` in het urenscherm.
 */
export function hiddenStorageKey(scope: "standup" | "payroll", userId: string): string {
  return `${scope}-hidden:${userId}`;
}

/**
 * Leest de opgeslagen selectie. Alles wat niet als een lijst ids te lezen is,
 * levert een lege lijst op — dus iedereen in beeld.
 *
 * Dat is bewust de kant om fout te zitten. Een stukgelopen voorkeur mag nooit
 * stilzwijgend mensen uit de standup laten verdwijnen: iemand over het hoofd
 * zien is duurder dan iemand tonen die er niet toe doet.
 *
 * De aanroeper leest zelf uit localStorage en vangt daar zijn eigen fouten af;
 * die property kan gooien in een browser die site-data blokkeert. Deze functie
 * krijgt daarom de rauwe string en blijft puur.
 */
export function readHiddenIds(raw: string | null): string[] {
  if (!raw) return [];
  let waarde: unknown;
  try {
    waarde = JSON.parse(raw);
  } catch {
    return [];
  }
  if (!Array.isArray(waarde)) return [];
  // Filteren en niet weigeren: één rare waarde tussen de ids mag de rest van de
  // selectie niet ongedaan maken, maar mag ook niet als id meedoen — dan zou
  // hij nooit ergens op matchen en stilletjes niets doen.
  return waarde.filter((v): v is string => typeof v === "string");
}
