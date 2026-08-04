/**
 * Werkdagen, uitsluitend in UTC gerekend en met `YYYY-MM-DD` in en uit.
 *
 * Bewust geen `Date` aan de randen. De datumkolommen zijn `@db.Date` en de
 * routes geven datums door als `YYYY-MM-DD`. Een `Date` erdoorheen halen
 * introduceert een tijdzonevraag die hier niets oplost:
 * `new Date("2026-08-04")` is middernacht UTC, terwijl `getDay()` en
 * `setDate()` in de lokale zone rekenen. De productieserver draait op UTC en de
 * gebruikers zitten in Amsterdam, dus dat verschil verschuift echt een dag
 * zonder dat er iets klaagt. Daarom overal de UTC-varianten.
 *
 * Feestdagen worden niet overgeslagen — die staan nergens in deze app, en een
 * dag waarop niemand boekte is een juiste weergave, geen fout. Bij verlof is
 * het bovendien administratief juist: wie vrij neemt rond Pasen heeft daar
 * verlofuren voor opgegeven.
 */

function isWeekend(d: Date): boolean {
  const dag = d.getUTCDay();
  return dag === 0 || dag === 6;
}

/** De vorige werkdag. Maandag kijkt naar vrijdag. */
export function previousWorkingDay(date: string): string {
  const d = new Date(`${date}T00:00:00Z`);
  do {
    d.setUTCDate(d.getUTCDate() - 1);
  } while (isWeekend(d));
  return d.toISOString().slice(0, 10);
}

/**
 * Alle werkdagen van `from` tot en met `to`, oplopend.
 *
 * Geeft een lege lijst wanneer er geen werkdagen in de periode zitten, en ook
 * wanneer `to` vóór `from` ligt — de lus draait dan geen enkele keer.
 */
export function workingDaysBetween(from: string, to: string): string[] {
  const dagen: string[] = [];
  const d = new Date(`${from}T00:00:00Z`);
  const eind = new Date(`${to}T00:00:00Z`);
  while (d.getTime() <= eind.getTime()) {
    if (!isWeekend(d)) dagen.push(d.toISOString().slice(0, 10));
    d.setUTCDate(d.getUTCDate() + 1);
  }
  return dagen;
}
