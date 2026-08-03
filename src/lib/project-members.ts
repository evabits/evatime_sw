/**
 * Wie mag er op een project boeken.
 *
 * De eis slaat altijd op de EIGENAAR van de registratie, nooit op degene die
 * hem invoert: een admin die namens Piet boekt heeft Piets deelname nodig.
 */
export function isProjectMember(
  memberUserIds: string[],
  userId: string | null | undefined,
): boolean {
  if (!userId) return false;
  return memberUserIds.includes(userId);
}

/**
 * Of de deelnamecontrole voor deze opslag nodig is.
 *
 * Bij aanmaken altijd. Bij bewerken alleen wanneer het project of de eigenaar
 * verandert — anders zou een oude regel van iemand die nooit deelnemer was
 * onbewerkbaar worden, tot en met zijn omschrijving.
 */
export function membershipCheckNeeded(
  existing: { projectId: string | null; userId: string } | null,
  next: { projectId: string | null; userId: string },
): boolean {
  if (existing === null) return true;
  return existing.projectId !== next.projectId || existing.userId !== next.userId;
}
