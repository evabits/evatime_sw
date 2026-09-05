import { prisma } from "@/lib/prisma";
import { serialize } from "@/lib/utils";
import { NewInvoiceClient } from "@/components/invoices/new-invoice-client";

export default async function NewInvoicePage() {
  const customers = await prisma.customer.findMany({
    where: { archivedAt: null },
    orderBy: { name: "asc" },
    // De taal bepaalt in welke taal de regelomschrijvingen worden opgesteld.
    select: { id: true, name: true, language: true },
  });

  return <NewInvoiceClient customers={serialize(customers)} />;
}
