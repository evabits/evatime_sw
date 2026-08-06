import { format } from "date-fns";

/**
 * Telt registraties per dag op, in de volgorde van de meegegeven dagen.
 *
 * De aanroeper zet zijn registraties eerst om naar `{ date, value }`. Het
 * urenscherm sommeert `hours` en het kilometerscherm `km`, en één `map` per
 * scherm is minder omslachtig dan een callback-parameter die alleen bestaat om
 * twee veldnamen te overbruggen.
 *
 * Dit is een eigen functie omdat er datumparsing in zit. `new Date(...)` gevolgd
 * door `format` rekent in de lokale tijdzone, en een fout daarin schuift een
 * registratie een dag op — zichtbaar op het scherm, maar pas als iemand het
 * toevallig opmerkt.
 *
 * De som dwingt zelf `Number(e.value)` af: de aanroepers typen hun entries als
 * `any[]`, dus TypeScript ziet een Prisma `Decimal` (die als string serialiseert)
 * niet als fout, en dit is de enige plek waar de som daartegen te beschermen is.
 */
export function perDayTotals(
  entries: Array<{ date: string | Date; value: number }>,
  days: string[],
): number[] {
  return days.map((dag) =>
    entries
      .filter((e) => format(new Date(e.date), "yyyy-MM-dd") === dag)
      .reduce((som, e) => som + Number(e.value), 0),
  );
}
