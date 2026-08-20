"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { format } from "date-fns";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Pencil, Trash2, Repeat } from "lucide-react";
import { formatCurrency, formatDate } from "@/lib/utils";
import { batchReference, batchTotal, recurringInvoiceDraft, suggestBatchName } from "@/lib/recurring";

// HOURS staat wel in het schema (BillingMode), maar de voltooiroute weigert
// hem nog. Het aanmaakvenster biedt hem daarom niet aan — niets aanbieden
// voelt niet als een fout, een geweigerd verzoek wel.
const BILLING_LABELS: Record<string, string> = { PER_UNIT: "Per stuk", FIXED: "Vast bedrag" };

const EMPTY_TEMPLATE_FORM = {
  name: "",
  customerId: "",
  billing: "PER_UNIT" as "PER_UNIT" | "FIXED",
  unitPrice: "",
  defaultQuantity: "",
  lineDescription: "",
  invoiceSubject: "",
  referencePrefix: "",
  tracksQuality: false,
};

// Lokale dag, niet UTC: toISOString() zou tussen middernacht en 02:00 zomertijd
// de vorige dag opleveren, en die datum belandt als opleverdatum op de factuur.
// Zo doet elk ander scherm in deze app het ook.
function vandaagIso() {
  return format(new Date(), "yyyy-MM-dd");
}

interface Props {
  initialTemplates: any[];
  initialBatches: any[];
  customers: { id: string; name: string }[];
  canManageTemplates: boolean;
}

