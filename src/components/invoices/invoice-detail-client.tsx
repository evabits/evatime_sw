"use client";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow, TableFooter } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { formatDate, formatCurrency } from "@/lib/utils";
import { ArrowLeft, Printer } from "lucide-react";
import Link from "next/link";

const statusLabel: Record<string, string> = { DRAFT: "Concept", SENT: "Verzonden", PAID: "Betaald", CANCELLED: "Geannuleerd" };
const statusVariant: Record<string, string> = { DRAFT: "secondary", SENT: "default", PAID: "success", CANCELLED: "destructive" };

interface Props {
  invoice: any;
  settings: any;
}

export function InvoiceDetailClient({ invoice: initialInvoice, settings }: Props) {
  const [invoice, setInvoice] = useState(initialInvoice);
  const [saving, setSaving] = useState(false);

  async function updateStatus(status: string) {
    setSaving(true);
    const res = await fetch(`/api/invoices/${invoice.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    if (res.ok) setInvoice((prev: any) => ({ ...prev, status }));
    setSaving(false);
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" asChild>
          <Link href="/invoices"><ArrowLeft className="h-4 w-4" /></Link>
        </Button>
        <div className="flex-1">
          <h1 className="text-2xl font-bold">Factuur {invoice.invoiceNumber}</h1>
          <p className="text-muted-foreground">{invoice.customer.name}</p>
        </div>
        <div className="flex items-center gap-2">
          <Select value={invoice.status} onValueChange={updateStatus} disabled={saving}>
            <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="DRAFT">Concept</SelectItem>
              <SelectItem value="SENT">Verzonden</SelectItem>
              <SelectItem value="PAID">Betaald</SelectItem>
              <SelectItem value="CANCELLED">Geannuleerd</SelectItem>
            </SelectContent>
          </Select>
          <Button variant="outline" onClick={() => window.print()}>
            <Printer className="h-4 w-4 mr-2" /> Afdrukken
          </Button>
        </div>
      </div>

      <div id="invoice-print" className="space-y-6">
        <Card>
          <CardContent className="pt-6">
            <div className="grid gap-6 sm:grid-cols-2">
              <div>
                <p className="text-sm font-medium text-muted-foreground mb-1">Van</p>
                {settings ? (
                  <div className="text-sm space-y-0.5">
                    <p className="font-medium">{settings.name}</p>
                    {settings.address && <p>{settings.address}</p>}
                    {settings.city && <p>{settings.postalCode} {settings.city}</p>}
                    {settings.vatNumber && <p>BTW: {settings.vatNumber}</p>}
                    {settings.iban && <p>IBAN: {settings.iban}</p>}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">Stel bedrijfsgegevens in via Instellingen</p>
                )}
              </div>
              <div>
                <p className="text-sm font-medium text-muted-foreground mb-1">Aan</p>
                <div className="text-sm space-y-0.5">
                  <p className="font-medium">{invoice.customer.name}</p>
                  {invoice.customer.address && <p>{invoice.customer.address}</p>}
                  {invoice.customer.city && <p>{invoice.customer.postalCode} {invoice.customer.city}</p>}
                  {invoice.customer.vatNumber && <p>BTW: {invoice.customer.vatNumber}</p>}
                </div>
              </div>
            </div>
            <div className="mt-6 grid gap-4 sm:grid-cols-3 border-t pt-4">
              <div>
                <p className="text-xs text-muted-foreground">Factuurnummer</p>
                <p className="font-mono font-medium">{invoice.invoiceNumber}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Factuurdatum</p>
                <p>{formatDate(invoice.issueDate)}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Vervaldatum</p>
                <p>{formatDate(invoice.dueDate)}</p>
              </div>
            </div>
            <div className="mt-2 flex items-center gap-2">
              <Badge variant={statusVariant[invoice.status] as any}>{statusLabel[invoice.status]}</Badge>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Factuurregels</CardTitle></CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Omschrijving</TableHead>
                  <TableHead className="text-right">Aantal</TableHead>
                  <TableHead className="text-right">Prijs</TableHead>
                  <TableHead className="text-right">Totaal</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {invoice.lines.map((line: any) => (
                  <TableRow key={line.id}>
                    <TableCell>{line.description}</TableCell>
                    <TableCell className="text-right">{Number(line.quantity).toFixed(2)}</TableCell>
                    <TableCell className="text-right">{formatCurrency(Number(line.unitPrice))}</TableCell>
                    <TableCell className="text-right">{formatCurrency(Number(line.total))}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
              <TableFooter>
                <TableRow>
                  <TableCell colSpan={3} className="text-right">Subtotaal</TableCell>
                  <TableCell className="text-right">{formatCurrency(Number(invoice.subtotal))}</TableCell>
                </TableRow>
                <TableRow>
                  <TableCell colSpan={3} className="text-right">BTW ({Number(invoice.vatRate).toFixed(0)}%)</TableCell>
                  <TableCell className="text-right">{formatCurrency(Number(invoice.vatAmount))}</TableCell>
                </TableRow>
                <TableRow>
                  <TableCell colSpan={3} className="text-right font-bold text-base">Totaal</TableCell>
                  <TableCell className="text-right font-bold text-base">{formatCurrency(Number(invoice.total))}</TableCell>
                </TableRow>
              </TableFooter>
            </Table>
          </CardContent>
        </Card>

        {invoice.notes && (
          <Card>
            <CardHeader><CardTitle>Notities</CardTitle></CardHeader>
            <CardContent><p className="text-sm">{invoice.notes}</p></CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
