import { isAdmin } from "./roles";

/**
 * Mag deze gebruiker deze verlofaanvraag intrekken?
 *
 * De volgorde van de controles is opzet. De statuscontrole staat vóór de
 * rolcontrole, want intrekken slaat alleen op goedgekeurd verlof — een aanvraag
 * in afwachting verwijder je. Daarna wint de admin: die moet fouten kunnen
 * herstellen, ook met terugwerkende kracht.
 *
 * De datumgrens geldt alleen voor de medewerker. Een urenoverzicht en een
 * loonrun lezen de gegenereerde urenregels, en een medewerker mag niet in zijn
 * eentje uren weghalen die daar al in meegeteld hebben.
 */
export type CancelVerdict =
  | "ok"
  | "not-found"
  | "forbidden"
  | "not-approved"
  | "already-started";

export function canCancelAbsence(
  role: string,
  sessionUserId: string,
  request: { userId: string; status: string; startDate: string } | null,
  today: string,
): CancelVerdict {
  if (!request) return "not-found";
  if (request.status !== "APPROVED") return "not-approved";
  if (isAdmin(role)) return "ok";
  if (request.userId !== sessionUserId) return "forbidden";
  // YYYY-MM-DD vergelijkt lexicografisch gelijk aan chronologisch. Gelijk aan
  // vandaag telt als begonnen: die dag is al bezig.
  if (request.startDate <= today) return "already-started";
  return "ok";
}
