import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { serialize } from "@/lib/utils";
import { isAdmin } from "@/lib/roles";
import { toWeekSchedule } from "@/lib/work-schedule";
import { TimeEntriesClient } from "@/components/time/time-entries-client";

export default async function TimePage() {
  const session = await auth();
  const userId = session?.user?.id ?? "";
  const role = (session?.user as any)?.role ?? "EMPLOYEE";
  const admin = isAdmin(role);

  const [projects, customers, recentEntries, users] = await Promise.all([
    prisma.project.findMany({
      where: {
        status: { in: ["ACTIVE", "CONCEPT"] },
        archivedAt: null,
        ...(admin ? {} : { members: { some: { userId } } }),
      },
      orderBy: { name: "asc" },
      // The rate preview (and its "Tarief override" field) only ever renders
      // for admins — see the `{isAdmin && ...}` guard in TimeEntriesClient.
      // Non-admins don't need the per-level rate card, so don't ship it to
      // them in the page payload; same class of leak as the /api/time fix.
      select: admin
        ? {
            id: true,
            name: true,
            status: true,
            levelRates: true,
            members: { select: { userId: true } },
            customer: { select: { id: true, name: true, levelRates: true } },
          }
        : {
            id: true,
            name: true,
            status: true,
            customer: { select: { id: true, name: true } },
          },
    }),
    prisma.customer.findMany({
      where: { archivedAt: null },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
    prisma.timeEntry.findMany({
      where: {
        ...(admin ? {} : { userId }),
        date: {
          gte: new Date(new Date().getFullYear(), new Date().getMonth(), 1),
          lte: new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0),
        },
      },
      orderBy: { date: "desc" },
      include: {
        project: { select: { name: true, billable: true, customer: { select: { id: true, name: true } } } },
        user: { select: { id: true, name: true } },
      },
    }),
    admin
      ? prisma.user.findMany({ where: { archivedAt: null }, orderBy: { name: "asc" }, select: { id: true, name: true, workLevel: true } })
      : Promise.resolve([]),
  ]);

  const currentUserLevel = admin
    ? (users.find((u) => u.id === userId)?.workLevel ?? null)
    : ((await prisma.user.findUnique({ where: { id: userId }, select: { workLevel: true } }))?.workLevel ?? null);

  // Het rooster van de INGELOGDE gebruiker. De weekweergave is één raster, niet
  // één per persoon, dus een admin die andermans uren bekijkt ziet zijn eigen
  // vrije dagen gemarkeerd. Zonder rooster verandert er niets.
  const eigenRooster = userId
    ? await prisma.workSchedule.findUnique({ where: { userId } })
    : null;

  return (
    <TimeEntriesClient
      projects={serialize(projects)}
      customers={serialize(customers)}
      users={serialize(users)}
      initialEntries={serialize(recentEntries)}
      userId={userId}
      role={role}
      currentUserLevel={currentUserLevel}
      workSchedule={toWeekSchedule(eigenRooster)}
    />
  );
}
