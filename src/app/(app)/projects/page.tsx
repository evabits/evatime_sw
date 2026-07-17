import { prisma } from "@/lib/prisma";
import { serialize } from "@/lib/utils";
import { ProjectsClient } from "@/components/projects/projects-client";

export default async function ProjectsPage({
  searchParams,
}: {
  searchParams: Promise<{ filter?: string }>;
}) {
  const { filter } = await searchParams;
  const [projects, customers, allTags] = await Promise.all([
    prisma.project.findMany({
      where: { archivedAt: null },
      orderBy: { name: "asc" },
      include: {
        customer: { select: { id: true, name: true } },
        _count: { select: { timeEntries: true, kmEntries: true } },
        tags: { select: { id: true, name: true } },
      },
    }),
    prisma.customer.findMany({ where: { archivedAt: null }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
    prisma.tag.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }),
  ]);

  return (
    <ProjectsClient
      initialProjects={serialize(projects)}
      customers={serialize(customers)}
      allTags={serialize(allTags)}
      initialNoCustomerOnly={filter === "no-customer"}
    />
  );
}
