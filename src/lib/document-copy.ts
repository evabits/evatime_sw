/**
 * De vaste teksten op een factuur of offerte, per taal.
 *
 * Eén tabel voor het document, de print, de publieke pagina en de mail: die
 * vier tonen dezelfde factuur en horen hem met dezelfde woorden te tonen.
 *
 * `EN` is getypeerd als `typeof NL`, dus een vergeten sleutel is een
 * compilerfout en geen Nederlandse zin op een Engelse factuur. Dat is de reden
 * dat hier geen los vertaalpakket bij komt kijken.
 *
 * Wat de gebruiker zelf typt — onderwerp, notities, een eigen inleiding, de
 * regelomschrijvingen — staat hier niet in en blijft altijd zoals hij het typt.
 */
export type Taal = "NL" | "EN";

const NL = {
  locale: "nl-NL",

  // Document
  factuur: "FACTUUR",
  offerte: "OFFERTE",
  factuurnummer: "Factuurnummer",
  offertenummer: "Offertenummer",
  kenmerk: "Kenmerk",
  klantnummer: "Klantnummer",
  factuurdatum: "Factuurdatum",
  vervaldatum: "Vervaldatum",
  datum: "Datum",
  geldigTot: "Geldig tot",
  tav: "T.a.v.",

  // Regeltabel
  omschrijving: "Omschrijving",
  aantal: "Aantal",
  prijs: "Prijs",
  totaal: "Totaal",
  btw: "Btw",
  subtotaal: "Subtotaal",
  btwMet: (percentage: string) => `BTW ${percentage}%`,

  // Kopjes boven de soorten regels
  groepUren: "Uren:",
  groepRitten: "Ritten:",
  groepUitgaven: "Uitgaven:",
  // Waar een regel op terugvalt als er verder niets is ingevuld
  terugvalWerkzaamheden: "Werkzaamheden",
  terugvalReiskosten: "Reiskosten",
  terugvalUitgave: "Uitgave",

  // Bedrijfsgegevens rechtsboven. KvK blijft KvK: het is de naam van een
  // Nederlands register en geen woord dat je vertaalt.
  labelBtwNummer: "Btw",

  // Onderaan de factuur
  betalingstekst:
    "Wij verzoeken u vriendelijk het totaalbedrag binnen 30 dagen over te maken op onze IBAN rekening NL90 INGB 0008 9967 99 t.n.v. EVAbits onder vermelding van het factuurnummer.",

  // Knoppen op het printscherm en de publieke pagina
  sluiten: "Sluiten",
  afdrukken: "Afdrukken",
  bezig: "Bezig...",
  offerteGoedkeuren: "Offerte goedkeuren",
  offerteGoedgekeurd: "Offerte goedgekeurd",
  goedgekeurdOp: (datum: string) => `Goedgekeurd op ${datum}`,
  akkoordVraag: "Gaat u akkoord met deze offerte? Klik dan op de knop hieronder.",

  // Mail
  aanhef: (naam: string) => `Geachte ${naam},`,
  mailFactuurZin: (nummer: string, onderwerp: string) =>
    `Hierbij ontvangt u factuur <strong>${nummer}</strong>${onderwerp}.`,
  mailOfferteZin: (nummer: string, onderwerp: string) =>
    `Hierbij ontvangt u offerte <strong>${nummer}</strong>${onderwerp}.`,
  mailKnopFactuur: "Factuur bekijken / afdrukken",
  mailKnopOfferte: "Offerte bekijken &amp; goedkeuren",
  mailOnderwerpFactuur: (nummer: string, onderwerp: string) => `Factuur ${nummer}${onderwerp}`,
  mailOnderwerpOfferte: (nummer: string, onderwerp: string) => `Offerte ${nummer}${onderwerp}`,
  bestandsnaamFactuur: (nummer: string) => `Factuur-${nummer}.pdf`,
  bestandsnaamOfferte: (nummer: string) => `Offerte-${nummer}.pdf`,

  // Herinnering
  mailOnderwerpHerinnering: (nummer: string) => `Herinnering: openstaande factuur ${nummer}`,
  herinneringZin: (nummer: string, factuurdatum: string, vervaldatum: string) =>
    `Wij constateren dat factuur <strong>${nummer}</strong> van <strong>${factuurdatum}</strong> met vervaldatum <strong>${vervaldatum}</strong> nog niet is voldaan.`,
  herinneringBedrag: (bedrag: string) => `Het openstaande bedrag is <strong>${bedrag}</strong>.`,
  herinneringVerzoek:
    "Graag verzoeken wij u dit bedrag zo spoedig mogelijk over te maken onder vermelding van het factuurnummer.",
  mailKnopFactuurBekijken: "Factuur bekijken",

  // De inleiding boven de regels van een batchfactuur
  batchIntro: (batchnaam: string, opgeleverdOp: string) =>
    `Hierbij ontvangt u de factuur voor ${batchnaam}, opgeleverd op ${opgeleverdOp}.`,
  batchKwaliteit: (totaal: number, goedgekeurd: number, afgekeurd: number) =>
    `Van de ${totaal} geteste exemplaren zijn er ${goedgekeurd} goedgekeurd en ${afgekeurd} afgekeurd.`,
};

