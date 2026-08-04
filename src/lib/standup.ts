/**
 * De vorige werkdag, als `YYYY-MM-DD`.
 *
 * Tekst in, tekst uit — bewust geen `Date`. De datumkolommen zijn `@db.Date` en
 * de bestaande routes geven datums door als `YYYY-MM-DD`. Een `Date` erdoorheen
 * halen introduceert een tijdzonevraag die hier niets oplost:
 * `new Date("2026-08-04")` is middernacht UTC, terwijl `getDay()` en `setDate()`
 * in de lokale zone rekenen. De productieserver draait op UTC en de gebruikers
 * zitten in Amsterdam, dus dat verschil verschuift echt een dag zonder dat er
 * iets klaagt. Daarom uitsluitend de UTC-varianten.
 *
 * Weekenden worden overgeslagen: maandag kijkt naar vrijdag. Feestdagen niet —
 * die staan nergens in deze app, en een dag waarop niemand boekte is een juiste
 * weergave, geen fout.
 */
export function previousWorkingDay(date: string): string {
  const d = new Date(`${date}T00:00:00Z`);
  do {
    d.setUTCDate(d.getUTCDate() - 1);
  } while (d.getUTCDay() === 0 || d.getUTCDay() === 6);
  return d.toISOString().slice(0, 10);
}
