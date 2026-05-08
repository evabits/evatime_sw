"use client";
import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatDate, formatCurrency } from "@/lib/utils";
import { ExternalLink, Trash2 } from "lucide-react";
import Link from "next/link";

const statusLabel: Record<string, string> = { DRAFT: "Concept", SENT: "Verzonden", PAID: "Betaald", CANCELLED: "Geannuleerd" };
const statusVariant: Record<string, string> = { DRAFT: "secondary", SENT: "default", PAID: "success", CANCELLED: "destructive" };

interface Props {
  initialInvoices: any[];
}

export function InvoicesClient({ initialInvoices }: Props) {
  const [invoices, setInvoices] = useState(initialInvoices);

  async function deleteInvoice(id: string) {
    if (!confirm("Weet u zeker dat u deze factuur wilt verwijderen? Gekoppelde registraties worden ontfactureerd.")) return;
    await fetch(`/api/invoices/${id}`, { method: "DELETE" });
    setInvoices((prev) => prev.filter((i) => i.id !== id));
  }

  return (
    <Card>
      <CardContent className="p-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Factuurnummer</TableHead>
              <TableHead>Klant</TableHead>
              <TableHead>Datum</TableHead>
              <TableHead>Vervaldatum</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Bedrag</TableHead>
              <TableHead></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {invoices.length === 0 && (
              <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground py-8">Geen facturen gevonden</TableCell></TableRow>
            )}
            {invoices.map((inv) => (
              <TableRow key={inv.id}>
                <TableCell className="font-mono font-medium">{inv.invoiceNumber}</TableCell>
                <TableCell>{inv.customer.name}</TableCell>
                <TableCell>{formatDate(inv.issueDate)}</TableCell>
                <TableCell>{formatDate(inv.dueDate)}</TableCell>
                <TableCell>
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <Badge variant={statusVariant[inv.status] as any}>{statusLabel[inv.status]}</Badge>
                    {inv.status === "SENT" && new Date(inv.dueDate) < new Date() && (
                      <Badge variant="destructive">Achterstallig</Badge>
                    )}
                  </div>
                </TableCell>
                <TableCell className="text-right">{formatCurrency(Number(inv.total))}</TableCell>
                <TableCell>
                  <div className="flex gap-1 justify-end">
                    <Button variant="ghost" size="icon" asChild>
                      <Link href={`/invoices/${inv.id}`}><ExternalLink className="h-3.5 w-3.5" /></Link>
                    </Button>
                    <Button variant="ghost" size="icon" onClick={() => deleteInvoice(inv.id)}>
                      <Trash2 className="h-3.5 w-3.5 text-destructive" />
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
