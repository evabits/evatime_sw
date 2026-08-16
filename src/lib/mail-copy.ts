/**
 * Wat een mail naar een klant extra meekrijgt: een blinde kopie voor onszelf en
 * een antwoordadres waar ook werkelijk iemand leest.
 *
 * Beide op het bedrijfsadres uit de instellingen — hetzelfde adres dat op de
 * factuur staat, zodat wat de klant ziet ook is waar hij terechtkomt als hij
 * antwoordt. Zonder dit vertrok elke factuur vanaf no-reply@ zonder spoor: geen
 * kopie in huis, en een antwoord van de klant kwam nergens aan.
 *
 * Zonder bedrijfsadres komt er niets bij. Een lege bcc laat de verzending
 * mislukken, en een factuur die niet aankomt is erger dan een factuur zonder
 * kopie.
 *
 * Alleen voor mail naar buiten. De herinneringen aan collega's en de boekhoud-
 * mail gaan al naar onszelf; die hoeven geen kopie van zichzelf.
 */
export function customerMailCopy(
  settings: { email?: string | null } | null | undefined,
): { bcc?: string; replyTo?: string } {
  const eigen = settings?.email?.trim();
  return eigen ? { bcc: eigen, replyTo: eigen } : {};
}
