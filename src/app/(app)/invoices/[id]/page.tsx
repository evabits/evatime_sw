import { prisma } from "@/lib/prisma";
import { notFound } from "next/navigation";
import { InvoiceDetailClient } from "@/components/invoices/invoice-detail-client";

export default async function InvoiceDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const invoice = await prisma.invoice.findUnique({
    where: { id },
    include: {
      customer: true,
      lines: true,
    },
  });

  if (!invoice) notFound();

  const settings = await prisma.companySettings.findFirst();

  return <InvoiceDetailClient invoice={invoice} settings={settings} />;
}
