import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { serialize } from "@/lib/utils";
import { ActivityTypesClient } from "@/components/activity-types/activity-types-client";

export default async function ActivityTypesPage() {
  const session = await auth();
  if ((session?.user as any)?.role !== "ADMIN") redirect("/");

  const [types, projects] = await Promise.all([
    prisma.activityType.findMany({
      where: { archivedAt: null },
      orderBy: { name: "asc" },
      include: { projects: { select: { projectId: true } } },
    }),
    prisma.project.findMany({
      where: { status: "ACTIVE", archivedAt: null },
      orderBy: { name: "asc" },
      select: { id: true, name: true, customer: { select: { name: true } } },
    }),
  ]);
  return <ActivityTypesClient initialTypes={serialize(types)} projects={serialize(projects)} />;
}
