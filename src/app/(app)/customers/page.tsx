import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { serialize } from "@/lib/utils";
import { isAdmin } from "@/lib/roles";
import { CustomersClient } from "@/components/customers/customers-client";

export default async function CustomersPage() {
  const session = await auth();
  if (!isAdmin((session?.user as any)?.role ?? "EMPLOYEE")) redirect("/");

  const customers = await prisma.customer.findMany({
    where: { archivedAt: null },
    orderBy: { name: "asc" },
    include: { _count: { select: { projects: true, invoices: true } }, levelRates: true },
  });

  return <CustomersClient initialCustomers={serialize(customers)} />;
}
