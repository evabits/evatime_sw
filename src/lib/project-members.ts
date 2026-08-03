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

/**
 * Het project waarmee een update straks eindigt.
 *
 * Prisma behandelt een afwezige (`undefined`) waarde in `update({ data })` als
 * "dit veld onveranderd laten" — alleen een expliciete `null` wist het project.
 * De membership-check moet daarom dezelfde resolutie gebruiken als de write,
 * anders toetst de check een project dat de rij na de write niet eens heeft.
 */
export function resolveNextProjectId(
  existingProjectId: string | null,
  incomingProjectId: string | null | undefined,
): string | null {
  return incomingProjectId === undefined ? existingProjectId : incomingProjectId;
}
