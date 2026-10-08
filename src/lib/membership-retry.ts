/**
 * Slaat op, en biedt bij "geen deelnemer" aan de medewerker meteen aan het
 * project toe te voegen. Daarna wordt dezelfde opslag nog één keer gedaan; zegt
 * de gebruiker nee, of lukt het toevoegen niet, dan komt de oorspronkelijke
 * melding terug. Alleen voor admins: de deelnemersroute weigert iedereen anders.
 */
export async function saveWithMembership(
  opslaan: () => Promise<Response>,
  namen: { users: { id: string; name: string }[]; projects: { id: string; name: string }[] },
  onToegevoegd?: (projectId: string, userId: string) => void,
): Promise<Response> {
  const res = await opslaan();
  if (res.ok) return res;
  const body = await res.clone().json().catch(() => ({}));
  if (body.code !== "NOT_MEMBER") return res;
  const wie = namen.users.find((u) => u.id === body.userId)?.name ?? "Deze medewerker";
  const waar = namen.projects.find((p) => p.id === body.projectId)?.name ?? "dit project";
  if (!confirm(`${wie} is geen deelnemer van ${waar}. Toevoegen en opslaan?`)) return res;
  const toegevoegd = await fetch(`/api/projects/${body.projectId}/members`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ userId: body.userId }),
  });
  if (!toegevoegd.ok) return res;
  onToegevoegd?.(body.projectId, body.userId);
  return opslaan();
}
