import { prisma } from "@/lib/prisma";
import { serialize } from "@/lib/utils";
import { NewInvoiceClient } from "@/components/invoices/new-invoice-client";

export default async function NewInvoicePage() {
  const customers = await prisma.customer.findMany({
    orderBy: { name: "asc" },
    select: { id: true, name: true },
  });

  return <NewInvoiceClient customers={serialize(customers)} />;
}
