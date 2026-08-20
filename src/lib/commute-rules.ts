import { prisma } from "@/lib/prisma";
import {
  pickCommuteTemplate,
  matchesCommuteTemplate,
  commuteDuplicateDenial,
} from "@/lib/commute";

/**
 * Of een kilometerregistratie de woon-werkrit is, en of hij zo weggeschreven mag
 * worden.
 *
 * Op één plek omdat zowel het aanmaken als het wijzigen van een rit hetzelfde
 * oordeel nodig heeft. Twee kopieën zouden vroeg of laat uiteenlopen, en dan
 * zou een rit die je aanmaakt anders behandeld worden dan diezelfde rit nadat
 * je hem hebt bijgewerkt.
 *
 * Het oordeel gaat over de **inhoud** en niet over de herkomst: komen project en
 * kilometers overeen met het beheerde woon-werksjabloon, dan is het de
 * woon-werkrit, ook als iemand hem met de hand heeft ingetypt.
 */
export async function commuteVerdict(opts: {
  ownerId: string;
  date: Date;
  projectId: string;
  km: number;
  /** Bij het wijzigen van een rit: die rit mag zichzelf niet als duplicaat tegenkomen. */
  negeerRitId?: string;
}): Promise<{ commute: boolean; denial: string | null }> {
  const sjablonen = await prisma.kmTemplate.findMany({ where: { userId: opts.ownerId } });
  const sjabloon = pickCommuteTemplate(sjablonen as any);
  const rit = { projectId: opts.projectId, km: opts.km };

  // Past hij niet op het sjabloon, dan is er niets te weigeren en niets te
  // markeren — en dan hoeven we ook niet naar de rest van die dag te kijken.
  if (!matchesCommuteTemplate(sjabloon, rit)) return { commute: false, denial: null };

  const bestaand = await prisma.kmEntry.findFirst({
    where: {
      userId: opts.ownerId,
      date: opts.date,
      commute: true,
      ...(opts.negeerRitId ? { NOT: { id: opts.negeerRitId } } : {}),
    },
    select: { id: true },
  });

  const denial = commuteDuplicateDenial({ sjabloon, rit, bestaatAl: Boolean(bestaand) });
  return { commute: denial === null, denial };
}
