/**
 * De factuurnummerreeks: `2026-0008`, per kalenderjaar oplopend.
 *
 * Apart van `invoice-number.ts`, dat de database bevraagt — hier zit alleen de
 * rekenkunde, zodat die te testen is zonder database.
 *
 * Deze functie kijkt naar het **hoogste** bestaande nummer en niet naar hoevéél
 * facturen er zijn. Dat is geen detail: tellen ging mis zodra er een factuur
 * verwijderd was. Bij vier facturen genummerd 0005 tot en met 0008 wilde de
 * telling `0005` uitgeven, wat al bestond — de unieke sleutel botste en zowel
 * het aanmaken als het kopiëren van een factuur liep vast op "Deze waarde is al
 * in gebruik".
 *
 * Een verwijderde factuur laat nu een gat achter in de nummering. Dat is de
 * bedoeling: een nummer dat ooit op een verstuurde factuur stond opnieuw
 * uitgeven is erger dan een gat.
 */
const PATROON = /^(\d{4})-(\d+)$/;

/** Hoeveel cijfers een volgnummer krijgt. `1` wordt `0001`. */
const BREEDTE = 4;

export function nextInvoiceNumberFrom(bestaande: string[], jaar: number): string {
  const prefix = `${jaar}-`;

  let hoogste = 0;
  for (const nummer of bestaande) {
    const match = PATROON.exec(nummer.trim());
    // Alles wat niet aan het patroon voldoet negeren we. Een nummer dat ooit
    // met de hand is aangepast tot iets als "2026-HERSTEL" mag de reeks niet
    // laten struikelen; het telt dan gewoon niet mee.
    if (!match || match[1] !== String(jaar)) continue;
    const volg = Number(match[2]);
    if (volg > hoogste) hoogste = volg;
  }

  return `${prefix}${String(hoogste + 1).padStart(BREEDTE, "0")}`;
}
