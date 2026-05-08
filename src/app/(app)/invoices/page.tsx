import { prisma } from "@/lib/prisma";
import { serialize } from "@/lib/utils";
import { InvoicesClient } from "@/components/invoices/invoices-client";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Plus } from "lucide-react";

export default async function InvoicesPage() {
  const invoices = await prisma.invoice.findMany({
    orderBy: { issueDate: "desc" },
    include: { customer: { select: { name: true } } },
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Facturen</h1>
          <p className="text-muted-foreground">Beheer uw facturen</p>
        </div>
        <Button asChild>
          <Link href="/invoices/new"><Plus className="h-4 w-4 mr-2" /> Nieuwe factuur</Link>
        </Button>
      </div>
      <InvoicesClient initialInvoices={serialize(invoices)} />
    </div>
  );
}
