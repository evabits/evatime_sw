"use client";
import { useEffect, useState } from "react";
import { format } from "date-fns";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ENTRY_ENDPOINT, type BulkKind } from "@/lib/bulk-entries";
import { toQuarter, HOUR_CHOICES } from "@/lib/quarter-hours";
import { saveWithMembership } from "@/lib/membership-retry";
import { projectOptions } from "@/lib/project-picker";

const TITLE: Record<BulkKind, string> = { time: "Uren aanpassen", km: "Rit aanpassen", expense: "Uitgave aanpassen" };

interface Props {
  kind: BulkKind | null;
  entry: any | null;
  projects: any[];
  categories: any[];
  users: any[];
  /** Mag bij "geen deelnemer" de medewerker meteen aan het project toevoegen. */
  canAddMembers?: boolean;
  onClose: () => void;
  onSaved: () => void;
}

export function EntryEditDialog({ kind, entry, projects, categories, users, canAddMembers = false, onClose, onSaved }: Props) {
  const [form, setForm] = useState<any>({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [zoek, setZoek] = useState("");

  useEffect(() => {
    if (!entry || !kind) return;
    setError(null);
    setZoek("");
    setForm({
      projectId: entry.projectId ?? "",
      categoryId: entry.categoryId ?? "",
      userId: entry.userId ?? "",
      date: format(new Date(entry.date), "yyyy-MM-dd"),
      hours: entry.hours != null ? String(entry.hours) : "",
      km: entry.km != null ? String(entry.km) : "",
      amount: entry.amount != null ? String(entry.amount) : "",
      vatRate: entry.vatRate != null ? String(entry.vatRate) : "21",
      description: entry.description ?? "",
      rateOverride: entry.rateOverride != null ? String(entry.rateOverride) : "",
      reimbursable: entry.reimbursable ?? false,
    });
  }, [entry, kind]);

  if (!kind || !entry) return null;

  const set = (key: string, value: any) => setForm((f: any) => ({ ...f, [key]: value }));
  const num = (v: string) => (v === "" ? null : Number(v));

  function validate(): string | null {
    if (kind === "expense") {
      if (!form.categoryId) return "Categorie is verplicht";
      if (!form.date) return "Datum is verplicht";
      if (!(Number(form.amount) > 0)) return "Bedrag moet groter dan 0 zijn";
      if (form.vatRate === "") return "BTW% is verplicht";
      const vat = Number(form.vatRate);
      if (!(vat >= 0 && vat <= 100)) return "BTW% moet tussen 0 en 100 liggen";
    } else {
      if (!form.projectId) return "Project is verplicht";
      if (!form.date) return "Datum is verplicht";
      // Op de afgeronde waarde controleren, want dat is wat er verstuurd wordt.
      // Een niet-kwartier bestaat hier niet meer: het veld rondt af bij het
      // verlaten en save() rondt nog eens af voor wie met Enter opslaat.
      if (kind === "time" && !(toQuarter(Number(form.hours)) > 0)) return "Uren moet groter dan 0 zijn";
      if (kind === "km" && !(Number(form.km) > 0)) return "Kilometers moet groter dan 0 zijn";
    }
    if (form.rateOverride !== "" && !(Number(form.rateOverride) > 0)) return "Tarief moet positief zijn";
    return null;
  }

  async function save() {
    const message = validate();
    if (message) {
      setError(message);
      return;
    }
    setSaving(true);
    setError(null);
    const body =
      kind === "time"
        ? { projectId: form.projectId, date: form.date, hours: toQuarter(Number(form.hours)), description: form.description, rateOverride: num(form.rateOverride), userId: form.userId }
        : kind === "km"
        ? { projectId: form.projectId, date: form.date, km: Number(form.km), description: form.description, rateOverride: num(form.rateOverride), userId: form.userId }
        : { categoryId: form.categoryId, projectId: form.projectId || null, date: form.date, description: form.description, amount: Number(form.amount), vatRate: Number(form.vatRate), reimbursable: form.reimbursable, userId: form.userId };

    const opslaan = () => fetch(`${ENTRY_ENDPOINT[kind as BulkKind]}/${entry.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const res = canAddMembers ? await saveWithMembership(opslaan, { users, projects }) : await opslaan();
    setSaving(false);
    if (!res.ok) {
      const payload = await res.json().catch(() => ({}));
      setError(payload.issues ? "Controleer de ingevulde velden." : (payload.error ?? "Opslaan mislukt"));
      return;
    }
    onSaved();
  }

  // Het huidige project blijft altijd in de lijst, ook als het zoekwoord of
  // het archief het eruit zou filteren: anders staat het vak ineens leeg.
  const gevonden = projectOptions(projects, { zoek });
  const huidig = projects.find((p) => p.id === form.projectId);
  const projectKeuzes = huidig && !gevonden.some((o) => o.id === huidig.id)
    ? [{ id: huidig.id, label: `${huidig.customer?.name ? `${huidig.customer.name} — ` : ""}${huidig.name}` }, ...gevonden]
    : gevonden;

  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent>
        <DialogHeader><DialogTitle>{TITLE[kind]}</DialogTitle></DialogHeader>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label>Medewerker</Label>
            <Select value={form.userId} onValueChange={(v) => set("userId", v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {users.map((u) => <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          {kind === "expense" && (
            <div className="space-y-2">
              <Label>Categorie</Label>
              <Select value={form.categoryId} onValueChange={(v) => set("categoryId", v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {categories.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          )}

          <div className="space-y-2">
            <Label>Project</Label>
            <Input value={zoek} onChange={(e) => setZoek(e.target.value)} placeholder="Zoek op klant of project" />
            <Select
              value={form.projectId}
              onValueChange={(v) => setForm((f: any) => ({ ...f, projectId: v }))}
            >
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {projectKeuzes.length === 0 ? (
                  <p className="px-2 py-3 text-sm text-muted-foreground">Geen project gevonden</p>
                ) : (
                  projectKeuzes.map((o) => <SelectItem key={o.id} value={o.id}>{o.label}</SelectItem>)
                )}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Datum</Label>
            <Input type="date" value={form.date} onChange={(e) => set("date", e.target.value)} />
          </div>

          {kind === "time" && (
            <div className="space-y-2">
              <Label>Uren</Label>
              {/* Afronden bij het verlaten van het veld, zoals op het
                  urenscherm: je ziet wat er opgeslagen wordt vóór je opslaat. */}
              <Input
                type="number"
                step="0.25"
                min="0.25"
                value={form.hours}
                list="urenkeuzes-bewerken"
                onChange={(e) => set("hours", e.target.value)}
                onBlur={(e) => {
                  const waarde = Number(e.target.value);
                  if (e.target.value === "" || Number.isNaN(waarde)) return;
                  set("hours", toQuarter(waarde));
                }}
              />
              {/* Eigen id: twee datalists met dezelfde id op één pagina is
                  ongeldige HTML, en dat wil je niet laten afhangen van welke
                  route toevallig gemount is. */}
              <datalist id="urenkeuzes-bewerken">
                {HOUR_CHOICES.map((u) => <option key={u} value={u} />)}
              </datalist>
            </div>
          )}
          {kind === "km" && (
            <div className="space-y-2">
              <Label>Kilometers</Label>
              <Input type="number" step="0.1" min="0.1" value={form.km} onChange={(e) => set("km", e.target.value)} />
            </div>
          )}
          {kind === "expense" && (
            <>
              <div className="space-y-2">
                <Label>Bedrag (€)</Label>
                <Input type="number" step="0.01" min="0.01" value={form.amount} onChange={(e) => set("amount", e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>BTW %</Label>
                <Input type="number" step="1" min="0" max="100" value={form.vatRate} onChange={(e) => set("vatRate", e.target.value)} />
              </div>
            </>
          )}

          {kind !== "expense" && (
            <div className="space-y-2">
              <Label>Tarief override</Label>
              <Input type="number" step="0.01" min="0" placeholder="Optioneel" value={form.rateOverride} onChange={(e) => set("rateOverride", e.target.value)} />
            </div>
          )}

          {kind === "expense" && (
            <div className="space-y-2">
              <Label>Declaratie (terugbetaling)</Label>
              <Select value={form.reimbursable ? "true" : "false"} onValueChange={(v) => set("reimbursable", v === "true")}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="false">Nee</SelectItem>
                  <SelectItem value="true">Ja</SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}

          <div className="space-y-2 sm:col-span-2">
            <Label>Omschrijving</Label>
            <Textarea rows={2} value={form.description} onChange={(e) => set("description", e.target.value)} />
          </div>

          {error && <p className="sm:col-span-2 text-sm text-destructive">{error}</p>}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Annuleren</Button>
          <Button onClick={save} disabled={saving}>{saving ? "Opslaan..." : "Opslaan"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
