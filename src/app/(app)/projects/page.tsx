import { prisma } from "@/lib/prisma";
import { serialize } from "@/lib/utils";
import { ProjectsClient } from "@/components/projects/projects-client";

export default async function ProjectsPage() {
  const [projects, customers, allTags] = await Promise.all([
    prisma.project.findMany({
      orderBy: { name: "asc" },
      include: {
        customer: { select: { id: true, name: true } },
        _count: { select: { timeEntries: true, kmEntries: true } },
        tags: { select: { id: true, name: true } },
      },
    }),
    prisma.customer.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }),
    prisma.tag.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }),
  ]);

  return (
    <ProjectsClient
      initialProjects={serialize(projects)}
      customers={serialize(customers)}
      allTags={serialize(allTags)}
    />
  );
}
