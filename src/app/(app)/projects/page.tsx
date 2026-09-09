import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { serialize } from "@/lib/utils";
import { ProjectsClient } from "@/components/projects/projects-client";

export default async function ProjectsPage({
  searchParams,
}: {
  searchParams: Promise<{ filter?: string }>;
}) {
  const session = await auth();
  if ((session?.user as any)?.role !== "ADMIN") redirect("/");

  const { filter } = await searchParams;
  const [projects, customers, allTags, users, urenPerProject] = await Promise.all([
    prisma.project.findMany({
      where: { archivedAt: null },
      orderBy: { name: "asc" },
      include: {
        customer: { select: { id: true, name: true } },
        _count: { select: { timeEntries: true, kmEntries: true } },
        tags: { select: { id: true, name: true } },
        levelRates: true,
        members: { select: { userId: true } },
      },
    }),
    prisma.customer.findMany({ where: { archivedAt: null }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
    prisma.tag.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }),
    prisma.user.findMany({ where: { archivedAt: null }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
    // De geschreven uren per project. Apart, want Prisma kan in findMany wel
    // rijen tellen maar geen kolom van een relatie optellen — en het aantal
    // registraties zei niets: drie dagen van acht uur stonden er als "3".
    prisma.timeEntry.groupBy({ by: ["projectId"], _sum: { hours: true } }),
  ]);

  const uren = new Map(
    urenPerProject.map((r) => [r.projectId, Number(r._sum.hours ?? 0)]),
  );
  const rijen = projects.map((p) => ({ ...p, hours: uren.get(p.id) ?? 0 }));

  return (
    <ProjectsClient
      initialProjects={serialize(rijen)}
      customers={serialize(customers)}
      allTags={serialize(allTags)}
      users={serialize(users)}
      initialNoCustomerOnly={filter === "no-customer"}
    />
  );
}
