import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { serialize } from "@/lib/utils";
import { isAdmin } from "@/lib/roles";
import { AbsenceClient } from "@/components/vacation/absence-client";
import { toWeekSchedule } from "@/lib/work-schedule";

export default async function AbsencePage() {
  const session = await auth();
  const userId = session?.user?.id ?? "";
  const role = (session?.user as any)?.role ?? "EMPLOYEE";
  const admin = isAdmin(role);
  const year = new Date().getFullYear();
  const yearStart = new Date(year, 0, 1);
  const yearEnd = new Date(year, 11, 31);

  const [requests, budgets, users, currentUser, scheduleRows] = await Promise.all([
    prisma.absenceRequest.findMany({
      where: {
        ...(admin ? {} : { userId }),
        startDate: { gte: yearStart, lte: yearEnd },
      },
      include: {
        user: { select: { id: true, name: true } },
        reviewer: { select: { id: true, name: true } },
        pattern: true,
      },
      orderBy: { startDate: "desc" },
    }),
    prisma.vacationBudget.findMany({
      where: {
        ...(admin ? {} : { userId }),
        year,
      },
      include: { user: { select: { id: true, name: true } } },
      orderBy: { user: { name: "asc" } },
    }),
    admin
      ? prisma.user.findMany({
          where: { archivedAt: null },
          select: { id: true, name: true },
          orderBy: { name: "asc" },
        })
      : Promise.resolve([]),
    prisma.user.findUnique({ where: { id: userId }, select: { weeklyHours: true } }),
    // Een medewerker heeft alleen zijn eigen rooster nodig; een admin kan voor
    // iedereen aanvragen, dus die krijgt ze allemaal. Het zijn enkele rijen.
    prisma.workSchedule.findMany({ where: admin ? {} : { userId } }),
  ]);

  const calendarToken = process.env.VACATION_CALENDAR_TOKEN ?? "";

  // Op id, want de dialoog zoekt het rooster op van de medewerker waar de
  // aanvraag over gaat. toWeekSchedule maakt van de Decimals getallen; hier kan
  // hij nooit null geven, want elke rij bestaat.
  const schedules = Object.fromEntries(
    scheduleRows.map((r) => [r.userId, toWeekSchedule(r)!]),
  );

  return (
    <AbsenceClient
      // toWeekSchedule maakt er null van als er geen patroon is. Zonder die
      // omzetting is pattern hier undefined en leest het formulier dat als
      // "wel een patroon", waardoor het vinkje bij elke bestaande aanvraag
      // aanstaat. serialize() laat de Decimals bovendien als string achter.
      initialRequests={serialize(requests).map((r: any) => ({
        ...r,
        hours: Number(r.hours),
        pattern: toWeekSchedule(r.pattern),
      }))}
      initialBudgets={serialize(budgets).map((b: any) => ({ ...b, hours: Number(b.hours) }))}
      users={users}
      currentUserId={userId}
      isAdmin={admin}
      year={year}
      calendarToken={calendarToken}
      weeklyHours={Number(currentUser?.weeklyHours ?? 40)}
      schedules={schedules}
    />
  );
}

