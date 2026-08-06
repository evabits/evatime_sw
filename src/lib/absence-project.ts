import { prisma } from "./prisma";
import { ABSENCE_PROJECT_NAMES } from "./absence-entries";

/**
 * Het project waarop verlof van een bepaalde soort geboekt wordt.
 *
 * Drie plekken hebben dit nodig — een admin die een aanvraag aanmaakt, het
 * goedkeuren, en een admin die een goedgekeurde aanvraag wijzigt. Drie keer
 * dezelfde `findFirst` uitschrijven betekent dat een wijziging aan wat een
 * verlofproject ís op drie plekken moet en er dus één vergeten wordt.
 *
 * `Project.name` is @unique, dus de naam identificeert het project al met
 * zekerheid. Er wordt daarom NIET meer op klant gefilterd: het dashboard
 * spoort admins aan een klant te koppelen aan projecten die er geen hebben, en
 * zolang die filter erin zat, sloopte precies dat advies de goedkeuring.
 *
 * `billable` blijft wél meedoen, maar als aparte controle in plaats van als
 * filter. Die vlag is wat verlofuren van facturen weghoudt — de factuurbouwer
 * kijkt daarnaar, niet naar de klant. Staat een verlofproject op factureerbaar,
 * dan is weigeren de juiste uitkomst: stilzwijgend iemands ziekteverlof
 * factureerbaar maken is erger dan een geblokkeerde goedkeuring.
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
  // filter dan gewoon vallen en findFirst matcht zomaar het eerste project dat
  // langskomt. Dat is stil fout boeken, dus hier hard weigeren in plaats van de
  // query te laten gokken.
  if (!naam) return { ok: false, error: `Onbekende verlofsoort "${type}"` };
  const project = await prisma.project.findFirst({
    where: { name: naam },
    select: { id: true, billable: true },
  });
  if (!project) return { ok: false, error: `Het project "${naam}" bestaat nog niet` };
  // In twee stappen en niet als filter: anders zou een verlofproject dat op
  // factureerbaar staat de melding "bestaat nog niet" opleveren over een
  // project dat er gewoon staat — onbegrijpelijk op precies het moment dat
  // iemand probeert te snappen wat er misgaat.
  if (project.billable) {
    return {
      ok: false,
      error: `Het project "${naam}" staat op factureerbaar; verlofuren horen niet op een factuur`,
    };
  }
  return { ok: true, projectId: project.id };
}
