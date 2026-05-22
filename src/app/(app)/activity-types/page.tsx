import { prisma } from "@/lib/prisma";
import { serialize } from "@/lib/utils";
import { ActivityTypesClient } from "@/components/activity-types/activity-types-client";

export default async function ActivityTypesPage() {
  const [types, projects] = await Promise.all([
    prisma.activityType.findMany({
      orderBy: { name: "asc" },
      include: { projects: { select: { projectId: true } } },
    }),
    prisma.project.findMany({
      where: { status: "ACTIVE" },
      orderBy: { name: "asc" },
      select: { id: true, name: true, customer: { select: { name: true } } },
    }),
  ]);
  return <ActivityTypesClient initialTypes={serialize(types)} projects={serialize(projects)} />;
}
