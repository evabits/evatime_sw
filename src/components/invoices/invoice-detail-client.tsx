"use client";
import { useState, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow, TableFooter } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { formatDate, formatCurrency } from "@/lib/utils";
import { ArrowLeft, Printer, Pencil, Plus, Trash2, Check, X, ExternalLink, Mail, Bell, Paperclip, Download, Eye } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
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

function fmtBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function InvoiceDetailClient({ invoice: initialInvoice, settings }: Props) {
  const [invoice, setInvoice] = useState(initialInvoice);
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState("");
  const [sending, setSending] = useState(false);
  const [reminding, setReminding] = useState(false);
  const [confirmDialog, setConfirmDialog] = useState<{ type: "send" | "remind" } | null>(null);
  const [uploadingFile, setUploadingFile] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Edit state
  const [issueDate, setIssueDate] = useState(format(new Date(invoice.issueDate), "yyyy-MM-dd"));
  const [dueDate, setDueDate] = useState(format(new Date(invoice.dueDate), "yyyy-MM-dd"));
  const [vatRate, setVatRate] = useState(Number(invoice.vatRate));
  const [notes, setNotes] = useState(invoice.notes ?? "");
  const [reference, setReference] = useState(invoice.reference ?? "");
  const [subject, setSubject] = useState(invoice.subject ?? "");
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
  const attachments: any[] = invoice.attachments ?? [];

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
    setReference(invoice.reference ?? "");
    setSubject(invoice.subject ?? "");
  }

  async function saveEdit() {
    setSaving(true);
    setError("");
    const res = await fetch(`/api/invoices/${invoice.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ issueDate, dueDate, vatRate, notes, reference, subject, lines, lineIdsToDelete }),
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

  async function sendInvoice() {
    setSending(true);
    setError("");
    const res = await fetch(`/api/invoices/${invoice.id}/send`, { method: "POST" });
    setSending(false);
    if (res.ok) {
      const data = await res.json();
      setInvoice((prev: any) => ({ ...prev, sentAt: data.sentAt, status: data.status }));
    } else {
      const err = await res.json().catch(() => ({}));
      setError(err.error ?? "Fout bij verzenden");
    }
  }

  async function sendReminder() {
    setReminding(true);
    setError("");
    const res = await fetch(`/api/invoices/${invoice.id}/remind`, { method: "POST" });
    setReminding(false);
    if (res.ok) {
      const data = await res.json();
      setInvoice((prev: any) => ({ ...prev, reminderSentAt: data.reminderSentAt }));
    } else {
      const err = await res.json().catch(() => ({}));
      setError(err.error ?? "Fout bij herinnering sturen");
    }
  }

  async function uploadAttachment(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingFile(true);
    setError("");
    const fd = new FormData();
    fd.append("file", file);
    const res = await fetch(`/api/invoices/${invoice.id}/attachments`, { method: "POST", body: fd });
    setUploadingFile(false);
    if (res.ok) {
      const attachment = await res.json();
      setInvoice((prev: any) => ({ ...prev, attachments: [...(prev.attachments ?? []), attachment] }));
    } else {
      const err = await res.json().catch(() => ({}));
      setError(err.error ?? "Fout bij uploaden");
    }
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  async function deleteAttachment(attachmentId: string) {
    if (!confirm("Bijlage verwijderen?")) return;
    const res = await fetch(`/api/invoices/${invoice.id}/attachments/${attachmentId}`, { method: "DELETE" });
    if (res.ok) {
      setInvoice((prev: any) => ({
        ...prev,
        attachments: (prev.attachments ?? []).filter((a: any) => a.id !== attachmentId),
      }));
    }
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
              {invoice.customer?.email && invoice.status !== "PAID" && invoice.status !== "CANCELLED" && (
                <Button variant="outline" onClick={() => setConfirmDialog({ type: "send" })} disabled={sending}>
                  <Mail className="h-4 w-4 mr-2" /> {sending ? "Verzenden..." : "Verzenden"}
                </Button>
              )}
              {invoice.status === "SENT" && invoice.customer?.email && (
                <Button variant="outline" onClick={() => setConfirmDialog({ type: "remind" })} disabled={reminding}>
                  <Bell className="h-4 w-4 mr-2" /> {reminding ? "Sturen..." : "Herinnering"}
                </Button>
              )}
              <Button variant="outline" asChild>
                <Link href={`/invoices/${invoice.id}/print?preview=1`} target="_blank">
                  <Eye className="h-4 w-4 mr-2" /> Voorbeeld
                </Link>
              </Button>
              <Button variant="outline" asChild>
                <a href={`/api/invoices/${invoice.id}/pdf`} download={`Factuur-${invoice.invoiceNumber}.pdf`}>
                  <Printer className="h-4 w-4 mr-2" /> PDF downloaden
                </a>
              </Button>
              <Button variant="ghost" size="icon" asChild title="Bekijken in nieuw tabblad">
                <Link href={`/invoice/${invoice.viewToken}`} target="_blank">
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
                  {settings.kvkNumber && <p className="text-muted-foreground">KvK: {settings.kvkNumber}</p>}
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

          <div className="mt-6 grid gap-4 sm:grid-cols-2 md:grid-cols-4 border-t pt-4">
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

          {/* Reference / Subject */}
          <div className="mt-4 grid gap-4 sm:grid-cols-2 border-t pt-4">
            <div>
              <p className="text-xs text-muted-foreground mb-1">Kenmerk</p>
              {editing ? (
                <Input value={reference} onChange={(e) => setReference(e.target.value)} placeholder="Bijv. MED-FEB26" className="h-7 text-sm" />
              ) : (
                <p className="text-sm">{invoice.reference || <span className="text-muted-foreground italic">—</span>}</p>
              )}
            </div>
            <div>
              <p className="text-xs text-muted-foreground mb-1">Onderwerp</p>
              {editing ? (
                <Input value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="Bijv. Uren februari 2026" className="h-7 text-sm" />
              ) : (
                <p className="text-sm">{invoice.subject || <span className="text-muted-foreground italic">—</span>}</p>
              )}
            </div>
          </div>

          {/* Sent timestamps */}
          {(invoice.sentAt || invoice.reminderSentAt) && (
            <div className="mt-4 flex flex-wrap gap-4 border-t pt-4 text-xs text-muted-foreground">
              {invoice.sentAt && (
                <span>Verzonden: {new Date(invoice.sentAt).toLocaleString("nl-NL")}</span>
              )}
              {invoice.reminderSentAt && (
                <span>Herinnering: {new Date(invoice.reminderSentAt).toLocaleString("nl-NL")}</span>
              )}
            </div>
          )}
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

      {/* Notes */}
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

      {/* Attachments */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-base flex items-center gap-2">
              <Paperclip className="h-4 w-4" /> Bijlagen
              {attachments.length > 0 && <span className="text-sm font-normal text-muted-foreground">({attachments.length})</span>}
            </CardTitle>
            <div>
              <input
                ref={fileInputRef}
                type="file"
                className="hidden"
                accept=".pdf,.png,.jpg,.jpeg,.xlsx,.docx"
                onChange={uploadAttachment}
              />
              <Button size="sm" variant="outline" onClick={() => fileInputRef.current?.click()} disabled={uploadingFile}>
                <Plus className="h-4 w-4 mr-2" /> {uploadingFile ? "Uploaden..." : "Bijlage toevoegen"}
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {attachments.length === 0 ? (
            <p className="text-sm text-muted-foreground italic">Geen bijlagen</p>
          ) : (
            <ul className="space-y-2">
              {attachments.map((a: any) => (
                <li key={a.id} className="flex items-center justify-between gap-2 text-sm p-2 rounded-md border">
                  <div className="flex items-center gap-2 min-w-0">
                    <Paperclip className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                    <span className="truncate">{a.filename}</span>
                    <span className="text-xs text-muted-foreground shrink-0">{fmtBytes(a.size)}</span>
                  </div>
                  <div className="flex gap-1 shrink-0">
                    <Button variant="ghost" size="icon" asChild>
                      <a href={`/api/invoices/${invoice.id}/attachments/${a.id}/download`} download={a.filename}>
                        <Download className="h-3.5 w-3.5" />
                      </a>
                    </Button>
                    <Button variant="ghost" size="icon" onClick={() => deleteAttachment(a.id)}>
                      <Trash2 className="h-3.5 w-3.5 text-destructive" />
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
      {/* Send / remind confirmation dialog */}
      <Dialog open={!!confirmDialog} onOpenChange={(open) => { if (!open) setConfirmDialog(null); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>
              {confirmDialog?.type === "remind" ? "Betalingsherinnering sturen" : "Factuur verzenden"}
            </DialogTitle>
            <DialogDescription>
              {confirmDialog?.type === "remind"
                ? "Er wordt een betalingsherinnering verstuurd naar:"
                : "De factuur wordt per e-mail verstuurd naar:"}
            </DialogDescription>
          </DialogHeader>
          <p className="font-medium text-sm">{invoice.customer?.email}</p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmDialog(null)}>Annuleren</Button>
            <Button
              onClick={() => {
                setConfirmDialog(null);
                if (confirmDialog?.type === "remind") sendReminder();
                else sendInvoice();
              }}
            >
              {confirmDialog?.type === "remind" ? "Herinnering sturen" : "Verzenden"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
