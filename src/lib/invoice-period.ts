/**
 * Splitst openstaande regels in wat binnen de gekozen factuurperiode valt en
 * wat er van vóór die periode nog openstaat.
 *
 * Die tweede helft is het hele punt van deze functie. Het scherm stelt
 * standaard de vorige kalendermaand voor, en zonder tegenwicht zou alles wat
 * daarvóór is blijven liggen stilletjes uit beeld verdwijnen en nooit meer
 * gefactureerd worden.
 *
 * Regels ná de periode tellen in geen van beide mee: wie in augustus juli
 * factureert heeft altijd openstaande augustusregels, en dat is de factuur van
 * volgende maand, geen achterstand.
 *
 * `from` en `to` zijn `YYYY-MM-DD` en horen er allebei bij. De datums van de
 * regels zijn volledige ISO-tijdstempels, dus er wordt op de eerste tien
 * tekens vergeleken: op de hele tijdstempel vergelijken zou een regel van
 * laat op de laatste dag buiten de periode gooien. `YYYY-MM-DD` heeft
 * lexicografisch dezelfde volgorde als chronologisch, dus `<=` op strings
 * volstaat en er hoeft geen `Date` aan te pas te komen.
 */
export function splitInvoicePeriod<T extends { date: string }>(
  entries: T[],
  from: string,
  to: string,
): { binnen: T[]; ervoorAantal: number; ervoorOudste: string | null } {
  const binnen: T[] = [];
  let ervoorAantal = 0;
  let ervoorOudste: string | null = null;

  for (const e of entries) {
    const dag = e.date.slice(0, 10);
    if (dag < from) {
      ervoorAantal++;
      if (ervoorOudste === null || dag < ervoorOudste) ervoorOudste = dag;
    } else if (dag <= to) {
      binnen.push(e);
    }
  }

  return { binnen, ervoorAantal, ervoorOudste };
}
