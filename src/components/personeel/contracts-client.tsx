"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Plus, Pencil, Trash2, Paperclip, Copy } from "lucide-react";
import { formatCurrency } from "@/lib/utils";
import { getEffectiveContract, rangeOverlaps, nextDay } from "@/lib/contracts";

interface Contract {
  id: string; userId: string;
  contractType: "PERMANENT" | "FIXED_TERM" | "ZERO_HOURS";
  contractHours: number | null; vacationHours: number | null;
  startDate: string | null; endDate: string | null;
  salaryMonthly: number | null; salaryHourly: number | null;
  jobTitle: string | null; ftePercentage: number | null; notes: string | null;
  attachments: { id: string; filename: string; url: string; size: number; createdAt: string }[];
}

const CONTRACT_LABELS: Record<string, string> = {
  PERMANENT: "Vast",
  FIXED_TERM: "Bepaalde tijd",
  ZERO_HOURS: "0-uren",
};

const schema = z.object({
  contractType: z.enum(["PERMANENT", "FIXED_TERM", "ZERO_HOURS"]),
  contractHours: z.coerce.number().positive().optional(),
  vacationHours: z.coerce.number().positive().optional(),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  salaryMonthly: z.coerce.number().positive().optional(),
  salaryHourly: z.coerce.number().positive().optional(),
  jobTitle: z.string().optional(),
  ftePercentage: z.coerce.number().positive().optional(),
  notes: z.string().optional(),
});

// Empty number inputs arrive as "" and coerce to 0 (failing .positive()); map blank → undefined
const numberField = { setValueAs: (v: string) => (v === "" ? undefined : Number(v)) };

type FormData = z.infer<typeof schema>;

