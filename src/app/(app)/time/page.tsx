import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { serialize } from "@/lib/utils";
import { TimeEntriesClient } from "@/components/time/time-entries-client";

export default async function TimePage() {
  const session = await auth();
  const userId = session?.user?.id ?? "";
  const role = (session?.user as any)?.role ?? "EMPLOYEE";

  const [projects, activityTypes, customers, recentEntries] = await Promise.all([
    prisma.project.findMany({
      where: { status: "ACTIVE" },
      orderBy: { name: "asc" },
      select: {
        id: true,
        name: true,
        defaultHourlyRate: true,
        customer: { select: { id: true, name: true } },
        activityRates: { include: { activityType: true } },
      },
    }),
    prisma.activityType.findMany({
      orderBy: { name: "asc" },
      include: { projects: { select: { projectId: true } } },
    }),
    prisma.customer.findMany({
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
    prisma.timeEntry.findMany({
      where: {
        userId,
        date: {
          gte: new Date(new Date().getFullYear(), new Date().getMonth(), 1),
          lte: new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0),
        },
      },
      orderBy: { date: "desc" },
      include: {
        project: { select: { name: true, customer: { select: { id: true, name: true } } } },
        activityType: { select: { name: true } },
      },
    }),
  ]);

  return (
    <TimeEntriesClient
      projects={serialize(projects)}
      activityTypes={serialize(activityTypes)}
      customers={serialize(customers)}
      initialEntries={serialize(recentEntries)}
      userId={userId}
      role={role}
    />
  );
}