const EN: typeof NL = {
  locale: "en-GB",

  factuur: "INVOICE",
  offerte: "QUOTE",
  factuurnummer: "Invoice number",
  offertenummer: "Quote number",
  kenmerk: "Reference",
  klantnummer: "Customer number",
  factuurdatum: "Invoice date",
  vervaldatum: "Due date",
  datum: "Date",
  geldigTot: "Valid until",
  tav: "Attn.",

  omschrijving: "Description",
  aantal: "Quantity",
  prijs: "Price",
  totaal: "Total",
  btw: "VAT",
  subtotaal: "Subtotal",
  btwMet: (percentage: string) => `VAT ${percentage}%`,

  groepUren: "Hours:",
  groepRitten: "Travel:",
  groepUitgaven: "Expenses:",
  terugvalWerkzaamheden: "Work",
  terugvalReiskosten: "Travel expenses",
  terugvalUitgave: "Expense",

  labelBtwNummer: "VAT",

  betalingstekst:
    "We kindly request that you transfer the total amount within 30 days to our IBAN account NL90 INGB 0008 9967 99 in the name of EVAbits, quoting the invoice number.",

  sluiten: "Close",
  afdrukken: "Print",
  bezig: "Working...",
  offerteGoedkeuren: "Approve quote",
  offerteGoedgekeurd: "Quote approved",
  goedgekeurdOp: (datum: string) => `Approved on ${datum}`,
  akkoordVraag: "Do you agree with this quote? Then click the button below.",

  aanhef: (naam: string) => `Dear ${naam},`,
  mailFactuurZin: (nummer: string, onderwerp: string) =>
    `Please find enclosed invoice <strong>${nummer}</strong>${onderwerp}.`,
  mailOfferteZin: (nummer: string, onderwerp: string) =>
    `Please find enclosed quote <strong>${nummer}</strong>${onderwerp}.`,
  mailKnopFactuur: "View / print invoice",
  mailKnopOfferte: "View &amp; approve quote",
  mailOnderwerpFactuur: (nummer: string, onderwerp: string) => `Invoice ${nummer}${onderwerp}`,
  mailOnderwerpOfferte: (nummer: string, onderwerp: string) => `Quote ${nummer}${onderwerp}`,
  bestandsnaamFactuur: (nummer: string) => `Invoice-${nummer}.pdf`,
  bestandsnaamOfferte: (nummer: string) => `Quote-${nummer}.pdf`,

  mailOnderwerpHerinnering: (nummer: string) => `Reminder: outstanding invoice ${nummer}`,
  herinneringZin: (nummer: string, factuurdatum: string, vervaldatum: string) =>
    `We note that invoice <strong>${nummer}</strong> of <strong>${factuurdatum}</strong>, due on <strong>${vervaldatum}</strong>, has not yet been paid.`,
  herinneringBedrag: (bedrag: string) => `The outstanding amount is <strong>${bedrag}</strong>.`,
  herinneringVerzoek:
    "We kindly ask you to transfer this amount as soon as possible, quoting the invoice number.",
  mailKnopFactuurBekijken: "View invoice",

  batchIntro: (batchnaam: string, opgeleverdOp: string) =>
    `Please find enclosed the invoice for ${batchnaam}, delivered on ${opgeleverdOp}.`,
  batchKwaliteit: (totaal: number, goedgekeurd: number, afgekeurd: number) =>
    `Of the ${totaal} units tested, ${goedgekeurd} passed and ${afgekeurd} were rejected.`,
};

/**
 * De teksten bij een taal. Alles wat geen `EN` is krijgt Nederlands: dat is wat
 * elke bestaande factuur heeft en waar een onbekende waarde op hoort terug te
 * vallen.
 */
export function docCopy(taal: Taal | string | null | undefined): typeof NL {
  return taal === "EN" ? EN : NL;
}
