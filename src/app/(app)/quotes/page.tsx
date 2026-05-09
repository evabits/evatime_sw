import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { serialize } from "@/lib/utils";
import { QuotesClient } from "@/components/quotes/quotes-client";
import { Button } from "@/components/ui/button";
import { Plus } from "lucide-react";
import Link from "next/link";

export default async function QuotesPage() {
  const session = await auth();
  if ((session?.user as any)?.role !== "ADMIN") redirect("/");

  const quotes = await prisma.quote.findMany({
    orderBy: { issueDate: "desc" },
    include: { customer: { select: { name: true } } },
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Offertes</h1>
          <p className="text-muted-foreground">Beheer uw offertes</p>
        </div>
        <Button asChild>
          <Link href="/quotes/new"><Plus className="h-4 w-4 mr-2" /> Nieuwe offerte</Link>
        </Button>
      </div>
      <QuotesClient initialQuotes={serialize(quotes)} />
    </div>
  );
}
