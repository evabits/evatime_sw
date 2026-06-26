import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { serialize } from "@/lib/utils";
import { KmEntriesClient } from "@/components/km/km-entries-client";

export default async function KmPage() {
  const session = await auth();
  const userId = session?.user?.id ?? "";
  const role = (session?.user as any)?.role ?? "EMPLOYEE";

  const [projects, activityTypes, customers, recentEntries, templates] = await Promise.all([
    prisma.project.findMany({
      where: { status: "ACTIVE" },
      orderBy: { name: "asc" },
      select: {
        id: true,
        name: true,
        defaultKmRate: true,
        customer: { select: { id: true, name: true } },
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
    prisma.kmEntry.findMany({
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
    prisma.kmTemplate.findMany({
      where: { userId },
      orderBy: { name: "asc" },
      include: {
        project: { select: { id: true, name: true, customer: { select: { id: true, name: true } } } },
        activityType: { select: { id: true, name: true } },
      },
    }),
  ]);

  return (
    <KmEntriesClient
      projects={serialize(projects)}
      activityTypes={serialize(activityTypes)}
      customers={serialize(customers)}
      initialEntries={serialize(recentEntries)}
      initialTemplates={serialize(templates)}
      role={role}
    />
  );
}