export function ContractsClient({
  user, initialContracts,
}: { user: { id: string; name: string; email: string; role: string }; initialContracts: Contract[] }) {
  const router = useRouter();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  // Het contract waarvan gedupliceerd wordt. Niet null betekent: de dialoog
  // staat in de derde toestand. editingId blijft daarbij null, want een
  // duplicaat wordt een nieuw contract.
  const [duplicerenVan, setDuplicerenVan] = useState<Contract | null>(null);
  // De einddatum die het bron-contract nog mist. Hoort bij een ánder contract
  // dan het formulier beschrijft, dus staat hij naast het zod-schema.
  const [bronEinddatum, setBronEinddatum] = useState("");
  const [loading, setLoading] = useState(false);
  const [serverError, setServerError] = useState("");

  const form = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: { contractType: "PERMANENT" },
  });

  const today = new Date().toISOString().slice(0, 10);
  const effectiveContract = getEffectiveContract(initialContracts, today);

  // Overlap warning: watch start/end
  const watchedStart = form.watch("startDate");
  const watchedEnd = form.watch("endDate");
  const hasOverlap = initialContracts.some((c) => {
    if (c.id === editingId) return false;
    // Het bron-contract van een duplicaat krijgt in dezelfde handeling zijn
    // einddatum, dus overlapt het straks niet meer. Zonder deze regel gaat de
    // waarschuwing af op een overlap die je net aan het opheffen bent.
    if (c.id === duplicerenVan?.id) return false;
    return rangeOverlaps(
      watchedStart || null, watchedEnd || null,
      c.startDate, c.endDate,
    );
  });

  function openAdd() {
    setEditingId(null);
    setDuplicerenVan(null);
    setBronEinddatum("");
    form.reset({ contractType: "PERMANENT" });
    setServerError("");
    setDialogOpen(true);
  }

  function openEdit(c: Contract) {
    setEditingId(c.id);
    setDuplicerenVan(null);
    setBronEinddatum("");
    form.reset({
      contractType: c.contractType,
      contractHours: c.contractHours ?? undefined,
      vacationHours: c.vacationHours ?? undefined,
      startDate: c.startDate ?? undefined,
      endDate: c.endDate ?? undefined,
      salaryMonthly: c.salaryMonthly ?? undefined,
      salaryHourly: c.salaryHourly ?? undefined,
      jobTitle: c.jobTitle ?? undefined,
      ftePercentage: c.ftePercentage ?? undefined,
      notes: c.notes ?? undefined,
    });
    setServerError("");
    setDialogOpen(true);
  }

  function openDuplicate(c: Contract) {
    setEditingId(null);
    setDuplicerenVan(c);
    setBronEinddatum(c.endDate ?? "");
    // De dialoog unmount bij sluiten (geen forceMount op DialogContent, dus
    // Radix' Presence-component breekt hem af), dus elk veld hieronder start
    // straks vers op — er is geen stale DOM-waarde om tegen te beschermen. De
    // `?? undefined`-velden nemen daarom gewoon over van het bron-contract,
    // dat is het hele punt van dupliceren. Alleen endDate moet je actief
    // leegmaken (niet gewoon weglaten): een duplicaat mag nooit de einddatum
    // van zijn bron erven.
    form.reset({
      contractType: c.contractType,
      contractHours: c.contractHours ?? undefined,
      vacationHours: c.vacationHours ?? undefined,
      // Het nieuwe contract begint de dag na het oude. Zonder einddatum op het
      // origineel valt er nog niets te berekenen; het veld in de dialoog vult
      // dit alsnog zodra je die datum opgeeft.
      startDate: c.endDate ? nextDay(c.endDate) : "",
      endDate: "",
      salaryMonthly: c.salaryMonthly ?? undefined,
      salaryHourly: c.salaryHourly ?? undefined,
      jobTitle: c.jobTitle ?? undefined,
      ftePercentage: c.ftePercentage ?? undefined,
      notes: c.notes ?? undefined,
    });
    setServerError("");
    setDialogOpen(true);
  }

  function close() {
    setDialogOpen(false);
    setEditingId(null);
    setDuplicerenVan(null);
    setBronEinddatum("");
    setServerError("");
  }

  async function onSubmit(data: FormData) {
    setLoading(true);
    setServerError("");

    // Dupliceren van een contract dat nog doorloopt: dat krijgt eerst zijn
    // einddatum. Anders sluiten de twee niet op elkaar aan en overlappen ze.
    // De overige velden gaan onveranderd mee, want PUT vervangt de hele body.
    // jobTitle, notes en de datums moeten "" zijn en niet null: het zod-schema
    // van de route staat daar geen null toe.
    if (duplicerenVan && !duplicerenVan.endDate) {
      const bron = await fetch(`/api/contracts/${duplicerenVan.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contractType: duplicerenVan.contractType,
          contractHours: duplicerenVan.contractHours,
          vacationHours: duplicerenVan.vacationHours,
          startDate: duplicerenVan.startDate ?? "",
          endDate: bronEinddatum,
          salaryMonthly: duplicerenVan.salaryMonthly,
          salaryHourly: duplicerenVan.salaryHourly,
          jobTitle: duplicerenVan.jobTitle ?? "",
          ftePercentage: duplicerenVan.ftePercentage,
          notes: duplicerenVan.notes ?? "",
        }),
      });
      if (!bron.ok) {
        setLoading(false);
        const err = await bron.json();
        setServerError(err.error ?? "Fout bij het bijwerken van het bestaande contract");
        return;
      }
    }

    const url = editingId ? `/api/contracts/${editingId}` : "/api/contracts";
    const method = editingId ? "PUT" : "POST";
    const body = editingId ? data : { userId: user.id, ...data };
    const res = await fetch(url, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    setLoading(false);
    if (res.ok) {
      close();
      router.refresh();
    } else {
      const err = await res.json();
      // Bij het dupliceren staat de einddatum van het bestaande contract er op
      // dit punt al op. Dat is geen schade, maar je moet het weten voordat je
      // het opnieuw probeert.
      const staart =
        duplicerenVan && !duplicerenVan.endDate
          ? " De einddatum van het bestaande contract is wel opgeslagen."
          : "";
      setServerError((err.error ?? "Fout bij opslaan") + staart);
    }
  }

  async function deleteContract(id: string) {
    if (!confirm("Weet u zeker dat u dit contract wilt verwijderen?")) return;
    const res = await fetch(`/api/contracts/${id}`, { method: "DELETE" });
    if (res.ok) router.refresh();
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <Link href="/personeel" className="text-sm text-muted-foreground hover:underline">← Personeel</Link>
          <h1 className="text-2xl font-bold mt-1">{user.name}</h1>
          <p className="text-muted-foreground">{user.email}</p>
        </div>
        <Button onClick={openAdd}>
          <Plus className="h-4 w-4 mr-2" /> Contract toevoegen
        </Button>
      </div>

      {initialContracts.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12 gap-4">
            <p className="text-muted-foreground">Nog geen contract</p>
            <Button onClick={openAdd}>
              <Plus className="h-4 w-4 mr-2" /> Contract toevoegen
            </Button>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Periode</TableHead>
                  <TableHead>Functie</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Uren</TableHead>
                  <TableHead>Vakantie-uren</TableHead>
                  <TableHead>Maandsalaris</TableHead>
                  <TableHead>Uursalaris</TableHead>
                  <TableHead>FTE</TableHead>
                  <TableHead>Bijlagen</TableHead>
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {initialContracts.map((c) => {
                  const isCurrent = effectiveContract?.id === c.id;
                  return (
                    <TableRow key={c.id} className={isCurrent ? "bg-muted/50" : undefined}>
                      <TableCell className="font-mono text-sm whitespace-nowrap">
                        {c.startDate ?? "—"} → {c.endDate ?? "heden"}
                        {isCurrent && <Badge variant="secondary" className="ml-2 text-xs">Huidig</Badge>}
                      </TableCell>
                      <TableCell>{c.jobTitle ?? <span className="text-muted-foreground">—</span>}</TableCell>
                      <TableCell>
                        <Badge variant="outline">{CONTRACT_LABELS[c.contractType]}</Badge>
                      </TableCell>
                      <TableCell>{c.contractHours != null ? `${c.contractHours}u` : <span className="text-muted-foreground">—</span>}</TableCell>
                      <TableCell>{c.vacationHours != null ? `${c.vacationHours}u` : <span className="text-muted-foreground">—</span>}</TableCell>
                      <TableCell className="font-mono">{c.salaryMonthly != null ? formatCurrency(c.salaryMonthly) : <span className="text-muted-foreground">—</span>}</TableCell>
                      <TableCell className="font-mono">{c.salaryHourly != null ? formatCurrency(c.salaryHourly) : <span className="text-muted-foreground">—</span>}</TableCell>
                      <TableCell>{c.ftePercentage != null ? `${c.ftePercentage}%` : <span className="text-muted-foreground">—</span>}</TableCell>
                      <TableCell>
                        <div className="flex flex-wrap gap-1 items-center">
                          {c.attachments.map((att) => (
                            <span key={att.id} className="inline-flex items-center gap-0.5 text-xs">
                              <a
                                href={`/api/contracts/${c.id}/attachments/${att.id}/download`}
                                className="text-primary hover:underline max-w-[120px] truncate"
                                title={att.filename}
                              >
                                {att.filename}
                              </a>
                              <button
                                type="button"
                                className="text-muted-foreground hover:text-destructive"
                                onClick={async () => {
                                  await fetch(`/api/contracts/${c.id}/attachments/${att.id}`, { method: "DELETE" });
                                  router.refresh();
                                }}
                                title="Verwijderen"
                              >
                                <Trash2 className="h-3 w-3" />
                              </button>
                            </span>
                          ))}
                          <label className="cursor-pointer">
                            <input
                              type="file"
                              className="sr-only"
                              onChange={async (e) => {
                                const file = e.target.files?.[0];
                                if (!file) return;
                                const fd = new FormData();
                                fd.append("file", file);
                                await fetch(`/api/contracts/${c.id}/attachments`, { method: "POST", body: fd });
                                router.refresh();
                              }}
                            />
                            <span className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
                              <Paperclip className="h-3 w-3" /> Bijlage
                            </span>
                          </label>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex gap-1 justify-end">
                          <Button variant="ghost" size="icon" onClick={() => openDuplicate(c)} title="Dupliceren">
                            <Copy className="h-3.5 w-3.5" />
                          </Button>
                          <Button variant="ghost" size="icon" onClick={() => openEdit(c)}>
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                          <Button variant="ghost" size="icon" onClick={() => deleteContract(c.id)}>
                            <Trash2 className="h-3.5 w-3.5 text-destructive" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {editingId ? "Contract bewerken" : duplicerenVan ? "Contract dupliceren" : "Contract toevoegen"}
            </DialogTitle>
          </DialogHeader>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-3">
            {duplicerenVan && !duplicerenVan.endDate && (
              <div className="space-y-1 rounded-md border border-amber-200 bg-amber-50 p-3 dark:border-amber-900 dark:bg-amber-950/30">
                <Label>Einddatum bestaand contract</Label>
                <Input
                  type="date"
                  value={bronEinddatum}
                  onChange={(e) => {
                    setBronEinddatum(e.target.value);
                    // De begindatum van het nieuwe contract volgt hieruit, dus
                    // die schuift mee terwijl je typt.
                    form.setValue("startDate", e.target.value ? nextDay(e.target.value) : "");
                  }}
                />
                <p className="text-xs text-muted-foreground">
                  Het bestaande contract loopt nog door. Het nieuwe contract begint de dag erna.
                </p>
              </div>
            )}
            <div className="space-y-1">
              <Label>Contracttype</Label>
              <Select value={form.watch("contractType")} onValueChange={(v) => form.setValue("contractType", v as any)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="PERMANENT">Vast</SelectItem>
                  <SelectItem value="FIXED_TERM">Bepaalde tijd</SelectItem>
                  <SelectItem value="ZERO_HOURS">0-uren</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Functie</Label>
              <Input {...form.register("jobTitle")} placeholder="bijv. Developer" />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <Label>Startdatum</Label>
                <Input type="date" {...form.register("startDate")} />
              </div>
              <div className="space-y-1">
                <Label>Einddatum</Label>
                <Input type="date" {...form.register("endDate")} />
              </div>
            </div>
            <div className="space-y-1">
              <Label>Contracturen per week</Label>
              <Input type="number" step="0.5" min="0" placeholder="bijv. 40" {...form.register("contractHours", numberField)} />
            </div>
            <div className="space-y-1">
              <Label>Vakantie-uren per jaar</Label>
              <Input type="number" step="0.5" min="0" placeholder="bijv. 160" {...form.register("vacationHours", numberField)} />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <Label>Maandsalaris</Label>
                <Input type="number" step="0.01" min="0" placeholder="bijv. 3500" {...form.register("salaryMonthly", numberField)} />
              </div>
              <div className="space-y-1">
                <Label>Uursalaris</Label>
                <Input type="number" step="0.01" min="0" placeholder="bijv. 20.00" {...form.register("salaryHourly", numberField)} />
              </div>
            </div>
            <p className="text-xs text-muted-foreground">Leeg = automatisch berekend uit het andere veld (vereist contracturen)</p>
            <div className="space-y-1">
              <Label>FTE percentage</Label>
              <Input type="number" step="0.01" min="0" max="100" placeholder="bijv. 100" {...form.register("ftePercentage", numberField)} />
            </div>
            <div className="space-y-1">
              <Label>Notities</Label>
              <Textarea {...form.register("notes")} placeholder="Optionele opmerkingen" />
            </div>
            {hasOverlap && (
              <p className="text-sm text-amber-600 bg-amber-50 border border-amber-200 rounded px-3 py-2 dark:text-amber-400 dark:bg-amber-950/30 dark:border-amber-900">
                Let op: deze periode overlapt met een bestaand contract
              </p>
            )}
            {serverError && <p className="text-sm text-destructive">{serverError}</p>}
            <DialogFooter>
              <Button type="button" variant="outline" onClick={close}>Annuleren</Button>
              <Button type="submit" disabled={loading || (duplicerenVan !== null && !bronEinddatum)}>
                {loading ? "Opslaan..." : "Opslaan"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
