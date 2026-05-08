import { prisma } from "@/lib/prisma";
import { ProjectsClient } from "@/components/projects/projects-client";

export default async function ProjectsPage() {
  const [projects, customers] = await Promise.all([
    prisma.project.findMany({
      orderBy: { name: "asc" },
      include: {
        customer: { select: { id: true, name: true } },
        _count: { select: { timeEntries: true, kmEntries: true } },
      },
    }),
    prisma.customer.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }),
  ]);

  return <ProjectsClient initialProjects={projects} customers={customers} />;
}
