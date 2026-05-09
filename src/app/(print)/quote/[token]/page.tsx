import { prisma } from "@/lib/prisma";
import { notFound } from "next/navigation";
import { serialize } from "@/lib/utils";
import { PublicQuoteView } from "@/components/quotes/public-quote-view";

export default async function PublicQuotePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;

  const [quote, settings] = await Promise.all([
    prisma.quote.findUnique({
      where: { viewToken: token },
      include: { customer: true, lines: { orderBy: { createdAt: "asc" } } },
    }),
    prisma.companySettings.findFirst(),
  ]);

  if (!quote) notFound();

  return <PublicQuoteView quote={serialize(quote)} settings={serialize(settings)} />;
}
