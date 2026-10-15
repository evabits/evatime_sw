import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { serialize } from "@/lib/utils";
import { ExpensesClient } from "@/components/expenses/expenses-client";
import { canViewReimbursements, canViewAllEntries, isAdmin } from "@/lib/roles";

export default async function ExpensesPage() {
  const session = await auth();
  const userId = session?.user?.id ?? "";
  const role = (session?.user as any)?.role ?? "EMPLOYEE";
  const admin = isAdmin(role);

  const now = new Date();
  const from = new Date(now.getFullYear(), now.getMonth(), 1);
  const to = new Date(now.getFullYear(), now.getMonth() + 1, 0);

  const [customers, projects, initialExpenses, users] = await Promise.all([
    prisma.customer.findMany({ where: { archivedAt: null }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
    prisma.project.findMany({
      where: {
        status: "ACTIVE",
        archivedAt: null,
        ...(admin ? {} : { members: { some: { userId } } }),
      },
      orderBy: { name: "asc" },
      // description is voor de tooltip op de projectkeuze.
      select: { id: true, name: true, description: true, customerId: true, customer: { select: { name: true } } },
    }),
    prisma.expense.findMany({
      where: {
        ...(canViewAllEntries(role) ? {} : { userId }),
        date: { gte: from, lte: to },
      },
      orderBy: { date: "desc" },
      include: {
        customer: { select: { id: true, name: true } },
        project: { select: { id: true, name: true, billable: true, customerId: true, customer: { select: { name: true } } } },
        user: { select: { id: true, name: true } },
      },
    }),
    isAdmin(role)
      ? prisma.user.findMany({ where: { archivedAt: null }, orderBy: { name: "asc" }, select: { id: true, name: true } })
      : Promise.resolve([]),
  ]);

  return (
    <ExpensesClient
      customers={serialize(customers)}
      projects={serialize(projects)}
      initialExpenses={serialize(initialExpenses)}
      users={serialize(users)}
      userId={userId}
      role={role}
      canViewReimbursements={canViewReimbursements(role)}
    />
  );
}
