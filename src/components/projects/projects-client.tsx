"use client";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Plus, Pencil, Copy, Trash2, RotateCcw, Merge } from "lucide-react";
import { LevelRateFields } from "@/components/shared/level-rate-fields";
import { isReservedTagName } from "@/lib/tags";
import { projectOptions } from "@/lib/project-picker";

/**
 * Radix laat een lege string niet toe als waarde van een SelectItem — die is
 * gereserveerd voor "niets gekozen". Vandaar een sentinel die bij het opslaan
 * weer een lege string wordt, en verderop een null.
 */
const GEEN_KLANT = "__geen_klant__";

const schema = z.object({
  // Optioneel, net als in POST /api/projects: klantloze projecten bestaan echt
  // — het conceptproject-knopje in het urenformulier maakt ze, en de
  // verlofprojecten hebben er per definitie geen. Zolang dit veld verplicht was,
  // kon zo'n project wel aangemaakt maar nooit meer bewerkt worden.
  customerId: z.string().optional(),
  name: z.string().min(1, "Verplicht"),
  description: z.string().optional(),
  status: z.enum(["CONCEPT", "ACTIVE", "INACTIVE", "COMPLETED"]),
  defaultKmRate: z.coerce.number().positive().optional().or(z.literal("")),
  billable: z.boolean().optional(),
});

type FormData = z.infer<typeof schema>;

const statusLabel: Record<string, string> = { CONCEPT: "Concept", ACTIVE: "Actief", INACTIVE: "Inactief", COMPLETED: "Afgerond" };
const statusVariant: Record<string, "default" | "secondary" | "success"> = {
  CONCEPT: "secondary",
  ACTIVE: "success",
  INACTIVE: "secondary",
  COMPLETED: "default",
};

interface Props {
  initialProjects: any[];
  customers: any[];
  allTags: { id: string; name: string }[];
  users: any[];
  initialNoCustomerOnly?: boolean;
}

