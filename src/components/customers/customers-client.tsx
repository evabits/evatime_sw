"use client";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Plus, Pencil, Trash2, ExternalLink, RotateCcw } from "lucide-react";
import Link from "next/link";
import { LevelRateFields } from "@/components/shared/level-rate-fields";

const schema = z.object({
  name: z.string().min(1, "Verplicht"),
  email: z.string().email("Ongeldig e-mailadres").or(z.literal("")).optional(),
  phone: z.string().optional(),
  attention: z.string().optional(),
  address: z.string().optional(),
  city: z.string().optional(),
  postalCode: z.string().optional(),
  country: z.string().optional(),
  vatNumber: z.string().optional(),
  notes: z.string().optional(),
});

type FormData = z.infer<typeof schema>;

const EMPTY: FormData = {
  name: "", email: "", phone: "", attention: "", address: "", city: "",
  postalCode: "", country: "", vatNumber: "", notes: "",
};

interface Props {
  initialCustomers: any[];
}

export function CustomersClient({ initialCustomers }: Props) {
  const [customers, setCustomers] = useState(initialCustomers);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [serverError, setServerError] = useState("");
  const [showArchived, setShowArchived] = useState(false);
  const [levelRates, setLevelRates] = useState<Record<string, string>>({});
  // Whether levelRates was actually loaded for the customer being edited (vs. the
  // include being missing upstream). false must mean "don't touch rates on save",
  // never "save an empty set" — otherwise a missing `include` silently wipes rates.
  const [levelRatesKnown, setLevelRatesKnown] = useState(true);

  const form = useForm<FormData>({ resolver: zodResolver(schema), defaultValues: EMPTY });

  async function loadCustomers(withArchived: boolean) {
    const res = await fetch(`/api/customers${withArchived ? "?includeArchived=1" : ""}`);
    if (res.ok) setCustomers(await res.json());
  }

  async function restoreCustomer(id: string) {
    const res = await fetch(`/api/customers/${id}`, { method: "PATCH" });
    if (res.ok) loadCustomers(showArchived);
  }

  async function onSubmit(data: FormData) {
    setLoading(true);
    setServerError("");
    try {
      const url = editing ? `/api/customers/${editing}` : "/api/customers";
      const method = editing ? "PUT" : "POST";
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...data,
          // Omit levelRates entirely when we never loaded the customer's current
          // rates (levelRatesKnown === false): the API treats an absent key as
          // "leave untouched", so this can't wipe rates it never saw.
          ...(levelRatesKnown
            ? {
                levelRates: Object.entries(levelRates)
                  .filter(([, v]) => v !== "" && Number(v) > 0)
                  .map(([level, v]) => ({ level, rate: Number(v) })),
              }
            : {}),
        }),
      });

      if (res.ok) {
        const saved = await res.json();
        if (editing) {
          setCustomers((prev) => prev.map((c) => (c.id === editing ? { ...c, ...saved } : c)));
        } else {
          setCustomers((prev) =>
            [...prev, { ...saved, _count: { projects: 0, invoices: 0 } }].sort((a, b) =>
              a.name.localeCompare(b.name)
            )
          );
        }
        close();
      } else {
        const err = await res.json().catch(() => ({}));
        setServerError(err.error ?? `Fout ${res.status}`);
      }
    } catch {
      setServerError("Netwerkfout, probeer opnieuw");
    } finally {
      setLoading(false);
    }
  }

  function close() {
    setDialogOpen(false);
    setEditing(null);
    setServerError("");
    form.reset(EMPTY);
    setLevelRates({});
    setLevelRatesKnown(true);
  }

  function startEdit(customer: any) {
    setEditing(customer.id);
    setServerError("");
    form.reset({
      name: customer.name ?? "",
      email: customer.email ?? "",
      phone: customer.phone ?? "",
      attention: customer.attention ?? "",
      address: customer.address ?? "",
      city: customer.city ?? "",
      postalCode: customer.postalCode ?? "",
      country: customer.country ?? "",
      vatNumber: customer.vatNumber ?? "",
      notes: customer.notes ?? "",
    });
    // customer.levelRates is only absent when the query that loaded this customer
    // forgot to include it — not a legitimate "zero rates" state, which is `[]`.
    const known = Array.isArray(customer.levelRates);
    setLevelRatesKnown(known);
    setLevelRates(
      known
        ? Object.fromEntries(customer.levelRates.map((r: any) => [r.level, String(r.rate)]))
        : {},
    );
    setDialogOpen(true);
  }

  async function archiveCustomer(id: string) {
    if (!confirm("Weet u zeker dat u deze klant wilt archiveren?")) return;
    const res = await fetch(`/api/customers/${id}`, { method: "DELETE" });
    if (res.ok) loadCustomers(showArchived);
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Klanten</h1>
          <p className="text-muted-foreground">Beheer uw klanten</p>
        </div>
        <div className="flex items-center gap-3">
          <label className="flex items-center gap-2 text-sm text-muted-foreground cursor-pointer">
            <input type="checkbox" className="h-4 w-4 rounded border-input accent-primary"
              checked={showArchived}
              onChange={(e) => { setShowArchived(e.target.checked); loadCustomers(e.target.checked); }} />
            Toon gearchiveerd
          </label>
          <Button onClick={() => { form.reset(EMPTY); setEditing(null); setServerError(""); setLevelRates({}); setLevelRatesKnown(true); setDialogOpen(true); }}>
            <Plus className="h-4 w-4 mr-2" /> Klant toevoegen
          </Button>
        </div>
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Naam</TableHead>
                <TableHead>E-mail</TableHead>
                <TableHead>Telefoon</TableHead>
                <TableHead>Stad</TableHead>
                <TableHead className="text-right">Projecten</TableHead>
                <TableHead className="text-right">Facturen</TableHead>
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {customers.length === 0 && (
                <TableRow>
                  <TableCell colSpan={7} className="text-center text-muted-foreground py-8">
                    Geen klanten gevonden
                  </TableCell>
                </TableRow>
              )}
              {customers.map((c) => (
                <TableRow key={c.id} className={c.archivedAt ? "opacity-60" : undefined}>
                  <TableCell className="font-medium">
                    {c.name}
                    {c.archivedAt && <span className="ml-2 text-xs text-muted-foreground">(gearchiveerd)</span>}
                  </TableCell>
                  <TableCell>{c.email || "—"}</TableCell>
                  <TableCell>{c.phone || "—"}</TableCell>
                  <TableCell>{c.city || "—"}</TableCell>
                  <TableCell className="text-right">{c._count?.projects ?? 0}</TableCell>
                  <TableCell className="text-right">{c._count?.invoices ?? 0}</TableCell>
                  <TableCell>
                    <div className="flex gap-1 justify-end">
                      {c.archivedAt ? (
                        <Button variant="ghost" size="icon" onClick={() => restoreCustomer(c.id)} title="Herstellen">
                          <RotateCcw className="h-3.5 w-3.5" />
                        </Button>
                      ) : (
                        <>
                          <Button variant="ghost" size="icon" asChild>
                            <Link href={`/customers/${c.id}`}><ExternalLink className="h-3.5 w-3.5" /></Link>
                          </Button>
                          <Button variant="ghost" size="icon" onClick={() => startEdit(c)}>
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                          <Button variant="ghost" size="icon" onClick={() => archiveCustomer(c.id)} title="Archiveren">
                            <Trash2 className="h-3.5 w-3.5 text-destructive" />
                          </Button>
                        </>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Dialog open={dialogOpen} onOpenChange={(open) => { if (!open) close(); }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editing ? "Klant aanpassen" : "Klant toevoegen"}</DialogTitle>
          </DialogHeader>
          <form onSubmit={form.handleSubmit(onSubmit)} className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1 sm:col-span-2">
              <Label>Naam *</Label>
              <Input {...form.register("name")} autoFocus />
              {form.formState.errors.name && (
                <p className="text-xs text-destructive">{form.formState.errors.name.message}</p>
              )}
            </div>
            <div className="space-y-1">
              <Label>E-mail</Label>
              <Input type="email" {...form.register("email")} />
              {form.formState.errors.email && (
                <p className="text-xs text-destructive">{form.formState.errors.email.message}</p>
              )}
            </div>
            <div className="space-y-1">
              <Label>Telefoon</Label>
              <Input {...form.register("phone")} />
            </div>
            <div className="space-y-1 sm:col-span-2">
              <Label>T.a.v. <span className="text-muted-foreground font-normal">(persoon of afdeling)</span></Label>
              <Input placeholder="bijv. Afdeling Inkoop" {...form.register("attention")} />
            </div>
            <div className="space-y-1 sm:col-span-2">
              <Label>Adres</Label>
              <Input {...form.register("address")} />
            </div>
            <div className="space-y-1">
              <Label>Postcode</Label>
              <Input {...form.register("postalCode")} />
            </div>
            <div className="space-y-1">
              <Label>Stad</Label>
              <Input {...form.register("city")} />
            </div>
            <div className="space-y-1">
              <Label>Land</Label>
              <Input {...form.register("country")} placeholder="Nederland" />
            </div>
            <div className="space-y-1">
              <Label>BTW-nummer</Label>
              <Input {...form.register("vatNumber")} />
            </div>
            <div className="space-y-1 sm:col-span-2">
              <Label>Notities</Label>
              <Textarea {...form.register("notes")} rows={2} />
            </div>
            <div className="sm:col-span-2">
              <LevelRateFields
                value={levelRates}
                onChange={setLevelRates}
                hint={
                  levelRatesKnown
                    ? undefined
                    : "Tarieven konden niet worden geladen; wijzigingen hier worden niet opgeslagen."
                }
              />
            </div>
            {serverError && (
              <p className="sm:col-span-2 text-sm text-destructive">{serverError}</p>
            )}
            <DialogFooter className="sm:col-span-2">
              <Button type="button" variant="outline" onClick={close}>Annuleren</Button>
              <Button type="submit" disabled={loading}>{loading ? "Opslaan..." : "Opslaan"}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
