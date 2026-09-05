import { docCopy, type Taal } from "./document-copy";

/**
 * De standaardtekst onderaan een factuur.
 *
 * Hier en niet in het factuurscherm, omdat een automatisch gegenereerde factuur
 * hem ook nodig heeft. Twee kopieën zouden vroeg of laat uiteenlopen, en dan
 * staat er op de ene factuur een ander rekeningnummer dan op de andere.
 *
 * De dertig dagen hier horen bij de vervaldatum, die ook op vandaag plus dertig
 * staat.
 */
export function standaardBetalingstekst(taal: Taal = "NL"): string {
  return docCopy(taal).betalingstekst;
}

/** De Nederlandse tekst, voor waar geen taal in beeld is. */
export const STANDAARD_BETALINGSTEKST = standaardBetalingstekst("NL");