export function RecurringClient({ initialTemplates, initialBatches, customers, canManageTemplates }: Props) {
  const router = useRouter();
  const templates = initialTemplates;
  const batches = initialBatches;
  const activeBatches = batches.filter((b) => b.status === "ACTIVE");
  const completedBatches = batches.filter((b) => b.status !== "ACTIVE");

  // ─── Sjabloon aanmaken/wijzigen ──────────────────────────────────────────
  const [templateForm, setTemplateForm] = useState(EMPTY_TEMPLATE_FORM);
  const [editingTemplate, setEditingTemplate] = useState<any>(null);
  const [templateDialogOpen, setTemplateDialogOpen] = useState(false);
  const [templateSaving, setTemplateSaving] = useState(false);
  const [templateError, setTemplateError] = useState("");

  function openCreateTemplate() {
    setTemplateForm(EMPTY_TEMPLATE_FORM);
    setEditingTemplate(null);
    setTemplateError("");
    setTemplateDialogOpen(true);
  }

  function openEditTemplate(t: any) {
    setTemplateForm({
      name: t.name,
      customerId: t.customerId,
      // Een sjabloon kan in theorie op HOURS staan (het schema laat het toe),
      // maar deze select biedt die keuze niet aan. Val terug op PER_UNIT in
      // plaats van een lege selectie te tonen.
      billing: t.billing === "FIXED" ? "FIXED" : "PER_UNIT",
      unitPrice: t.unitPrice != null ? String(t.unitPrice) : "",
      defaultQuantity: t.defaultQuantity != null ? String(t.defaultQuantity) : "",
      lineDescription: t.lineDescription,
      invoiceSubject: t.invoiceSubject ?? "",
      referencePrefix: t.referencePrefix ?? "",
      tracksQuality: t.tracksQuality,
    });
    setEditingTemplate(t);
    setTemplateError("");
    setTemplateDialogOpen(true);
  }

  async function saveTemplate(e: React.FormEvent) {
    e.preventDefault();
    if (!templateForm.name.trim() || !templateForm.customerId || !templateForm.unitPrice || !templateForm.lineDescription.trim()) {
      setTemplateError("Vul de verplichte velden in");
      return;
    }
    setTemplateSaving(true);
    setTemplateError("");
    try {
      const url = editingTemplate ? `/api/recurring-templates/${editingTemplate.id}` : "/api/recurring-templates";
      const res = await fetch(url, {
        method: editingTemplate ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: templateForm.name.trim(),
          customerId: templateForm.customerId,
          billing: templateForm.billing,
          unitPrice: Number(templateForm.unitPrice),
          defaultQuantity: templateForm.defaultQuantity ? Number(templateForm.defaultQuantity) : null,
          lineDescription: templateForm.lineDescription.trim(),
          invoiceSubject: templateForm.invoiceSubject.trim() || null,
          referencePrefix: templateForm.referencePrefix.trim() || null,
          tracksQuality: templateForm.tracksQuality,
        }),
      });
      if (res.ok) {
        setTemplateDialogOpen(false);
        router.refresh();
      } else {
        const err = await res.json().catch(() => ({}));
        setTemplateError(err.error ?? `Fout ${res.status}`);
      }
    } catch {
      setTemplateError("Netwerkfout, probeer opnieuw");
    } finally {
      setTemplateSaving(false);
    }
  }

  async function archiveTemplate(id: string) {
    if (!confirm("Weet u zeker dat u dit sjabloon wilt archiveren? Bestaande batches blijven werken.")) return;
    const res = await fetch(`/api/recurring-templates/${id}`, { method: "DELETE" });
    if (res.ok) router.refresh();
  }

  // ─── Nieuwe batch starten ────────────────────────────────────────────────
  const [startingFor, setStartingFor] = useState<any>(null);
  const [batchName, setBatchName] = useState("");
  const [batchStartError, setBatchStartError] = useState("");
  const [batchStarting, setBatchStarting] = useState(false);

  function openStartBatch(t: any) {
    setStartingFor(t);
    setBatchName(suggestBatchName(t.name, new Date()));
    setBatchStartError("");
  }

  async function confirmStartBatch() {
    if (!startingFor) return;
    setBatchStarting(true);
    setBatchStartError("");
    try {
      const res = await fetch(`/api/recurring-templates/${startingFor.id}/batches`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: batchName.trim() || undefined }),
      });
      if (res.ok) {
        setStartingFor(null);
        router.refresh();
      } else {
        const err = await res.json().catch(() => ({}));
        setBatchStartError(err.error ?? `Fout ${res.status}`);
      }
    } catch {
      setBatchStartError("Netwerkfout, probeer opnieuw");
    } finally {
      setBatchStarting(false);
    }
  }

  // ─── Batch voltooien ──────────────────────────────────────────────────────
  const [completing, setCompleting] = useState<any>(null);
  const [completeForm, setCompleteForm] = useState({ deliveredAt: "", quantity: "", approved: "", rejected: "" });
  const [completeError, setCompleteError] = useState("");
  const [completeBusy, setCompleteBusy] = useState(false);
  const [completedInvoiceNumber, setCompletedInvoiceNumber] = useState<string | null>(null);

  function openComplete(batch: any) {
    setCompleting(batch);
    setCompleteForm({
      deliveredAt: vandaagIso(),
      // Het voorgestelde aantal van het sjabloon is een prettig startpunt en
      // blijft aanpasbaar; bij FIXED doet dit veld er niet toe.
      quantity: batch.template?.defaultQuantity != null ? String(batch.template.defaultQuantity) : "",
      approved: "",
      rejected: "",
    });
    setCompleteError("");
    setCompletedInvoiceNumber(null);
  }

  const tracksQuality = !!completing?.template?.tracksQuality;
  const isFixed = completing?.template?.billing === "FIXED";
  const invoer = tracksQuality
    ? { approved: Number(completeForm.approved || 0), rejected: Number(completeForm.rejected || 0) }
    : { quantity: isFixed ? 1 : Number(completeForm.quantity || 0) };
  // Dezelfde functies als de server: wat hier staat is wat er op de factuur komt.
  const totaal = completing ? batchTotal(invoer, tracksQuality) : 0;
  const draft = completing
    ? recurringInvoiceDraft(
        completing.template,
        { id: completing.id, name: completing.name, generatedInvoiceId: completing.generatedInvoiceId, deliveredAt: completeForm.deliveredAt || vandaagIso() },
        invoer,
      )
    : null;

  async function confirmComplete() {
    if (!completing) return;
    setCompleteBusy(true);
    setCompleteError("");
    try {
      const body: Record<string, unknown> = { deliveredAt: completeForm.deliveredAt };
      if (tracksQuality) {
        body.approved = Number(completeForm.approved || 0);
        body.rejected = Number(completeForm.rejected || 0);
      } else {
        body.quantity = isFixed ? 1 : Number(completeForm.quantity || 0);
      }
      const res = await fetch(`/api/projects/${completing.id}/complete-batch`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (res.ok) {
        const data = await res.json();
        setCompletedInvoiceNumber(data.invoiceNumber);
        router.refresh();
      } else {
        const err = await res.json().catch(() => ({}));
        setCompleteError(err.error ?? `Fout ${res.status}`);
      }
    } catch {
      setCompleteError("Netwerkfout, probeer opnieuw");
    } finally {
      setCompleteBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Herhaalprojecten</h1>
        <p className="text-muted-foreground">Terugkerend werk dat telkens hetzelfde factuurtje oplevert</p>
      </div>

      {canManageTemplates && (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0">
            <CardTitle>Sjablonen</CardTitle>
            <Button onClick={openCreateTemplate}>
              <Plus className="h-4 w-4 mr-2" /> Sjabloon toevoegen
            </Button>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Naam</TableHead>
                  <TableHead>Klant</TableHead>
                  <TableHead>Facturatie</TableHead>
                  <TableHead className="text-right">Tarief</TableHead>
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {templates.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center text-muted-foreground py-8">Geen sjablonen</TableCell>
                  </TableRow>
                )}
                {templates.map((t) => (
                  <TableRow key={t.id}>
                    <TableCell className="font-medium">{t.name}</TableCell>
                    <TableCell>{t.customer?.name}</TableCell>
                    <TableCell>
                      {BILLING_LABELS[t.billing] ?? t.billing}
                      {t.tracksQuality && <span className="text-xs text-muted-foreground"> (goed-/afkeur)</span>}
                    </TableCell>
                    <TableCell className="text-right font-mono">{formatCurrency(t.unitPrice)}</TableCell>
                    <TableCell>
                      <div className="flex gap-1 justify-end">
                        <Button variant="ghost" size="icon" onClick={() => openStartBatch(t)} title="Nieuwe batch starten">
                          <Repeat className="h-3.5 w-3.5" />
                        </Button>
                        <Button variant="ghost" size="icon" onClick={() => openEditTemplate(t)} title="Wijzigen">
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        <Button variant="ghost" size="icon" onClick={() => archiveTemplate(t.id)} title="Archiveren">
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
      )}

      <Card>
        <CardHeader>
          <CardTitle>Lopende batches</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Naam</TableHead>
                <TableHead>Klant</TableHead>
                <TableHead>Startdatum</TableHead>
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {activeBatches.length === 0 && (
                <TableRow>
                  <TableCell colSpan={4} className="text-center text-muted-foreground py-8">Geen lopende batches</TableCell>
                </TableRow>
              )}
              {activeBatches.map((b) => (
                <TableRow key={b.id}>
                  <TableCell className="font-medium">{b.name}</TableCell>
                  {/* De klant van het sjabloon, niet die van het project: de
                      factuur gaat naar de klant van het sjabloon, en die twee
                      lopen uiteen zodra iemand het sjabloon aanpast. */}
                  <TableCell>{b.template?.customer?.name ?? b.customer?.name}</TableCell>
                  <TableCell>{formatDate(b.createdAt)}</TableCell>
                  <TableCell className="text-right">
                    <Button size="sm" onClick={() => openComplete(b)}>Voltooien</Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {completedBatches.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Voltooide batches</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Naam</TableHead>
                  <TableHead>Klant</TableHead>
                  <TableHead>Opgeleverd</TableHead>
                  <TableHead>Factuurnummer</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {completedBatches.map((b) => (
                  <TableRow key={b.id}>
                    <TableCell className="font-medium">{b.name}</TableCell>
                    <TableCell>{b.customer?.name}</TableCell>
                    <TableCell>{formatDate(b.deliveredAt)}</TableCell>
                    <TableCell>{b.generatedInvoice?.invoiceNumber ?? "—"}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {/* Sjabloon aanmaken/wijzigen */}
      <Dialog open={templateDialogOpen} onOpenChange={(open) => { if (!open) setTemplateDialogOpen(false); }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editingTemplate ? "Sjabloon wijzigen" : "Sjabloon toevoegen"}</DialogTitle>
          </DialogHeader>
          <form onSubmit={saveTemplate} className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1 sm:col-span-2">
              <Label>Naam *</Label>
              <Input value={templateForm.name} onChange={(e) => setTemplateForm((f) => ({ ...f, name: e.target.value }))} autoFocus />
            </div>
            <div className="space-y-1 sm:col-span-2">
              <Label>Klant *</Label>
              <Select value={templateForm.customerId} onValueChange={(v) => setTemplateForm((f) => ({ ...f, customerId: v }))}>
                <SelectTrigger><SelectValue placeholder="Kies een klant" /></SelectTrigger>
                <SelectContent>
                  {customers.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Facturatie</Label>
              <Select value={templateForm.billing} onValueChange={(v) => setTemplateForm((f) => ({ ...f, billing: v as "PER_UNIT" | "FIXED" }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="PER_UNIT">Per stuk</SelectItem>
                  <SelectItem value="FIXED">Vast bedrag</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>{templateForm.billing === "FIXED" ? "Vast bedrag *" : "Tarief per stuk *"}</Label>
              <Input type="number" step="0.01" min="0.01" value={templateForm.unitPrice}
                onChange={(e) => setTemplateForm((f) => ({ ...f, unitPrice: e.target.value }))} />
            </div>
            {templateForm.billing === "PER_UNIT" && (
              <div className="space-y-1 sm:col-span-2">
                <Label>Standaard aantal <span className="text-muted-foreground font-normal">(voorstel bij het voltooien)</span></Label>
                <Input type="number" step="1" min="0" value={templateForm.defaultQuantity}
                  onChange={(e) => setTemplateForm((f) => ({ ...f, defaultQuantity: e.target.value }))} />
              </div>
            )}
            <div className="space-y-1 sm:col-span-2">
              <Label>Omschrijving factuurregel *</Label>
              <Input value={templateForm.lineDescription} placeholder="bijv. Testen H3X batterij omvormers"
                onChange={(e) => setTemplateForm((f) => ({ ...f, lineDescription: e.target.value }))} />
            </div>
            <div className="space-y-1 sm:col-span-2">
              <Label>Onderwerp factuur <span className="text-muted-foreground font-normal">(anders de batchnaam)</span></Label>
              <Input value={templateForm.invoiceSubject} placeholder="bijv. Factuur H3X testen"
                onChange={(e) => setTemplateForm((f) => ({ ...f, invoiceSubject: e.target.value }))} />
            </div>
            <div className="space-y-1 sm:col-span-2">
              <Label>Kenmerk <span className="text-muted-foreground font-normal">(de opleverdatum komt er zelf achter)</span></Label>
              <Input value={templateForm.referencePrefix} placeholder="bijv. ZP-H3X"
                onChange={(e) => setTemplateForm((f) => ({ ...f, referencePrefix: e.target.value }))} />
              {templateForm.referencePrefix.trim() && (
                <p className="text-xs text-muted-foreground">
                  Op een factuur van vandaag: {batchReference(templateForm.referencePrefix, vandaagIso())}
                </p>
              )}
            </div>
            <div className="sm:col-span-2">
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <input type="checkbox" className="h-4 w-4 rounded border-input accent-primary"
                  checked={templateForm.tracksQuality}
                  onChange={(e) => setTemplateForm((f) => ({ ...f, tracksQuality: e.target.checked }))} />
                Houdt goed- en afkeur bij
              </label>
            </div>
            {templateError && <p className="sm:col-span-2 text-sm text-destructive">{templateError}</p>}
            <DialogFooter className="sm:col-span-2">
              <Button type="button" variant="outline" onClick={() => setTemplateDialogOpen(false)}>Annuleren</Button>
              <Button type="submit" disabled={templateSaving}>{templateSaving ? "Opslaan..." : "Opslaan"}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Nieuwe batch starten */}
      <Dialog open={!!startingFor} onOpenChange={(open) => { if (!open) setStartingFor(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Nieuwe batch — {startingFor?.name}</DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            <Label>Naam</Label>
            <Input value={batchName} onChange={(e) => setBatchName(e.target.value)} autoFocus />
            {batchStartError && <p className="text-xs text-destructive">{batchStartError}</p>}
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setStartingFor(null)}>Annuleren</Button>
            <Button type="button" onClick={confirmStartBatch} disabled={batchStarting}>
              {batchStarting ? "Bezig..." : "Starten"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Batch voltooien */}
      <Dialog open={!!completing} onOpenChange={(open) => { if (!open) setCompleting(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Batch voltooien — {completing?.name}</DialogTitle>
          </DialogHeader>
          {completedInvoiceNumber ? (
            <div className="space-y-4">
              <p className="text-sm">
                Batch voltooid. Conceptfactuur <span className="font-medium">{completedInvoiceNumber}</span> staat klaar.
              </p>
              <DialogFooter>
                <Button type="button" onClick={() => setCompleting(null)}>Sluiten</Button>
              </DialogFooter>
            </div>
          ) : (
            <div className="space-y-4">
              {tracksQuality ? (
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label>Goedgekeurd</Label>
                    <Input type="number" min="0" value={completeForm.approved}
                      onChange={(e) => setCompleteForm((f) => ({ ...f, approved: e.target.value }))} autoFocus />
                  </div>
                  <div className="space-y-1">
                    <Label>Afgekeurd</Label>
                    <Input type="number" min="0" value={completeForm.rejected}
                      onChange={(e) => setCompleteForm((f) => ({ ...f, rejected: e.target.value }))} />
                  </div>
                </div>
              ) : (
                <div className="space-y-1">
                  <Label>Aantal</Label>
                  {isFixed ? (
                    <>
                      <Input type="number" value={1} disabled />
                      <p className="text-xs text-muted-foreground">Vast bedrag: het aantal staat op 1.</p>
                    </>
                  ) : (
                    <Input type="number" min="0" value={completeForm.quantity}
                      onChange={(e) => setCompleteForm((f) => ({ ...f, quantity: e.target.value }))} autoFocus />
                  )}
                </div>
              )}
              <div className="space-y-1">
                <Label>Opleverdatum</Label>
                <Input type="date" value={completeForm.deliveredAt}
                  onChange={(e) => setCompleteForm((f) => ({ ...f, deliveredAt: e.target.value }))} />
              </div>
              {draft && (
                <p className="text-sm font-mono bg-muted rounded-md px-3 py-2">
                  {isFixed
                    ? `Vast bedrag: ${formatCurrency(draft.subtotal)}`
                    : tracksQuality
                      ? `${Number(completeForm.approved || 0)} + ${Number(completeForm.rejected || 0)} = ${totaal} × ${formatCurrency(draft.line.unitPrice)} = ${formatCurrency(draft.subtotal)}`
                      : `${totaal} × ${formatCurrency(draft.line.unitPrice)} = ${formatCurrency(draft.subtotal)}`}
                </p>
              )}
              {draft?.reference && (
                <p className="text-sm text-muted-foreground">Kenmerk: {draft.reference}</p>
              )}
              {completeError && <p className="text-sm text-destructive">{completeError}</p>}
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setCompleting(null)}>Annuleren</Button>
                <Button type="button" onClick={confirmComplete} disabled={completeBusy}>
                  {completeBusy ? "Bezig..." : "Voltooien"}
                </Button>
              </DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
