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
export const STANDAARD_BETALINGSTEKST =
  "Wij verzoeken u vriendelijk het totaalbedrag binnen 30 dagen over te maken op onze IBAN rekening NL90 INGB 0008 9967 99 t.n.v. EVAbits onder vermelding van het factuurnummer.";
