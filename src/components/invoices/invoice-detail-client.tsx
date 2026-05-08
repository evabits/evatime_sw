"use client";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow, TableFooter } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { formatDate, formatCurrency } from "@/lib/utils";
import { ArrowLeft, Printer, Pencil, Plus, Trash2, Check, X, ExternalLink } from "lucide-react";
import Link from "next/link";
import { format } from "date-fns";

const statusLabel: Record<string, string> = {
  DRAFT: "Concept",
  SENT: "Verzonden",
  PAID: "Betaald",
  CANCELLED: "Geannuleerd",
};
const statusVariant: Record<string, string> = {
  DRAFT: "secondary",
  SENT: "default",
  PAID: "success",
  CANCELLED: "destructive",
};

interface Line {
  id?: string;
  description: string;
  quantity: number;
  unitPrice: number;
  total: number;
  lineType: "HOURS" | "KM" | "OTHER";
  _new?: boolean;
}

interface Props {
  invoice: any;
  settings: any;
}

export function InvoiceDetailClient({ invoice: initialInvoice, settings }: Props) {
  const [invoice, setInvoice] = useState(initialInvoice);
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState("");

  // Edit state
  const [issueDate, setIssueDate] = useState(format(new Date(invoice.issueDate), "yyyy-MM-dd"));
  const [dueDate, setDueDate] = useState(format(new Date(invoice.dueDate), "yyyy-MM-dd"));
  const [vatRate, setVatRate] = useState(Number(invoice.vatRate));
  const [notes, setNotes] = useState(invoice.notes ?? "");
  const [lines, setLines] = useState<Line[]>(
    invoice.lines.map((l: any) => ({
      id: l.id,
      description: l.description,
      quantity: Number(l.quantity),
      unitPrice: Number(l.unitPrice),
      total: Number(l.total),
      lineType: l.lineType,
    }))
  );
  const [lineIdsToDelete, setLineIdsToDelete] = useState<string[]>([]);

  const isDraft = invoice.status === "DRAFT";

  function computedSubtotal() {
    return lines.reduce((s, l) => s + l.quantity * l.unitPrice, 0);
  }
  function computedVat() {
    return (computedSubtotal() * vatRate) / 100;
  }
  function computedTotal() {
    return computedSubtotal() + computedVat();
  }

  function updateLine(i: number, field: keyof Line, value: any) {
    setLines((prev) =>
      prev.map((l, idx) => {
        if (idx !== i) return l;
        const updated = { ...l, [field]: value };
        updated.total = updated.quantity * updated.unitPrice;
        return updated;
      })
    );
  }

  function removeLine(i: number) {
    const line = lines[i];
    if (line.id) setLineIdsToDelete((prev) => [...prev, line.id!]);
    setLines((prev) => prev.filter((_, idx) => idx !== i));
  }

  function addLine() {
    setLines((prev) => [...prev, { description: "", quantity: 1, unitPrice: 0, total: 0, lineType: "OTHER", _new: true }]);
  }

  function cancelEdit() {
    setEditing(false);
    setError("");
    setLines(
      invoice.lines.map((l: any) => ({
        id: l.id,
        description: l.description,
        quantity: Number(l.quantity),
        unitPrice: Number(l.unitPrice),
        total: Number(l.total),
        lineType: l.lineType,
      }))
    );
    setLineIdsToDelete([]);
    setIssueDate(format(new Date(invoice.issueDate), "yyyy-MM-dd"));
    setDueDate(format(new Date(invoice.dueDate), "yyyy-MM-dd"));
    setVatRate(Number(invoice.vatRate));
    setNotes(invoice.notes ?? "");
  }

  async function saveEdit() {
    setSaving(true);
    setError("");
    const res = await fetch(`/api/invoices/${invoice.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ issueDate, dueDate, vatRate, notes, lines, lineIdsToDelete }),
    });
    setSaving(false);
    if (res.ok) {
      const updated = await res.json();
      setInvoice(updated);
      setLines(
        updated.lines.map((l: any) => ({
          id: l.id,
          description: l.description,
          quantity: Number(l.quantity),
          unitPrice: Number(l.unitPrice),
          total: Number(l.total),
          lineType: l.lineType,
        }))
      );
      setLineIdsToDelete([]);
      setEditing(false);
    } else {
      const err = await res.json().catch(() => ({}));
      setError(err.error ?? "Fout bij opslaan");
    }
  }

  async function updateStatus(status: string) {
    setSaving(true);
    const res = await fetch(`/api/invoices/${invoice.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    if (res.ok) {
      const updated = await res.json();
      setInvoice((prev: any) => ({ ...prev, status: updated.status }));
    }
    setSaving(false);
  }

  const displayLines = editing ? lines : invoice.lines;
  const sub = editing ? computedSubtotal() : Number(invoice.subtotal);
  const vat = editing ? computedVat() : Number(invoice.vatAmount);
  const tot = editing ? computedTotal() : Number(invoice.total);

  return (
    <div className="space-y-6">
      {/* Top bar */}
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" asChild>
          <Link href="/invoices"><ArrowLeft className="h-4 w-4" /></Link>
        </Button>
        <div className="flex-1">
          <h1 className="text-2xl font-bold">Factuur {invoice.invoiceNumber}</h1>
          <p className="text-muted-foreground">{invoice.customer?.name}</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {isDraft && !editing && (
            <Button variant="outline" onClick={() => setEditing(true)}>
              <Pencil className="h-4 w-4 mr-2" /> Bewerken
            </Button>
          )}
          {editing && (
            <>
              <Button variant="outline" onClick={cancelEdit} disabled={saving}>
                <X className="h-4 w-4 mr-2" /> Annuleren
              </Button>
              <Button onClick={saveEdit} disabled={saving}>
                <Check className="h-4 w-4 mr-2" /> {saving ? "Opslaan..." : "Opslaan"}
              </Button>
            </>
          )}
          {!editing && (
            <>
              <Select value={invoice.status} onValueChange={updateStatus} disabled={saving}>
                <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="DRAFT">Concept</SelectItem>
                  <SelectItem value="SENT">Verzonden</SelectItem>
                  <SelectItem value="PAID">Betaald</SelectItem>
                  <SelectItem value="CANCELLED">Geannuleerd</SelectItem>
                </SelectContent>
              </Select>
              <Button variant="outline" asChild>
                <Link href={`/invoices/${invoice.id}/print`} target="_blank">
                  <Printer className="h-4 w-4 mr-2" /> Afdrukken / PDF
                </Link>
              </Button>
              <Button variant="ghost" size="icon" asChild title="Openen in nieuw tabblad">
                <Link href={`/invoices/${invoice.id}/print`} target="_blank">
                  <ExternalLink className="h-4 w-4" />
                </Link>
              </Button>
            </>
          )}
        </div>
      </div>

      {error && <p className="text-sm text-destructive bg-destructive/10 px-4 py-2 rounded-md">{error}</p>}

      {/* Invoice header card */}
      <Card>
        <CardContent className="pt-6">
          <div className="grid gap-6 sm:grid-cols-2">
            <div>
              <p className="text-sm font-medium text-muted-foreground mb-1">Van</p>
              {settings ? (
                <div className="text-sm space-y-0.5">
                  {settings.logoUrl && (
                    <img src={settings.logoUrl} alt="Logo" className="h-12 mb-2 object-contain" />
                  )}
                  <p className="font-medium">{settings.name}</p>
                  {settings.address && <p className="text-muted-foreground">{settings.address}</p>}
                  {settings.city && <p className="text-muted-foreground">{settings.postalCode} {settings.city}</p>}
                  {settings.vatNumber && <p className="text-muted-foreground">BTW: {settings.vatNumber}</p>}
                  {settings.iban && <p className="text-muted-foreground">IBAN: {settings.iban}</p>}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">
                  Stel bedrijfsgegevens in via{" "}
                  <Link href="/settings" className="underline">Instellingen</Link>
                </p>
              )}
            </div>
            <div>
              <p className="text-sm font-medium text-muted-foreground mb-1">Aan</p>
              <div className="text-sm space-y-0.5">
                <p className="font-medium">{invoice.customer?.name}</p>
                {invoice.customer?.address && <p className="text-muted-foreground">{invoice.customer.address}</p>}
                {invoice.customer?.city && <p className="text-muted-foreground">{invoice.customer.postalCode} {invoice.customer.city}</p>}
                {invoice.customer?.vatNumber && <p className="text-muted-foreground">BTW: {invoice.customer.vatNumber}</p>}
              </div>
            </div>
          </div>

          <div className="mt-6 grid gap-4 sm:grid-cols-4 border-t pt-4">
            <div>
              <p className="text-xs text-muted-foreground">Factuurnummer</p>
              <p className="font-mono font-medium">{invoice.invoiceNumber}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Factuurdatum</p>
              {editing ? (
                <Input type="date" value={issueDate} onChange={(e) => setIssueDate(e.target.value)} className="h-7 text-sm mt-1" />
              ) : (
                <p>{formatDate(invoice.issueDate)}</p>
              )}
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Vervaldatum</p>
              {editing ? (
                <Input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} className="h-7 text-sm mt-1" />
              ) : (
                <p>{formatDate(invoice.dueDate)}</p>
              )}
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Status</p>
              <Badge variant={statusVariant[invoice.status] as any}>{statusLabel[invoice.status]}</Badge>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Lines */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>Factuurregels</CardTitle>
            {editing && (
              <Button size="sm" variant="outline" onClick={addLine}>
                <Plus className="h-4 w-4 mr-2" /> Regel toevoegen
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Omschrijving</TableHead>
                <TableHead className="text-right w-28">Aantal</TableHead>
                <TableHead className="text-right w-28">Prijs</TableHead>
                <TableHead className="text-right w-28">Totaal</TableHead>
                {editing && <TableHead className="w-10" />}
              </TableRow>
            </TableHeader>
            <TableBody>
              {displayLines.map((line: any, i: number) => (
                <TableRow key={line.id ?? i}>
                  <TableCell>
                    {editing ? (
                      <Input
                        value={line.description}
                        onChange={(e) => updateLine(i, "description", e.target.value)}
                        className="h-8"
                      />
                    ) : line.description}
                  </TableCell>
                  <TableCell className="text-right">
                    {editing ? (
                      <Input
                        type="number"
                        step="0.01"
                        value={line.quantity}
                        onChange={(e) => updateLine(i, "quantity", Number(e.target.value))}
                        className="h-8 text-right"
                      />
                    ) : Number(line.quantity).toFixed(2)}
                  </TableCell>
                  <TableCell className="text-right">
                    {editing ? (
                      <Input
                        type="number"
                        step="0.01"
                        value={line.unitPrice}
                        onChange={(e) => updateLine(i, "unitPrice", Number(e.target.value))}
                        className="h-8 text-right"
                      />
                    ) : formatCurrency(Number(line.unitPrice))}
                  </TableCell>
                  <TableCell className="text-right">
                    {formatCurrency(editing ? line.quantity * line.unitPrice : Number(line.total))}
                  </TableCell>
                  {editing && (
                    <TableCell>
                      <Button variant="ghost" size="icon" onClick={() => removeLine(i)}>
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </TableCell>
                  )}
                </TableRow>
              ))}
            </TableBody>
            <TableFooter>
              {editing && (
                <TableRow>
                  <TableCell colSpan={2} />
                  <TableCell className="text-right text-xs text-muted-foreground">BTW %</TableCell>
                  <TableCell colSpan={editing ? 2 : 1}>
                    <Input
                      type="number"
                      min="0"
                      max="100"
                      value={vatRate}
                      onChange={(e) => setVatRate(Number(e.target.value))}
                      className="h-8 text-right w-20 ml-auto"
                    />
                  </TableCell>
                </TableRow>
              )}
              <TableRow>
                <TableCell colSpan={editing ? 3 : 2} className="text-right text-muted-foreground">Subtotaal</TableCell>
                <TableCell className="text-right">{formatCurrency(sub)}</TableCell>
                {editing && <TableCell />}
              </TableRow>
              <TableRow>
                <TableCell colSpan={editing ? 3 : 2} className="text-right text-muted-foreground">BTW ({editing ? vatRate : Number(invoice.vatRate).toFixed(0)}%)</TableCell>
                <TableCell className="text-right">{formatCurrency(vat)}</TableCell>
                {editing && <TableCell />}
              </TableRow>
              <TableRow>
                <TableCell colSpan={editing ? 3 : 2} className="text-right font-bold text-base">Totaal</TableCell>
                <TableCell className="text-right font-bold text-base">{formatCurrency(tot)}</TableCell>
                {editing && <TableCell />}
              </TableRow>
            </TableFooter>
          </Table>
        </CardContent>
      </Card>

      {/* Notes / free text */}
      <Card>
        <CardHeader><CardTitle className="text-base">Opmerkingen / betalingstermijn</CardTitle></CardHeader>
        <CardContent>
          {editing ? (
            <Textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Bijv. Betaaltermijn: 30 dagen na factuurdatum. Graag overmaken onder vermelding van het factuurnummer."
              rows={4}
            />
          ) : invoice.notes ? (
            <p className="text-sm whitespace-pre-wrap">{invoice.notes}</p>
          ) : (
            <p className="text-sm text-muted-foreground italic">
              {isDraft ? "Klik op 'Bewerken' om opmerkingen toe te voegen" : "Geen opmerkingen"}
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
