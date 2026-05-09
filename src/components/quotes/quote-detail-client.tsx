"use client";
import { useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow, TableFooter } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { formatDate, formatCurrency } from "@/lib/utils";
import { ArrowLeft, Printer, Pencil, Plus, Trash2, Check, X, Eye, Mail, Paperclip, Download, FileText } from "lucide-react";
import Link from "next/link";
import { format } from "date-fns";

const statusLabel: Record<string, string> = {
  DRAFT: "Concept", SENT: "Verzonden", APPROVED: "Goedgekeurd", CANCELLED: "Geannuleerd",
};
const statusVariant: Record<string, string> = {
  DRAFT: "secondary", SENT: "default", APPROVED: "success", CANCELLED: "destructive",
};

interface Line {
  id?: string;
  description: string;
  quantity: number;
  unitPrice: number;
  total: number;
  _new?: boolean;
}

function fmtBytes(b: number) {
  if (b < 1024) return `${b} B`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(0)} KB`;
  return `${(b / (1024 * 1024)).toFixed(1)} MB`;
}

export function QuoteDetailClient({ quote: initialQuote, settings }: { quote: any; settings: any }) {
  const router = useRouter();
  const [quote, setQuote] = useState(initialQuote);
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState("");
  const [sending, setSending] = useState(false);
  const [converting, setConverting] = useState(false);
  const [confirmSend, setConfirmSend] = useState(false);
  const [uploadingFile, setUploadingFile] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [issueDate, setIssueDate] = useState(format(new Date(quote.issueDate), "yyyy-MM-dd"));
  const [validUntil, setValidUntil] = useState(format(new Date(quote.validUntil), "yyyy-MM-dd"));
  const [vatRate, setVatRate] = useState(Number(quote.vatRate));
  const [notes, setNotes] = useState(quote.notes ?? "");
  const [reference, setReference] = useState(quote.reference ?? "");
  const [subject, setSubject] = useState(quote.subject ?? "");
  const [lines, setLines] = useState<Line[]>(
    quote.lines.map((l: any) => ({ id: l.id, description: l.description, quantity: Number(l.quantity), unitPrice: Number(l.unitPrice), total: Number(l.total) }))
  );
  const [lineIdsToDelete, setLineIdsToDelete] = useState<string[]>([]);

  const isLocked = quote.status === "APPROVED" || quote.status === "CANCELLED";
  const attachments: any[] = quote.attachments ?? [];

  function computedSubtotal() { return lines.reduce((s, l) => s + l.quantity * l.unitPrice, 0); }
  function computedVat() { return (computedSubtotal() * vatRate) / 100; }
  function computedTotal() { return computedSubtotal() + computedVat(); }

  function updateLine(i: number, field: keyof Line, value: any) {
    setLines((prev) => prev.map((l, idx) => {
      if (idx !== i) return l;
      const u = { ...l, [field]: value };
      u.total = u.quantity * u.unitPrice;
      return u;
    }));
  }

  function removeLine(i: number) {
    const line = lines[i];
    if (line.id) setLineIdsToDelete((prev) => [...prev, line.id!]);
    setLines((prev) => prev.filter((_, idx) => idx !== i));
  }

  function addLine() {
    setLines((prev) => [...prev, { description: "", quantity: 1, unitPrice: 0, total: 0, _new: true }]);
  }

  function cancelEdit() {
    setEditing(false);
    setError("");
    setLines(quote.lines.map((l: any) => ({ id: l.id, description: l.description, quantity: Number(l.quantity), unitPrice: Number(l.unitPrice), total: Number(l.total) })));
    setLineIdsToDelete([]);
    setIssueDate(format(new Date(quote.issueDate), "yyyy-MM-dd"));
    setValidUntil(format(new Date(quote.validUntil), "yyyy-MM-dd"));
    setVatRate(Number(quote.vatRate));
    setNotes(quote.notes ?? "");
    setReference(quote.reference ?? "");
    setSubject(quote.subject ?? "");
  }

  async function saveEdit() {
    setSaving(true);
    setError("");
    const res = await fetch(`/api/quotes/${quote.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ issueDate, validUntil, vatRate, notes, reference, subject, lines, lineIdsToDelete }),
    });
    setSaving(false);
    if (res.ok) {
      const updated = await res.json();
      setQuote(updated);
      setLines(updated.lines.map((l: any) => ({ id: l.id, description: l.description, quantity: Number(l.quantity), unitPrice: Number(l.unitPrice), total: Number(l.total) })));
      setLineIdsToDelete([]);
      setEditing(false);
    } else {
      const err = await res.json().catch(() => ({}));
      setError(err.error ?? "Fout bij opslaan");
    }
  }

  async function updateStatus(status: string) {
    setSaving(true);
    const res = await fetch(`/api/quotes/${quote.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    if (res.ok) {
      const updated = await res.json();
      setQuote((prev: any) => ({ ...prev, status: updated.status }));
    }
    setSaving(false);
  }

  async function sendQuote() {
    setConfirmSend(false);
    setSending(true);
    setError("");
    const res = await fetch(`/api/quotes/${quote.id}/send`, { method: "POST" });
    setSending(false);
    if (res.ok) {
      const data = await res.json();
      setQuote((prev: any) => ({ ...prev, sentAt: data.sentAt, status: data.status }));
    } else {
      const err = await res.json().catch(() => ({}));
      setError(err.error ?? "Fout bij verzenden");
    }
  }

  async function convertToInvoice() {
    if (!confirm("Maak een factuur aan op basis van deze offerte?")) return;
    setConverting(true);
    const res = await fetch(`/api/quotes/${quote.id}/convert`, { method: "POST" });
    setConverting(false);
    if (res.ok) {
      const { invoiceId } = await res.json();
      router.push(`/invoices/${invoiceId}`);
    } else {
      const err = await res.json().catch(() => ({}));
      setError(err.error ?? "Fout bij omzetten");
    }
  }

  async function uploadAttachment(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingFile(true);
    setError("");
    const fd = new FormData();
    fd.append("file", file);
    const res = await fetch(`/api/quotes/${quote.id}/attachments`, { method: "POST", body: fd });
    setUploadingFile(false);
    if (res.ok) {
      const attachment = await res.json();
      setQuote((prev: any) => ({ ...prev, attachments: [...(prev.attachments ?? []), attachment] }));
    } else {
      const err = await res.json().catch(() => ({}));
      setError(err.error ?? "Fout bij uploaden");
    }
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  async function deleteAttachment(attachmentId: string) {
    if (!confirm("Bijlage verwijderen?")) return;
    const res = await fetch(`/api/quotes/${quote.id}/attachments/${attachmentId}`, { method: "DELETE" });
    if (res.ok) {
      setQuote((prev: any) => ({ ...prev, attachments: (prev.attachments ?? []).filter((a: any) => a.id !== attachmentId) }));
    }
  }

  const displayLines = editing ? lines : quote.lines;
  const sub = editing ? computedSubtotal() : Number(quote.subtotal);
  const vat = editing ? computedVat() : Number(quote.vatAmount);
  const tot = editing ? computedTotal() : Number(quote.total);

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" asChild>
          <Link href="/quotes"><ArrowLeft className="h-4 w-4" /></Link>
        </Button>
        <div className="flex-1">
          <h1 className="text-2xl font-bold">Offerte {quote.quoteNumber}</h1>
          <p className="text-muted-foreground">{quote.customer?.name}</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {!isLocked && !editing && (
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
              {!isLocked && (
                <Select value={quote.status} onValueChange={updateStatus} disabled={saving}>
                  <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="DRAFT">Concept</SelectItem>
                    <SelectItem value="SENT">Verzonden</SelectItem>
                    <SelectItem value="CANCELLED">Geannuleerd</SelectItem>
                  </SelectContent>
                </Select>
              )}
              {(quote.status === "DRAFT" || quote.status === "SENT") && quote.customer?.email && (
                <Button variant="outline" onClick={() => setConfirmSend(true)} disabled={sending}>
                  <Mail className="h-4 w-4 mr-2" /> {sending ? "Verzenden..." : "Verzenden"}
                </Button>
              )}
              {quote.status === "APPROVED" && (
                <Button onClick={convertToInvoice} disabled={converting}>
                  <FileText className="h-4 w-4 mr-2" /> {converting ? "Aanmaken..." : "Maak factuur aan"}
                </Button>
              )}
              <Button variant="outline" asChild>
                <Link href={`/quotes/${quote.id}/print?preview=1`} target="_blank">
                  <Eye className="h-4 w-4 mr-2" /> Voorbeeld
                </Link>
              </Button>
              <Button variant="outline" asChild>
                <a href={`/api/quotes/${quote.id}/pdf`} download={`Offerte-${quote.quoteNumber}.pdf`}>
                  <Printer className="h-4 w-4 mr-2" /> PDF downloaden
                </a>
              </Button>
            </>
          )}
        </div>
      </div>

      {error && <p className="text-sm text-destructive bg-destructive/10 px-4 py-2 rounded-md">{error}</p>}

      {/* Header card */}
      <Card>
        <CardContent className="pt-6">
          <div className="grid gap-6 sm:grid-cols-2">
            <div>
              <p className="text-sm font-medium text-muted-foreground mb-1">Van</p>
              {settings ? (
                <div className="text-sm space-y-0.5">
                  {settings.logoUrl && <img src={settings.logoUrl} alt="Logo" className="h-12 mb-2 object-contain" />}
                  <p className="font-medium">{settings.name}</p>
                  {settings.address && <p className="text-muted-foreground">{settings.address}</p>}
                  {settings.city && <p className="text-muted-foreground">{settings.postalCode} {settings.city}</p>}
                  {settings.vatNumber && <p className="text-muted-foreground">BTW: {settings.vatNumber}</p>}
                </div>
              ) : null}
            </div>
            <div>
              <p className="text-sm font-medium text-muted-foreground mb-1">Aan</p>
              <div className="text-sm space-y-0.5">
                <p className="font-medium">{quote.customer?.name}</p>
                {quote.customer?.address && <p className="text-muted-foreground">{quote.customer.address}</p>}
                {quote.customer?.city && <p className="text-muted-foreground">{quote.customer.postalCode} {quote.customer.city}</p>}
                {quote.customer?.vatNumber && <p className="text-muted-foreground">BTW: {quote.customer.vatNumber}</p>}
              </div>
            </div>
          </div>

          <div className="mt-6 grid gap-4 sm:grid-cols-2 md:grid-cols-4 border-t pt-4">
            <div>
              <p className="text-xs text-muted-foreground">Offertenummer</p>
              <p className="font-mono font-medium">{quote.quoteNumber}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Datum</p>
              {editing ? <Input type="date" value={issueDate} onChange={(e) => setIssueDate(e.target.value)} className="h-7 text-sm mt-1" /> : <p>{formatDate(quote.issueDate)}</p>}
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Geldig tot</p>
              {editing ? <Input type="date" value={validUntil} onChange={(e) => setValidUntil(e.target.value)} className="h-7 text-sm mt-1" /> : <p>{formatDate(quote.validUntil)}</p>}
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Status</p>
              <Badge variant={statusVariant[quote.status] as any}>{statusLabel[quote.status]}</Badge>
            </div>
          </div>

          <div className="mt-4 grid gap-4 sm:grid-cols-2 border-t pt-4">
            <div>
              <p className="text-xs text-muted-foreground mb-1">Kenmerk</p>
              {editing ? <Input value={reference} onChange={(e) => setReference(e.target.value)} placeholder="Optioneel" className="h-7 text-sm" /> : <p className="text-sm">{quote.reference || <span className="text-muted-foreground italic">—</span>}</p>}
            </div>
            <div>
              <p className="text-xs text-muted-foreground mb-1">Onderwerp</p>
              {editing ? <Input value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="Optioneel" className="h-7 text-sm" /> : <p className="text-sm">{quote.subject || <span className="text-muted-foreground italic">—</span>}</p>}
            </div>
          </div>

          {(quote.sentAt || quote.approvedAt) && (
            <div className="mt-4 flex flex-wrap gap-4 border-t pt-4 text-xs text-muted-foreground">
              {quote.sentAt && <span>Verzonden: {new Date(quote.sentAt).toLocaleString("nl-NL")}</span>}
              {quote.approvedAt && <span>Goedgekeurd: {new Date(quote.approvedAt).toLocaleString("nl-NL")}</span>}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Lines */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>Offerteregels</CardTitle>
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
                    {editing ? <Input value={line.description} onChange={(e) => updateLine(i, "description", e.target.value)} className="h-8" /> : line.description}
                  </TableCell>
                  <TableCell className="text-right">
                    {editing ? <Input type="number" step="0.01" value={line.quantity} onChange={(e) => updateLine(i, "quantity", Number(e.target.value))} className="h-8 text-right" /> : Number(line.quantity).toFixed(2)}
                  </TableCell>
                  <TableCell className="text-right">
                    {editing ? <Input type="number" step="0.01" value={line.unitPrice} onChange={(e) => updateLine(i, "unitPrice", Number(e.target.value))} className="h-8 text-right" /> : formatCurrency(Number(line.unitPrice))}
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
                    <Input type="number" min="0" max="100" value={vatRate} onChange={(e) => setVatRate(Number(e.target.value))} className="h-8 text-right w-20 ml-auto" />
                  </TableCell>
                </TableRow>
              )}
              <TableRow>
                <TableCell colSpan={editing ? 3 : 2} className="text-right text-muted-foreground">Subtotaal</TableCell>
                <TableCell className="text-right">{formatCurrency(sub)}</TableCell>
                {editing && <TableCell />}
              </TableRow>
              <TableRow>
                <TableCell colSpan={editing ? 3 : 2} className="text-right text-muted-foreground">BTW ({editing ? vatRate : Number(quote.vatRate).toFixed(0)}%)</TableCell>
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
        <CardHeader><CardTitle className="text-base">Opmerkingen</CardTitle></CardHeader>
        <CardContent>
          {editing ? (
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={4} placeholder="Optionele opmerkingen of voorwaarden..." />
          ) : quote.notes ? (
            <p className="text-sm whitespace-pre-wrap">{quote.notes}</p>
          ) : (
            <p className="text-sm text-muted-foreground italic">{!isLocked ? "Klik op 'Bewerken' om opmerkingen toe te voegen" : "Geen opmerkingen"}</p>
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
              <input ref={fileInputRef} type="file" className="hidden" accept=".pdf,.png,.jpg,.jpeg,.xlsx,.docx" onChange={uploadAttachment} />
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
                      <a href={`/api/quotes/${quote.id}/attachments/${a.id}/download`} download={a.filename}>
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

      {/* Send confirmation dialog */}
      <Dialog open={confirmSend} onOpenChange={(open) => { if (!open) setConfirmSend(false); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Offerte verzenden</DialogTitle>
            <DialogDescription>De offerte wordt per e-mail verstuurd naar:</DialogDescription>
          </DialogHeader>
          <p className="font-medium text-sm">{quote.customer?.email}</p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmSend(false)}>Annuleren</Button>
            <Button onClick={sendQuote}>Verzenden</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
