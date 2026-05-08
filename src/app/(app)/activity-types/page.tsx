import { prisma } from "@/lib/prisma";
import { ActivityTypesClient } from "@/components/activity-types/activity-types-client";

export default async function ActivityTypesPage() {
  const types = await prisma.activityType.findMany({ orderBy: { name: "asc" } });
  return <ActivityTypesClient initialTypes={types} />;
}
