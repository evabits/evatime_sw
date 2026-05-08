import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { notFound } from "next/navigation";
import { serialize } from "@/lib/utils";
import { PrintInvoice } from "@/components/invoices/print-invoice";

export default async function PrintPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session) redirect("/login");

  const { id } = await params;
  const [invoice, settings] = await Promise.all([
    prisma.invoice.findUnique({
      where: { id },
      include: { customer: true, lines: { orderBy: { createdAt: "asc" } }, attachments: { orderBy: { createdAt: "asc" } } },
    }),
    prisma.companySettings.findFirst(),
  ]);

  if (!invoice) notFound();

  return <PrintInvoice invoice={serialize(invoice)} settings={serialize(settings)} />;
}
