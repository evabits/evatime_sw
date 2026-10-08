/**
 * Slaat op, en biedt bij "geen deelnemer" aan de medewerker(s) meteen aan het
 * project toe te voegen. Daarna wordt dezelfde opslag nog één keer gedaan; zegt
 * de gebruiker nee, of lukt het toevoegen niet, dan komt de oorspronkelijke
 * melding terug. Alleen voor admins: de deelnemersroute weigert iedereen anders.
 *
 * Een losse regel noemt één paar (projectId, userId); een bulkactie kan er
 * meerdere noemen in `missing`.
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
  const paren: { projectId: string; userId: string }[] =
    body.missing ?? [{ projectId: body.projectId, userId: body.userId }];
  const wie = (id: string) => namen.users.find((u) => u.id === id)?.name ?? "Onbekende medewerker";
  const waar = (id: string) => namen.projects.find((p) => p.id === id)?.name ?? "onbekend project";
  const vraag = paren.length === 1
    ? `${wie(paren[0].userId)} is geen deelnemer van ${waar(paren[0].projectId)}. Toevoegen en opslaan?`
    : `Deze medewerkers zijn geen deelnemer:\n\n${paren.map((p) => `- ${wie(p.userId)} bij ${waar(p.projectId)}`).join("\n")}\n\nAllemaal toevoegen en opslaan?`;
  if (!confirm(vraag)) return res;
  for (const { projectId, userId } of paren) {
    const toegevoegd = await fetch(`/api/projects/${projectId}/members`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId }),
    });
    if (!toegevoegd.ok) return res;
    onToegevoegd?.(projectId, userId);
  }
  return opslaan();
}