export function ProjectsClient({ initialProjects, customers, allTags, users, initialNoCustomerOnly = false }: Props) {
  const [projects, setProjects] = useState(initialProjects);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [serverError, setServerError] = useState("");
  const [selectedTags, setSelectedTags] = useState<{ name: string }[]>([]);
  const [tagInput, setTagInput] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [showArchived, setShowArchived] = useState(false);
  // "all", de sentinel GEEN_KLANT, of een customerId. De dashboardlink
  // /projects?filter=no-customer komt hier binnen als initialNoCustomerOnly en
  // zet de lijst meteen op "Zonder klant".
  const [customerFilter, setCustomerFilter] = useState(initialNoCustomerOnly ? GEEN_KLANT : "all");
  const customerlessCount = projects.filter((p) => !p.customer).length;
  const [levelRates, setLevelRates] = useState<Record<string, string>>({});
  // Whether levelRates was actually loaded for the project being edited (vs. the
  // include being missing upstream). false must mean "don't touch rates on save",
  // never "save an empty set" — otherwise a missing `include` silently wipes rates.
  const [levelRatesKnown, setLevelRatesKnown] = useState(true);
  const [memberIds, setMemberIds] = useState<string[]>([]);
  // Same guard as levelRatesKnown: false means "don't touch members on save",
  // never "save an empty member list" — a missing `include` upstream must not
  // silently lock everyone out of the project.
  const [memberIdsKnown, setMemberIdsKnown] = useState(true);
  const [selected, setSelected] = useState<string[]>([]);
  const [tagActie, setTagActie] = useState<"add" | "remove" | null>(null);
  const [tagKeuze, setTagKeuze] = useState("");
  // Het conceptproject dat wordt samengevoegd, of null als het dialoog dicht is.
  const [mergeBron, setMergeBron] = useState<any>(null);
  const [mergeDoel, setMergeDoel] = useState("");
  const [mergeZoek, setMergeZoek] = useState("");

  const mergeOpties = projectOptions(projects, { excludeId: mergeBron?.id, zoek: mergeZoek });

  async function loadProjects(withArchived: boolean) {
    const res = await fetch(`/api/projects${withArchived ? "?includeArchived=1" : ""}`);
    if (res.ok) setProjects(await res.json());
  }

  async function restoreProject(id: string) {
    const res = await fetch(`/api/projects/${id}`, { method: "PATCH" });
    if (res.ok) loadProjects(showArchived);
  }

  const form = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: { status: "ACTIVE", billable: true },
  });

  function addTag(name: string) {
    const trimmed = name.trim();
    if (trimmed && !selectedTags.some((t) => t.name === trimmed)) {
      setSelectedTags((prev) => [...prev, { name: trimmed }]);
    }
    setTagInput("");
  }

  async function onSubmit(data: FormData) {
    setLoading(true);
    setServerError("");
    const payload = {
      ...data,
      customerId: data.customerId || null,
      defaultKmRate: data.defaultKmRate === "" ? null : data.defaultKmRate || null,
      tags: selectedTags.map((t) => t.name),
      // Omit levelRates entirely when we never loaded the project's current rates
      // (levelRatesKnown === false): the API treats an absent key as "leave
      // untouched", so this can't wipe rates it never saw.
      ...(levelRatesKnown
        ? {
            levelRates: Object.entries(levelRates)
              .filter(([, v]) => v !== "" && Number(v) > 0)
              .map(([level, v]) => ({ level, rate: Number(v) })),
          }
        : {}),
      // Same omit-when-unknown rule as levelRates above.
      ...(memberIdsKnown ? { memberIds } : {}),
    };
    try {
      if (editing) {
        const res = await fetch(`/api/projects/${editing}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        if (res.ok) {
          const updated = await res.json();
          setProjects((prev) => prev.map((p) => p.id === editing ? { ...p, ...updated, customer: customers.find(c => c.id === updated.customerId) } : p));
          close();
        } else {
          const err = await res.json().catch(() => ({}));
          setServerError(err.error ?? `Fout ${res.status}`);
        }
      } else {
        const res = await fetch("/api/projects", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        if (res.ok) {
          const created = await res.json();
          const customer = customers.find((c) => c.id === created.customerId);
          setProjects((prev) => [...prev, { ...created, customer, _count: { timeEntries: 0, kmEntries: 0 } }].sort((a, b) => a.name.localeCompare(b.name)));
          close();
        } else {
          const err = await res.json().catch(() => ({}));
          setServerError(err.error ?? `Fout ${res.status}`);
        }
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
    setSelectedTags([]);
    setTagInput("");
    form.reset({ status: "ACTIVE", billable: true });
    setLevelRates({});
    setLevelRatesKnown(true);
    setMemberIds([]);
    setMemberIdsKnown(true);
  }

  // Vult het formulier vanuit een bestaand project. `name` en `customerId`
  // staan er los in omdat bewerken en kopiëren daar elk hun eigen regel voor
  // hebben; al het andere is identiek en hoort daarom in één functie, zodat een
  // nieuw veld niet in één van de twee vergeten kan worden.
  function fillForm(project: any, name: string, customerId: string) {
    // Escape, de overlay en het kruisje sluiten de dialoog buiten close() om, dus
    // een foutmelding van een vorige poging blijft anders staan als je daarna een
    // ander project opent.
    setServerError("");
    setSelectedTags(project.tags ?? []);
    form.reset({
      customerId,
      name,
      description: project.description ?? "",
      status: project.status,
      defaultKmRate: project.defaultKmRate ? Number(project.defaultKmRate) : "",
      billable: project.billable,
    });
    // project.levelRates is alleen afwezig wanneer de query die dit project laadde
    // zijn include vergeten is — niet een legitieme "geen tarieven"-staat, want dat is [].
    const ratesKnown = Array.isArray(project.levelRates);
    setLevelRatesKnown(ratesKnown);
    setLevelRates(
      ratesKnown
        ? Object.fromEntries(project.levelRates.map((r: any) => [r.level, String(r.rate)]))
        : {},
    );
    setMemberIdsKnown(Array.isArray(project.members));
    setMemberIds((project.members ?? []).map((m: any) => m.userId));
    setDialogOpen(true);
  }

  function startEdit(project: any) {
    setEditing(project.id);
    // Bewerken houdt de klant die er staat, ook als die inmiddels gearchiveerd
    // is: iemand die een typefout in de omschrijving herstelt, moet niet
    // gedwongen worden het project aan een andere klant te hangen.
    fillForm(project, project.name, project.customerId ?? "");
  }

  // Kopiëren opent hetzelfde formulier in AANMAAKSTAND: editing blijft null, dus
  // opslaan doet een POST en er ontstaat pas een project als de gebruiker opslaat.
  //
  // De twee *Known-vlaggen zijn hier het gevoelige punt. Ze staan in fillForm op
  // Array.isArray(...), en de projectenpagina laadt levelRates én members mee, dus
  // ze komen op true te staan en het formulier stuurt beide velden mee. Zou een van
  // beide false zijn, dan laat het formulier het veld weg en levert de kopie
  // stilzwijgend een project op zonder tarieven of zonder deelnemers. Controleer dat
  // met de hand na iedere wijziging aan de query op src/app/(app)/projects/page.tsx.
  function startCopy(project: any) {
    setEditing(null);
    // Een gearchiveerde klant staat NIET in de `customers`-prop en dus niet in
    // de keuzelijst. Zouden we zijn id toch invullen, dan slaat de kopie
    // stilzwijgend op onder een klant die je niet in het veld zag staan.
    // Daarom bewust leegmaken. Sinds de klant optioneel is, blokkeert dat het
    // opslaan niet meer — maar het veld toont dan zichtbaar "Geen klant" in
    // plaats van een lege plek, dus de keuze staat er wel. Datzelfde geldt voor
    // een kaal conceptproject dat sowieso geen klant heeft.
    const klantBeschikbaar = customers.some((c: any) => c.id === project.customerId);
    fillForm(project, `${project.name} (kopie)`, klantBeschikbaar ? project.customerId : "");
  }

  async function archiveProject(id: string) {
    if (!confirm("Weet u zeker dat u dit project wilt archiveren?")) return;
    const res = await fetch(`/api/projects/${id}`, { method: "DELETE" });
    if (res.ok) loadProjects(showArchived);
  }

  async function archiveSelected() {
    // selectedVisible, niet selected: wie eerst aanvinkt en daarna het
    // statusfilter wijzigt, mag niet iets archiveren dat hij niet meer ziet.
    const ids = selectedVisible.map((p) => p.id);
    const woord = ids.length === 1 ? "project" : "projecten";
    if (!confirm(`Weet u zeker dat u ${ids.length} ${woord} wilt archiveren?`)) return;
    const res = await fetch("/api/projects/bulk-archive", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids }),
    });
    if (!res.ok) {
      const payload = await res.json().catch(() => ({}));
      alert(payload.error ?? "Archiveren mislukt");
      return;
    }
    // count is hoeveel er daadwerkelijk gearchiveerd zijn (where: archivedAt: null),
    // dus lager dan ids.length als iemand anders er ondertussen al één archiveerde.
    const { count } = await res.json();
    if (count < ids.length) {
      alert(`${count} van de ${ids.length} ${woord} gearchiveerd, de rest was al gearchiveerd`);
    }
    setSelected([]);
    loadProjects(showArchived);
  }

  async function applyMerge() {
    if (!mergeBron || !mergeDoel) return;
    const doelNaam = projects.find((p) => p.id === mergeDoel)?.name ?? "";
    if (
      !confirm(
        `"${mergeBron.name}" samenvoegen met "${doelNaam}"? ` +
          `De uren, kilometers, km-sjablonen, uitgaven en deelnemers verhuizen mee en ` +
          `"${mergeBron.name}" wordt verwijderd.`,
      )
    ) {
      return;
    }
    const res = await fetch(`/api/projects/${mergeBron.id}/merge`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ targetId: mergeDoel }),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      alert(body.error ?? `Fout ${res.status}`);
      return;
    }
    setMergeBron(null);
    setMergeDoel("");
    setMergeZoek("");
    // Herladen in plaats van de lijst bijwerken: er is een project verdwenen en
    // de urentellingen van het doelproject zijn veranderd.
    loadProjects(showArchived);
  }

  async function applyTag() {
    if (!tagActie || !tagKeuze) return;
    // selectedVisible, niet selected: wie eerst aanvinkt en daarna het filter
    // wijzigt, mag geen project taggen dat hij niet meer ziet staan.
    const ids = selectedVisible.map((p) => p.id);
    // Verwijderen van de gereserveerde tag (WBSO) is toegestaan — een admin mag
    // een project terecht van de loonverwerking afhalen — maar niet zonder dat
    // hij weet wat dat betekent. Toevoegen heeft dit gevolg niet, dus alleen
    // hier vragen.
    const tagNaam = allTags.find((t) => t.id === tagKeuze)?.name ?? "";
    if (tagActie === "remove" && isReservedTagName(tagNaam)) {
      if (
        !confirm(
          `Weet u zeker dat u de tag "${tagNaam}" wilt verwijderen bij ${ids.length} project(en)? ` +
            `Deze projecten tellen daarna niet meer mee voor de WBSO-uren in de loonverwerking.`,
        )
      ) {
        return;
      }
    }
    const res = await fetch("/api/projects/bulk-tag", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids, tagId: tagKeuze, action: tagActie }),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      alert(body.error ?? `Fout ${res.status}`);
      return;
    }
    if (body.count < ids.length) {
      // Een project dat de tag al had (of juist niet had) verandert niet. Zonder
      // deze melding leest "8 geselecteerd, 3 gewijzigd" als een fout.
      const woord = tagActie === "add" ? "had de tag al" : "had de tag niet";
      alert(`${body.count} van de ${ids.length} projecten bijgewerkt; de rest ${woord}.`);
    }
    setTagActie(null);
    setTagKeuze("");
    loadProjects(showArchived);
  }

  // Eén lijst waar de tabel, de kopcheckbox én de bulkknop uit lezen, zodat
  // "selecteer alles" nooit meer archiveert dan er op het scherm staat.
  const visible = projects
    .filter((p) => statusFilter === "all" || p.status === statusFilter)
    .filter((p) => customerFilter === "all"
      || (customerFilter === GEEN_KLANT ? !p.customer : p.customerId === customerFilter));
  const selectable = visible.filter((p) => !p.archivedAt);
  const selectedVisible = selectable.filter((p) => selected.includes(p.id));
  const allSelected = selectable.length > 0 && selectedVisible.length === selectable.length;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Projecten</h1>
          <p className="text-muted-foreground">Beheer uw projecten en tarieven</p>
        </div>
        <div className="flex items-center gap-2">
          <label className="flex items-center gap-2 text-sm text-muted-foreground cursor-pointer mr-1">
            <input type="checkbox" className="h-4 w-4 rounded border-input accent-primary"
              checked={showArchived}
              onChange={(e) => { setShowArchived(e.target.checked); loadProjects(e.target.checked); }} />
            Toon gearchiveerd
          </label>
          <Select onValueChange={setCustomerFilter} value={customerFilter}>
            <SelectTrigger className="w-56"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Alle klanten</SelectItem>
              <SelectItem value={GEEN_KLANT}>
                Zonder klant{customerlessCount > 0 ? ` (${customerlessCount})` : ""}
              </SelectItem>
              {customers.map((c) => (
                <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select onValueChange={setStatusFilter} value={statusFilter}>
            <SelectTrigger className="w-48"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Alle statussen</SelectItem>
              <SelectItem value="CONCEPT">Concept</SelectItem>
              <SelectItem value="ACTIVE">Actief</SelectItem>
              <SelectItem value="INACTIVE">Inactief</SelectItem>
              <SelectItem value="COMPLETED">Afgerond</SelectItem>
            </SelectContent>
          </Select>
          {selectedVisible.length > 0 && (
            <>
              <Button variant="outline" onClick={() => { setTagActie("add"); setTagKeuze(""); }}>
                Tag toevoegen ({selectedVisible.length})
              </Button>
              <Button variant="outline" onClick={() => { setTagActie("remove"); setTagKeuze(""); }}>
                Tag verwijderen ({selectedVisible.length})
              </Button>
            </>
          )}
          {selectedVisible.length > 0 && (
            <Button variant="destructive" onClick={archiveSelected}>
              Archiveer geselecteerde ({selectedVisible.length})
            </Button>
          )}
          <Button onClick={() => { form.reset({ status: "ACTIVE", billable: true }); setEditing(null); setServerError(""); setSelectedTags([]); setLevelRates({}); setLevelRatesKnown(true); setMemberIds([]); setMemberIdsKnown(true); setDialogOpen(true); }}>
            <Plus className="h-4 w-4 mr-2" /> Project toevoegen
          </Button>
        </div>
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-10">
                  <input
                    type="checkbox"
                    className="h-4 w-4 rounded border-input accent-primary"
                    checked={allSelected}
                    disabled={selectable.length === 0}
                    onChange={(e) =>
                      setSelected(e.target.checked ? selectable.map((p) => p.id) : [])
                    }
                    title="Alle zichtbare projecten selecteren"
                  />
                </TableHead>
                <TableHead>Project</TableHead>
                <TableHead>Klant</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Tags</TableHead>
                <TableHead>Factureerbaar</TableHead>
                <TableHead className="text-right">Km-tarief</TableHead>
                <TableHead className="text-right">Uren</TableHead>
                <TableHead className="text-right">Deelnemers</TableHead>
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {visible.length === 0 && (
                <TableRow><TableCell colSpan={10} className="text-center text-muted-foreground py-8">Geen projecten gevonden</TableCell></TableRow>
              )}
              {visible.map((p) => (
                <TableRow key={p.id} className={p.archivedAt ? "opacity-60" : undefined}>
                  <TableCell>
                    {!p.archivedAt && (
                      <input
                        type="checkbox"
                        className="h-4 w-4 rounded border-input accent-primary"
                        checked={selected.includes(p.id)}
                        onChange={(e) =>
                          setSelected((prev) =>
                            e.target.checked ? [...prev, p.id] : prev.filter((id) => id !== p.id),
                          )
                        }
                      />
                    )}
                  </TableCell>
                  <TableCell className="font-medium">
                    {p.name}
                    {p.archivedAt && <span className="ml-2 text-xs text-muted-foreground">(gearchiveerd)</span>}
                  </TableCell>
                  <TableCell>{p.customer?.name}</TableCell>
                  <TableCell>
                    <Badge variant={statusVariant[p.status] as any}>{statusLabel[p.status]}</Badge>
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-wrap gap-1">
                      {(p.tags ?? []).map((tag: any) => (
                        <Badge key={tag.id} variant="outline" className="text-xs">{tag.name}</Badge>
                      ))}
                    </div>
                  </TableCell>
                  <TableCell>
                    {p.billable
                      ? <Badge variant="secondary" className="text-xs">Ja</Badge>
                      : <Badge variant="outline" className="text-xs">Nee</Badge>}
                  </TableCell>
                  <TableCell className="text-right">{p.defaultKmRate ? `€${Number(p.defaultKmRate).toFixed(2)}` : "—"}</TableCell>
                  <TableCell className="text-right">{p._count?.timeEntries ?? 0}</TableCell>
                  <TableCell className="text-right tabular-nums">
                    {p.members?.length ?? 0}
                  </TableCell>
                  <TableCell>
                    <div className="flex gap-1 justify-end">
                      {p.archivedAt ? (
                        <Button variant="ghost" size="icon" onClick={() => restoreProject(p.id)} title="Herstellen">
                          <RotateCcw className="h-3.5 w-3.5" />
                        </Button>
                      ) : (
                        <>
                          <Button variant="ghost" size="icon" onClick={() => startEdit(p)}>
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                          <Button variant="ghost" size="icon" onClick={() => startCopy(p)} title="Kopiëren">
                            <Copy className="h-3.5 w-3.5" />
                          </Button>
                          {p.status === "CONCEPT" && (
                            <Button
                              variant="ghost"
                              size="icon"
                              title="Samenvoegen met een bestaand project"
                              onClick={() => { setMergeBron(p); setMergeDoel(""); setMergeZoek(""); }}
                            >
                              <Merge className="h-3.5 w-3.5" />
                            </Button>
                          )}
                          <Button variant="ghost" size="icon" onClick={() => archiveProject(p.id)} title="Archiveren">
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

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editing ? "Project aanpassen" : "Project toevoegen"}</DialogTitle>
          </DialogHeader>
          <form onSubmit={form.handleSubmit(onSubmit)} className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1 sm:col-span-2">
              <Label>Klant</Label>
              <Select
                onValueChange={(v) => form.setValue("customerId", v === GEEN_KLANT ? "" : v)}
                value={form.watch("customerId") || GEEN_KLANT}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={GEEN_KLANT}>Geen klant</SelectItem>
                  {customers.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1 sm:col-span-2">
              <Label>Projectnaam *</Label>
              <Input {...form.register("name")} />
              {form.formState.errors.name && <p className="text-xs text-destructive">{form.formState.errors.name.message}</p>}
            </div>
            <div className="space-y-1 sm:col-span-2">
              <Label>Omschrijving</Label>
              <Textarea {...form.register("description")} rows={2} />
            </div>
            <div className="space-y-1 sm:col-span-2">
              <Label>Tags</Label>
              {allTags.filter((t) => !selectedTags.some((s) => s.name === t.name)).length > 0 && (
                <Select
                  value=""
                  onValueChange={(name) => { if (name) addTag(name); }}
                >
                  <SelectTrigger><SelectValue placeholder="Selecteer bestaande tag…" /></SelectTrigger>
                  <SelectContent>
                    {allTags
                      .filter((t) => !selectedTags.some((s) => s.name === t.name))
                      .map((t) => <SelectItem key={t.id} value={t.name}>{t.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              )}
              <div className="flex gap-2">
                <Input
                  value={tagInput}
                  onChange={(e) => setTagInput(e.target.value)}
                  onKeyDown={(e) => {
                    if ((e.key === "Enter" || e.key === ",") && tagInput.trim()) {
                      e.preventDefault();
                      addTag(tagInput.replace(/,\s*$/, ""));
                    }
                  }}
                  onBlur={() => { if (tagInput.trim()) addTag(tagInput); }}
                  placeholder="Nieuwe tag…"
                />
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => { if (tagInput.trim()) addTag(tagInput); }}
                  disabled={!tagInput.trim()}
                >
                  Toevoegen
                </Button>
              </div>
              {selectedTags.length > 0 && (
                <div className="flex flex-wrap gap-1 mt-1">
                  {selectedTags.map((tag) => (
                    <Badge
                      key={tag.name}
                      variant="secondary"
                      className="cursor-pointer text-xs gap-1"
                      onClick={() => setSelectedTags((prev) => prev.filter((t) => t.name !== tag.name))}
                    >
                      {tag.name} ×
                    </Badge>
                  ))}
                </div>
              )}
            </div>
            <div className="space-y-1">
              <Label>Status</Label>
              <Select onValueChange={(v) => form.setValue("status", v as any)} value={form.watch("status")}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="CONCEPT">Concept</SelectItem>
                  <SelectItem value="ACTIVE">Actief</SelectItem>
                  <SelectItem value="INACTIVE">Inactief</SelectItem>
                  <SelectItem value="COMPLETED">Afgerond</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Standaard km-tarief (€/km)</Label>
              <Input type="number" step="0.01" min="0" placeholder="0.23" {...form.register("defaultKmRate")} />
            </div>
            <div className="space-y-2">
              <Label>Factureerbaar</Label>
              <Select
                onValueChange={(v) => form.setValue("billable", v === "true")}
                value={form.watch("billable") === false ? "false" : "true"}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="true">Ja</SelectItem>
                  <SelectItem value="false">Nee</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                Bepaalt of uren, ritten en uitgaven op dit project gefactureerd kunnen worden.
              </p>
            </div>
            <div className="sm:col-span-2">
              <LevelRateFields
                value={levelRates}
                onChange={setLevelRates}
                hint={
                  levelRatesKnown
                    ? "Leeg laten betekent: gebruik het tarief van de klant."
                    : "Tarieven konden niet worden geladen; wijzigingen hier worden niet opgeslagen."
                }
              />
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label>Deelnemers</Label>
              <p className="text-xs text-muted-foreground">
                Alleen deze medewerkers kunnen uren, ritten en uitgaven op dit project boeken.
              </p>
              <div className="space-y-1 max-h-48 overflow-y-auto">
                {users.map((u: any) => (
                  <label key={u.id} className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      className="h-4 w-4 rounded border-input accent-primary"
                      checked={memberIds.includes(u.id)}
                      onChange={(e) =>
                        setMemberIds((prev) =>
                          e.target.checked ? [...prev, u.id] : prev.filter((id) => id !== u.id),
                        )
                      }
                    />
                    {u.name}
                  </label>
                ))}
              </div>
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

      <Dialog open={mergeBron !== null} onOpenChange={(o) => { if (!o) setMergeBron(null); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Samenvoegen met een bestaand project</DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            <p className="text-sm text-muted-foreground">
              De uren, kilometers en uitgaven van &quot;{mergeBron?.name}&quot; verhuizen naar het
              gekozen project, en de deelnemers krijgen daar boekrecht. &quot;{mergeBron?.name}&quot;
              wordt daarna verwijderd.
            </p>
            <Input
              autoFocus
              value={mergeZoek}
              onChange={(e) => {
                setMergeZoek(e.target.value);
                // Een gekozen project dat door het typen uit de lijst valt zou
                // gekozen blijven met een leeg vak erboven. Dan liever loslaten.
                setMergeDoel("");
              }}
              placeholder="Zoek op klant of project"
            />
            <Select onValueChange={setMergeDoel} value={mergeDoel}>
              <SelectTrigger><SelectValue placeholder="Kies een doelproject" /></SelectTrigger>
              <SelectContent>
                {mergeOpties.length === 0 ? (
                  <p className="px-2 py-3 text-sm text-muted-foreground">Geen project gevonden</p>
                ) : (
                  mergeOpties.map((o) => (
                    <SelectItem key={o.id} value={o.id}>{o.label}</SelectItem>
                  ))
                )}
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setMergeBron(null)}>Annuleren</Button>
            <Button onClick={applyMerge} disabled={!mergeDoel}>Samenvoegen</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={tagActie !== null} onOpenChange={(o) => { if (!o) setTagActie(null); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>
              {tagActie === "add" ? "Tag toevoegen" : "Tag verwijderen"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            <p className="text-sm text-muted-foreground">
              {selectedVisible.length} geselecteerde project(en).
              {tagActie === "add"
                ? " Bestaande tags van die projecten blijven staan."
                : " Alleen deze tag wordt verwijderd."}
            </p>
            <Select onValueChange={setTagKeuze} value={tagKeuze}>
              <SelectTrigger><SelectValue placeholder="Kies een tag" /></SelectTrigger>
              <SelectContent>
                {allTags.map((t) => (
                  <SelectItem key={t.id} value={t.id}>
                    {t.name}
                    {isReservedTagName(t.name) && " — gebruikt door de loonverwerking"}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setTagActie(null)}>Annuleren</Button>
            <Button onClick={applyTag} disabled={!tagKeuze}>
              {tagActie === "add" ? "Toevoegen" : "Verwijderen"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
