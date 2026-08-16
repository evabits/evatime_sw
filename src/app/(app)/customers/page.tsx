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

  // Alle nummers, ook van gearchiveerde klanten: die houden hun nummer bezet
  // onder de unieke sleutel, dus een voorstel dat ze overslaat komt vroeg of
  // laat op een nummer uit dat al vergeven is.
  const nummers = await prisma.customer.findMany({
    where: { customerNumber: { not: null } },
    select: { customerNumber: true },
  });

  return (
    <CustomersClient
      initialCustomers={serialize(customers)}
      initialNumbers={nummers.map((n) => n.customerNumber!)}
    />
  );
}
