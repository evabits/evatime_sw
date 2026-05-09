import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { ReportsClient } from "@/components/reports/reports-client";

export default async function ReportsPage() {
  const session = await auth();
  const [customers, projects, users, tags] = await Promise.all([
    prisma.customer.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }),
    prisma.project.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true, customerId: true } }),
    prisma.user.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true, weeklyHours: true } }),
    prisma.tag.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }),
  ]);

  const serializedUsers = users.map((u) => ({ ...u, weeklyHours: u.weeklyHours ? Number(u.weeklyHours) : null }));

  return (
    <ReportsClient
      customers={customers}
      projects={projects}
      users={serializedUsers}
      currentUserId={session?.user?.id ?? ""}
      tags={tags}
    />
  );
}
