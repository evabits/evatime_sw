import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { serialize } from "@/lib/utils";
import { isAdmin } from "@/lib/roles";
import { KmEntriesClient } from "@/components/km/km-entries-client";

export default async function KmPage() {
  const session = await auth();
  const userId = session?.user?.id ?? "";
  const role = (session?.user as any)?.role ?? "EMPLOYEE";
  const admin = isAdmin(role);

  const [projects, activityTypes, customers, recentEntries, templates, users] = await Promise.all([
    prisma.project.findMany({
      where: { status: "ACTIVE", archivedAt: null },
      orderBy: { name: "asc" },
      select: {
        id: true,
        name: true,
        defaultKmRate: true,
        customer: { select: { id: true, name: true } },
      },
    }),
    prisma.activityType.findMany({
      where: { archivedAt: null },
      orderBy: { name: "asc" },
      include: { projects: { select: { projectId: true } } },
    }),
    prisma.customer.findMany({
      where: { archivedAt: null },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
    prisma.kmEntry.findMany({
      where: {
        ...(admin ? {} : { userId }),
        date: {
          gte: new Date(new Date().getFullYear(), new Date().getMonth(), 1),
          lte: new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0),
        },
      },
      orderBy: { date: "desc" },
      include: {
        project: { select: { name: true, customer: { select: { id: true, name: true } } } },
        activityType: { select: { name: true } },
        user: { select: { id: true, name: true } },
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
    admin
      ? prisma.user.findMany({ where: { archivedAt: null }, orderBy: { name: "asc" }, select: { id: true, name: true } })
      : Promise.resolve([]),
  ]);

  return (
    <KmEntriesClient
      projects={serialize(projects)}
      activityTypes={serialize(activityTypes)}
      customers={serialize(customers)}
      initialEntries={serialize(recentEntries)}
      initialTemplates={serialize(templates)}
      users={serialize(users)}
      userId={userId}
      role={role}
    />
  );
}
