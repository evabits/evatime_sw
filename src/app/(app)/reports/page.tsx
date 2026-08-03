import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { serialize } from "@/lib/utils";
import { canViewReports } from "@/lib/roles";
import { ReportsClient } from "@/components/reports/reports-client";

export default async function ReportsPage() {
  const session = await auth();
  if (!canViewReports((session?.user as any)?.role ?? "EMPLOYEE")) redirect("/");
  const [customers, projects, users, tags, categories] = await Promise.all([
    prisma.customer.findMany({ where: { archivedAt: null }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
    prisma.project.findMany({
      where: { archivedAt: null },
      orderBy: { name: "asc" },
      select: { id: true, name: true, customerId: true, customer: { select: { name: true } } },
    }),
    prisma.user.findMany({ where: { archivedAt: null }, orderBy: { name: "asc" }, select: { id: true, name: true, weeklyHours: true } }),
    prisma.tag.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }),
    prisma.expenseCategory.findMany({ orderBy: { name: "asc" } }),
  ]);

  const serializedUsers = users.map((u) => ({ ...u, weeklyHours: u.weeklyHours ? Number(u.weeklyHours) : null }));

  return (
    <ReportsClient
      customers={serialize(customers)}
      projects={serialize(projects)}
      users={serializedUsers}
      tags={serialize(tags)}
      categories={serialize(categories)}
      role={(session?.user as any)?.role ?? "EMPLOYEE"}
    />
  );
}
