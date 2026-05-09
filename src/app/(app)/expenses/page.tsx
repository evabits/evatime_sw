import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { serialize } from "@/lib/utils";
import { ExpensesClient } from "@/components/expenses/expenses-client";
import { canViewReimbursements, canViewAllEntries } from "@/lib/roles";

export default async function ExpensesPage() {
  const session = await auth();
  const userId = session?.user?.id ?? "";
  const role = (session?.user as any)?.role ?? "EMPLOYEE";

  const now = new Date();
  const from = new Date(now.getFullYear(), now.getMonth(), 1);
  const to = new Date(now.getFullYear(), now.getMonth() + 1, 0);

  const [categories, projects, initialExpenses] = await Promise.all([
    prisma.expenseCategory.findMany({ orderBy: { name: "asc" } }),
    prisma.project.findMany({
      where: { status: "ACTIVE" },
      orderBy: { name: "asc" },
      select: { id: true, name: true, customer: { select: { name: true } } },
    }),
    prisma.expense.findMany({
      where: {
        ...(canViewAllEntries(role) ? {} : { userId }),
        date: { gte: from, lte: to },
      },
      orderBy: { date: "desc" },
      include: {
        category: { select: { id: true, name: true } },
        project: { select: { id: true, name: true, customer: { select: { name: true } } } },
        user: { select: { id: true, name: true } },
      },
    }),
  ]);

  return (
    <ExpensesClient
      categories={serialize(categories)}
      projects={serialize(projects)}
      initialExpenses={serialize(initialExpenses)}
      role={role}
      canViewReimbursements={canViewReimbursements(role)}
    />
  );
}
