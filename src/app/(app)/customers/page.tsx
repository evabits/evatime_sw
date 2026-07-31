import { prisma } from "@/lib/prisma";
import { serialize } from "@/lib/utils";
import { CustomersClient } from "@/components/customers/customers-client";

export default async function CustomersPage() {
  const customers = await prisma.customer.findMany({
    where: { archivedAt: null },
    orderBy: { name: "asc" },
    include: { _count: { select: { projects: true, invoices: true } }, levelRates: true },
  });

  return <CustomersClient initialCustomers={serialize(customers)} />;
}
