import Link from "next/link";
import { ChevronRight, Bell } from "lucide-react";
import { startOfWeek, endOfWeek, format } from "date-fns";
import { prisma } from "@/lib/prisma";
import { meldingenVoor } from "@/lib/meldingen";
import { targetBefore, toWeekSchedule, weekdagenVoorVandaag } from "@/lib/work-schedule";

/**
 * De strook met openstaande taken, boven elke pagina.
 *
 * Op het dashboard stonden ze als kaart, maar medewerkers komen daar niet: de
 * zelfreflectie bleef daardoor weken liggen. Hier lopen ze mee, waar je ook
 * bent.
 *
 * Twee kleine queries per paginabezoek. De layout wordt bij client-navigatie
 * hergebruikt en draait dan niet opnieuw — daarom roept het urenscherm na het
 * opslaan `router.refresh()` aan, anders blijft de melding staan terwijl je de
 * uren net hebt geboekt.
 */
export async function MeldingenBanner({ userId }: { userId: string }) {
  if (!userId) return null;

  const nu = new Date();
  const vandaag = format(nu, "yyyy-MM-dd");

  const [review, gebruiker, urenDezeWeek] = await Promise.all([
    prisma.performanceReview.findFirst({
      where: { userId, status: { in: ["PLANNED", "SELF_COMPLETED"] } },
      orderBy: { period: "desc" },
      select: { period: true, status: true },
    }),
    prisma.user.findUnique({
      where: { id: userId },
      select: { weeklyHours: true, workSchedule: true },
    }),
    prisma.timeEntry.aggregate({
      where: {
        userId,
        date: { gte: startOfWeek(nu, { weekStartsOn: 1 }), lte: endOfWeek(nu, { weekStartsOn: 1 }) },
      },
      _sum: { hours: true },
    }),
  ]);

  // Dezelfde regel als de herinneringsmail: met rooster telt het rooster, en
  // zonder rooster wordt het weekurenaantal over vijf dagen verdeeld. Wie geen
  // van beide heeft doet niet mee.
  const rooster = toWeekSchedule(gebruiker?.workSchedule);
  const weekuren = gebruiker?.weeklyHours == null ? null : Number(gebruiker.weeklyHours);
  const doel = rooster
    ? targetBefore(rooster, vandaag)
    : weekuren == null
      ? null
      : (weekuren * weekdagenVoorVandaag(vandaag)) / 5;

  const meldingen = meldingenVoor({
    review,
    uren: doel == null ? null : { geboekt: Number(urenDezeWeek._sum.hours ?? 0), doel },
  });

  if (meldingen.length === 0) return null;

  return (
    <div className="sticky top-14 z-40 divide-y divide-primary/20 border-b border-primary/30 bg-primary/10 md:top-0">
      {meldingen.map((m) => (
        <Link
          key={m.id}
          href={m.href}
          className="flex items-center gap-2 px-4 py-2 text-sm hover:bg-primary/15"
        >
          <Bell className="h-4 w-4 shrink-0 text-primary" />
          <span className="flex-1">{m.tekst}</span>
          <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
        </Link>
      ))}
    </div>
  );
}
