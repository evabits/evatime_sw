import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { notFound } from "next/navigation";
import { serialize } from "@/lib/utils";
import { QuoteDetailClient } from "@/components/quotes/quote-detail-client";

export default async function QuoteDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if ((session?.user as any)?.role !== "ADMIN") redirect("/");

  const { id } = await params;
  const [quote, settings] = await Promise.all([
    prisma.quote.findUnique({
      where: { id },
      include: {
        customer: true,
        lines: { orderBy: { createdAt: "asc" } },
        attachments: { orderBy: { createdAt: "asc" } },
      },
    }),
    prisma.companySettings.findFirst(),
  ]);

  if (!quote) notFound();

  return <QuoteDetailClient quote={serialize(quote)} settings={serialize(settings)} />;
}
