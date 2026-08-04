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
