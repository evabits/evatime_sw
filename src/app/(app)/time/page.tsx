import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { TimeEntriesClient } from "@/components/time/time-entries-client";

export default async function TimePage() {
  const session = await auth();
  const userId = session?.user?.id ?? "";

  const [projects, activityTypes, recentEntries] = await Promise.all([
    prisma.project.findMany({
      where: { status: "ACTIVE" },
      orderBy: { name: "asc" },
      select: {
        id: true,
        name: true,
        defaultHourlyRate: true,
        customer: { select: { name: true } },
        activityRates: { include: { activityType: true } },
      },
    }),
    prisma.activityType.findMany({ orderBy: { name: "asc" } }),
    prisma.timeEntry.findMany({
      where: { userId },
      orderBy: { date: "desc" },
      take: 50,
      include: {
        project: { select: { name: true, customer: { select: { name: true } } } },
        activityType: { select: { name: true } },
      },
    }),
  ]);

  return (
    <TimeEntriesClient
      projects={projects}
      activityTypes={activityTypes}
      initialEntries={recentEntries}
      userId={userId}
    />
  );
}
