import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { notFound } from "next/navigation";
import { serialize } from "@/lib/utils";
import { PrintQuote } from "@/components/quotes/print-quote";

export default async function PrintQuotePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ preview?: string }>;
}) {
  const session = await auth();
  if (!session) redirect("/login");

  const { id } = await params;
  const { preview } = await searchParams;

  const [quote, settings] = await Promise.all([
    prisma.quote.findUnique({
      where: { id },
      include: { customer: true, lines: { orderBy: { createdAt: "asc" } } },
    }),
    prisma.companySettings.findFirst(),
  ]);

  if (!quote) notFound();

  return <PrintQuote quote={serialize(quote)} settings={serialize(settings)} autoPrint={!preview} />;
}
