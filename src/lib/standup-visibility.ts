/**
 * Wie de leider van de standup uit beeld heeft geklikt.
 *
 * Het scherm toont één kaart per actieve medewerker, en wie de standup leidt
 * wil daar zijn eigen mensen in zien. Dat is een schermvoorkeur en geen
 * organisatiestructuur: er is bewust geen team in het datamodel, want vijf
 * mensen mogen de standup leiden en soms neemt een ander het over.
 *
 * Opgeslagen wordt wie is WEGGEKLIKT, niet wie zichtbaar is. Dat verschil telt
 * bij een nieuwe collega: die staat er dan vanzelf bij, in plaats van
 * onzichtbaar te blijven tot iemand eraan denkt hem toe te voegen. In een
 * dagelijks ritueel valt zo iemand lang niet op, en iemand zien die je niet
 * nodig had is de goedkopere fout.
 */

/**
 * De sleutel in localStorage, met het gebruikers-id erin.
 *
 * Vijf mensen mogen de standup leiden en er kan er meer dan één op dezelfde
 * computer inloggen; zonder het id zou de een de selectie van de ander erven.
 * Zelfde opzet als `time-filters:<userId>` in het urenscherm.
 */
export function hiddenStorageKey(userId: string): string {
  return `standup-hidden:${userId}`;
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
