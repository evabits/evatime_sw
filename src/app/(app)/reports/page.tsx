import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { serialize } from "@/lib/utils";
import { canViewReports } from "@/lib/roles";
import { PERIOD_ORDER, type PeriodPreset } from "@/lib/periods";
import { ReportsClient } from "@/components/reports/reports-client";

export default async function ReportsPage({
  searchParams,
}: {
  searchParams: Promise<{ project?: string; period?: string }>;
}) {
  const { project, period } = await searchParams;
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

  // Een link van buitenaf mag het filter vullen, maar niet zomaar iets: een
  // onbekend project of een verzonnen periode valt terug op het gewone scherm.
  const gekozenProject = projects.some((p) => p.id === project) ? project! : "";
  const gekozenPeriode = PERIOD_ORDER.includes(period as PeriodPreset)
    ? (period as PeriodPreset)
    : undefined;

  return (
    <ReportsClient
      customers={serialize(customers)}
      projects={serialize(projects)}
      users={serializedUsers}
      tags={serialize(tags)}
      categories={serialize(categories)}
      role={(session?.user as any)?.role ?? "EMPLOYEE"}
      initialProjectId={gekozenProject}
      initialPeriod={gekozenPeriode}
    />
  );
}
