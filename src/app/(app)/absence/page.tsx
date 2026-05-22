import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { serialize } from "@/lib/utils";
import { isAdmin } from "@/lib/roles";
import { AbsenceClient } from "@/components/vacation/absence-client";

export default async function AbsencePage() {
  const session = await auth();
  const userId = session?.user?.id ?? "";
  const role = (session?.user as any)?.role ?? "EMPLOYEE";
  const admin = isAdmin(role);
  const year = new Date().getFullYear();
  const yearStart = new Date(year, 0, 1);
  const yearEnd = new Date(year, 11, 31);

  const [requests, budgets, users, currentUser] = await Promise.all([
    prisma.absenceRequest.findMany({
      where: {
        ...(admin ? {} : { userId }),
        startDate: { gte: yearStart, lte: yearEnd },
      },
      include: {
        user: { select: { id: true, name: true } },
        reviewer: { select: { id: true, name: true } },
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
          select: { id: true, name: true },
          orderBy: { name: "asc" },
        })
      : Promise.resolve([]),
    prisma.user.findUnique({ where: { id: userId }, select: { weeklyHours: true } }),
  ]);

  const calendarToken = process.env.VACATION_CALENDAR_TOKEN ?? "";

  return (
    <AbsenceClient
      initialRequests={serialize(requests).map((r: any) => ({ ...r, hours: Number(r.hours) }))}
      initialBudgets={serialize(budgets).map((b: any) => ({ ...b, hours: Number(b.hours) }))}
      users={users}
      currentUserId={userId}
      isAdmin={admin}
      year={year}
      calendarToken={calendarToken}
      weeklyHours={Number(currentUser?.weeklyHours ?? 40)}
    />
  );
}

