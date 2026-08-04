/**
 * De tagnaam waar `GET /api/payroll` op zoekt om WBSO-uren per medewerker te
 * bepalen. Die route matcht hoofdletterongevoelig, dus de schrijfwijze van de
 * tag zelf maakt niet uit — maar de naam wel.
 *
 * Hij staat hier omdat er sinds dit traject een hernoemknop bestaat. Zou de
 * payrollroute zijn eigen letterlijke string houden, dan kan iemand de tag
 * omdopen en gaan de WBSO-uren stil naar nul zonder enig signaal in de UI.
 * `PUT /api/tags/[id]` weigert daarom te hernoemen wat hier gereserveerd is.
 */
export const RESERVED_TAG_NAME = "wbso";

/** De sleutel waarop tagnamen vergeleken worden: getrimd en zonder hoofdletters. */
export function normalizeTagName(name: string): string {
  return name.trim().toLowerCase();
}

export function isReservedTagName(name: string): boolean {
  return normalizeTagName(name) === RESERVED_TAG_NAME;
}

/**
 * Zet ingetypte tagnamen om naar de namen die daadwerkelijk opgeslagen moeten
 * worden: bestaat er al een tag met dezelfde genormaliseerde naam, dan wint de
 * BESTAANDE schrijfwijze. Zo levert "Marketing" naast een bestaande "marketing"
 * een koppeling op in plaats van een tweede tag.
 *
 * Ontdubbelt op de genormaliseerde sleutel, niet op de letterlijke tekst — anders
 * maakt één opslagactie waarin iemand "EFRO" en "efro" typt alsnog twee tags.
 */
export function canonicalizeTagNames(input: string[], existing: string[]): string[] {
  const perSleutel = new Map<string, string>();
  for (const naam of existing) {
    perSleutel.set(normalizeTagName(naam), naam);
  }
  const uit = new Map<string, string>();
  for (const ruw of input) {
    const naam = ruw.trim();
    if (!naam) continue;
    const sleutel = normalizeTagName(naam);
    if (!uit.has(sleutel)) uit.set(sleutel, perSleutel.get(sleutel) ?? naam);
  }
  return [...uit.values()];
}
