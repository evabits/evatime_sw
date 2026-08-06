import { prisma } from "./prisma";
import { ABSENCE_PROJECT_NAMES } from "./absence-entries";

/**
 * Het project waarop verlof van een bepaalde soort geboekt wordt.
 *
 * Drie plekken hebben dit nodig — een admin die een aanvraag aanmaakt, het
 * goedkeuren, en een admin die een goedgekeurde aanvraag wijzigt. Drie keer
 * dezelfde `findFirst` uitschrijven betekent dat een wijziging aan wat een
 * verlofproject ís, bijvoorbeeld wanneer ze ooit wél een klant mogen hebben,
 * op drie plekken moet en er dus één vergeten wordt.
 *
 * De weigering komt terug als waarde en niet als HTTP-antwoord; de aanroeper
 * maakt er een 400 van.
 */
export type AbsenceProjectResult =
  | { ok: true; projectId: string }
  | { ok: false; error: string };

export async function findAbsenceProject(type: string): Promise<AbsenceProjectResult> {
  const naam = ABSENCE_PROJECT_NAMES[type];
  // Een onbekende type-sleutel maakt naam undefined; Prisma laat een undefined
  // filter dan gewoon vallen en findFirst matcht zomaar het eerste
  // niet-declarabele project zonder klant. Dat is stil fout boeken, dus hier
  // hard weigeren in plaats van de query te laten gokken.
  if (!naam) return { ok: false, error: `Onbekende verlofsoort "${type}"` };
  const project = await prisma.project.findFirst({
    where: { name: naam, billable: false, customerId: null },
    select: { id: true },
  });
  if (!project) return { ok: false, error: `Het project "${naam}" bestaat nog niet` };
  return { ok: true, projectId: project.id };
}
