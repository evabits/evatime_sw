import { prisma } from "@/lib/prisma";
import { notFound } from "next/navigation";
import { serialize } from "@/lib/utils";
import { PrintInvoice } from "@/components/invoices/print-invoice";

export default async function PublicInvoicePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;

  const [invoice, settings] = await Promise.all([
    prisma.invoice.findUnique({
      where: { viewToken: token },
      include: {
        customer: true,
        lines: { orderBy: { createdAt: "asc" } },
        attachments: { orderBy: { createdAt: "asc" } },
      },
    }),
    prisma.companySettings.findFirst(),
  ]);

  if (!invoice) notFound();

  return <PrintInvoice invoice={serialize(invoice)} settings={serialize(settings)} autoPrint={false} />;
}
