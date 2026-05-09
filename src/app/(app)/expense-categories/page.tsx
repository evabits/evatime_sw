import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { ExpenseCategoriesClient } from "@/components/expense-categories/expense-categories-client";

export default async function ExpenseCategoriesPage() {
  const session = await auth();
  if ((session?.user as any)?.role !== "ADMIN") redirect("/");

  const categories = await prisma.expenseCategory.findMany({ orderBy: { name: "asc" } });

  return <ExpenseCategoriesClient initialCategories={categories.map((c) => ({ ...c, createdAt: c.createdAt.toISOString(), updatedAt: c.updatedAt.toISOString() }))} />;
}
