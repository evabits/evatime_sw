/**
 * Welk thema er getoond wordt.
 *
 * De gebruiker kiest uit drie standen; er zijn er maar twee om te tonen.
 * `resolveTheme` is de vertaling daartussen, en die staat hier apart omdat
 * twee plekken hem nodig hebben: de schakelaar in de sidebar, en het inline
 * script in de layout dat draait voordat er ook maar iets geladen is.
 */

/** De sleutel in localStorage. Het inline script leest dezelfde. */
export const THEME_STORAGE_KEY = "theme";

/** Wat de gebruiker kan kiezen. */
export type ThemeChoice = "light" | "dark" | "system";

/** Wat er uiteindelijk op het scherm staat. */
export type AppliedTheme = "light" | "dark";

/**
 * De opgeslagen keuze plus de systeemvoorkeur wordt één toegepast thema.
 *
 * Alles wat geen expliciete keuze is — `"system"`, niets opgeslagen, of een
 * waarde die hier niet thuishoort — volgt het systeem. Dat laatste is opzet:
 * localStorage is door de gebruiker te bewerken, en een onbekende waarde mag
 * nooit tot een leeg of half thema leiden.
 */
export function resolveTheme(stored: string | null, prefersDark: boolean): AppliedTheme {
  if (stored === "light" || stored === "dark") return stored;
  return prefersDark ? "dark" : "light";
}
