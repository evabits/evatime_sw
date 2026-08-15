"use client";
import { useState, useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { format, startOfWeek, addWeeks, addDays } from "date-fns";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { formatDate, formatCurrency } from "@/lib/utils";
import { isBillable } from "@/lib/billable";
import { Pencil, Trash2, ChevronLeft, ChevronRight, CalendarDays, List } from "lucide-react";
import { WeekGrid } from "@/components/shared/week-grid";
import { perDayTotals } from "@/lib/per-day-totals";

const schema = z.object({
  projectId: z.string().min(1, "Verplicht"),
  date: z.string().min(1, "Verplicht"),
  km: z.coerce.number().positive("Moet positief zijn"),
  description: z.string().optional(),
  rateOverride: z.coerce.number().positive().optional().or(z.literal("")),
  userId: z.string().optional(),
});

type FormData = z.infer<typeof schema>;

function currentMonth() {
  return format(new Date(), "yyyy-MM");
}

function monthBounds(ym: string): { from: string; to: string } {
  const [y, m] = ym.split("-").map(Number);
  const from = `${ym}-01`;
  const last = new Date(y, m, 0).getDate();
  const to = `${ym}-${String(last).padStart(2, "0")}`;
  return { from, to };
}

interface Props {
  projects: any[];
  customers: any[];
  users: any[];
  initialEntries: any[];
  initialTemplates: any[];
  userId: string;
  role: string;
}

export function KmEntriesClient({ projects, customers, users, initialEntries, initialTemplates, userId, role }: Props) {
  const isAdmin = role === "ADMIN";

  const [entries, setEntries] = useState(initialEntries);
  const [templates, setTemplates] = useState(initialTemplates);
  const [appliedTemplate, setAppliedTemplate] = useState("");
  const [saveAsTemplate, setSaveAsTemplate] = useState(false);
  const [templateDialogOpen, setTemplateDialogOpen] = useState(false);
  const [templateName, setTemplateName] = useState("");
  const [templateError, setTemplateError] = useState("");
  const [pendingTemplate, setPendingTemplate] = useState<any>(null);
  const [savingTemplate, setSavingTemplate] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [filterMonth, setFilterMonth] = useState(currentMonth());
  const [filterProject, setFilterProject] = useState("all");
  const [filterUser, setFilterUser] = useState("all");
  const [fetching, setFetching] = useState(false);
  const [selectedCustomerId, setSelectedCustomerId] = useState<string>("");

  // Weekweergave, gelijk aan het urenscherm: week is de standaard.
  const [viewMode, setViewMode] = useState<"week" | "list">("week");
  const [weekOffset, setWeekOffset] = useState(0);
  const [selectedDay, setSelectedDay] = useState<string | null>(null);

  const today = format(new Date(), "yyyy-MM-dd");
  const weekStart = startOfWeek(addWeeks(new Date(), weekOffset), { weekStartsOn: 1 });
  const weekEnd = addDays(weekStart, 6);
  const weekFrom = format(weekStart, "yyyy-MM-dd");
  const weekTo = format(weekEnd, "yyyy-MM-dd");
  const weekDays = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));

  // Filteren op het weekvenster werkt ook op de registraties die de pagina
  // meegaf, zodat het raster meteen klopt zonder eerst te hoeven ophalen.
  const weekEntries = entries.filter((e) => {
    const d = format(new Date(e.date), "yyyy-MM-dd");
    return d >= weekFrom && d <= weekTo;
  });

  const kmPerDay = perDayTotals(
    weekEntries.map((e) => ({ date: e.date, value: Number(e.km) })),
    weekDays.map((day) => format(day, "yyyy-MM-dd")),
  );

  const displayedEntries = viewMode === "week"
    ? (selectedDay ? weekEntries.filter((e) => format(new Date(e.date), "yyyy-MM-dd") === selectedDay) : weekEntries)
    : entries;

  const form = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: { date: format(new Date(), "yyyy-MM-dd"), userId },
  });

  const selectedProjectId = form.watch("projectId");
  const selectedProject = projects.find((p) => p.id === selectedProjectId);

  const filteredProjects = selectedCustomerId === ""
    ? projects
    : projects.filter((p) => p.customer?.id === selectedCustomerId);

  function changeCustomer(v: string) {
    setSelectedCustomerId(v);
    form.setValue("projectId", "");
  }

  function applyTemplate(id: string) {
    setAppliedTemplate(id);
    const t = templates.find((t) => t.id === id);
    if (!t) return;
    setSelectedCustomerId(t.project?.customer?.id ?? "");
    form.setValue("projectId", t.projectId);
    form.setValue("km", Number(t.km));
    form.setValue("description", t.description ?? "");
  }

  async function fetchWeekEntries(offset: number, userFilter = filterUser) {
    const ws = startOfWeek(addWeeks(new Date(), offset), { weekStartsOn: 1 });
    const we = addDays(ws, 6);
    setFetching(true);
    const params = new URLSearchParams({ from: format(ws, "yyyy-MM-dd"), to: format(we, "yyyy-MM-dd") });
    if (userFilter !== "all") params.set("userId", userFilter);
    const res = await fetch(`/api/km?${params}`);
    if (res.ok) setEntries(await res.json());
    setFetching(false);
  }

  async function handleWeekNav(newOffset: number) {
    setWeekOffset(newOffset);
    setSelectedDay(null);
    await fetchWeekEntries(newOffset);
  }

  async function switchToWeek() {
    setViewMode("week");
    setWeekOffset(0);
    setSelectedDay(null);
    await fetchWeekEntries(0);
  }

  async function switchToList() {
    setViewMode("list");
    setSelectedDay(null);
    await fetchEntries(filterMonth, filterProject);
  }

  function toggleDay(dayStr: string) {
    setSelectedDay((prev) => (prev === dayStr ? null : dayStr));
  }

  // Een dag aanklikken zet het formulier op die datum, zodat invoeren en
  // bekijken bij elkaar blijven.
  useEffect(() => {
    if (viewMode === "week" && selectedDay) {
      form.setValue("date", selectedDay);
    }
  }, [selectedDay]); // eslint-disable-line react-hooks/exhaustive-deps

  async function fetchEntries(month: string, projectId: string, userFilter = filterUser) {
    setFetching(true);
    const { from, to } = monthBounds(month);
    const params = new URLSearchParams({ from, to });
    if (projectId !== "all") params.set("projectId", projectId);
    if (userFilter !== "all") params.set("userId", userFilter);
    const res = await fetch(`/api/km?${params}`);
    if (res.ok) setEntries(await res.json());
    setFetching(false);
  }

  function handleMonthChange(month: string) {
    setFilterMonth(month);
    fetchEntries(month, filterProject);
  }

  function handleProjectChange(projectId: string) {
    setFilterProject(projectId);
    fetchEntries(filterMonth, projectId);
  }

  async function handleUserChange(uid: string) {
    setFilterUser(uid);
    if (viewMode === "week") await fetchWeekEntries(weekOffset, uid);
    else await fetchEntries(filterMonth, filterProject, uid);
  }

  async function onSubmit(data: FormData) {
    setLoading(true);
    const payload = {
      ...data,
      rateOverride: data.rateOverride === "" ? null : data.rateOverride || null,
    };
    try {
      if (editing) {
        const res = await fetch(`/api/km/${editing}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        if (res.ok) {
          const updated = await res.json();
          setEntries((prev) => prev.map((e) => (e.id === editing ? { ...e, ...updated } : e)));
          setEditing(null);
          form.reset({ date: selectedDay ?? today, userId });
        }
      } else {
        const res = await fetch("/api/km", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        if (res.ok) {
          const targetUser = data.userId ?? userId;
          const switchedFilter =
            isAdmin && targetUser !== userId && filterUser !== "all" && filterUser !== targetUser;
          if (switchedFilter) {
            await handleUserChange(targetUser);
          } else if (viewMode === "week") {
            // In weekmodus opnieuw ophalen in plaats van de lijst bijwerken: de
            // maandgrens hieronder zegt niets over het weekvenster.
            await fetchWeekEntries(weekOffset);
          } else {
            const created = await res.json();
            const { from, to } = monthBounds(filterMonth);
            const entryDate = data.date;
            if (entryDate >= from && entryDate <= to && (filterProject === "all" || data.projectId === filterProject)) {
              setEntries((prev) => [created, ...prev]);
            }
          }
          if (saveAsTemplate) {
            setPendingTemplate({
              projectId: data.projectId,
              km: data.km,
              description: data.description || null,
            });
            setTemplateName(data.description || "");
            setTemplateError("");
            setTemplateDialogOpen(true);
          }
          form.reset({ date: selectedDay ?? data.date, userId: data.userId ?? userId });
          setAppliedTemplate("");
        }
      }
    } finally {
      setLoading(false);
    }
  }

  async function saveTemplate() {
    if (!templateName.trim() || !pendingTemplate) return;
    setSavingTemplate(true);
    setTemplateError("");
    try {
      const res = await fetch("/api/km/templates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...pendingTemplate, name: templateName.trim() }),
      });
      if (res.ok) {
        const created = await res.json();
        setTemplates((prev) => [...prev, created].sort((a, b) => a.name.localeCompare(b.name)));
        setTemplateDialogOpen(false);
        setSaveAsTemplate(false);
        setPendingTemplate(null);
      } else if (res.status === 409) {
        setTemplateError("Naam bestaat al");
      } else {
        setTemplateError("Opslaan mislukt");
      }
    } finally {
      setSavingTemplate(false);
    }
  }

  async function deleteEntry(id: string) {
    if (!confirm("Weet u zeker dat u deze registratie wilt verwijderen?")) return;
    await fetch(`/api/km/${id}`, { method: "DELETE" });
    setEntries((prev) => prev.filter((e) => e.id !== id));
  }

  function startEdit(entry: any) {
    setEditing(entry.id);
    setSelectedCustomerId(entry.project?.customer?.id ?? "");
    form.reset({
      projectId: entry.projectId,
      date: format(new Date(entry.date), "yyyy-MM-dd"),
      km: Number(entry.km),
      description: entry.description ?? "",
      rateOverride: entry.rateOverride ? Number(entry.rateOverride) : undefined,
      userId: entry.userId,
    });
  }

  const totalKm = entries.reduce((s, e) => s + Number(e.km), 0);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Kilometers registreren</h1>
        <p className="text-muted-foreground">Beheer uw kilometerregistraties</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{editing ? "Km aanpassen" : "Km toevoegen"}</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={form.handleSubmit(onSubmit)} className="grid gap-4 sm:grid-cols-2">

            {isAdmin && users.length > 0 && (
              <div className="space-y-2">
                <Label>Medewerker</Label>
                <Select onValueChange={(v) => form.setValue("userId", v)} value={form.watch("userId") ?? userId}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {users.map((u) => (
                      <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {!editing && templates.length > 0 && (
              <div className="space-y-2 sm:col-span-2">
                <Label>Sjabloon</Label>
                {/* Lege string en niet undefined: Radix ziet undefined als
                    onbestuurd en houdt zijn eigen laatste keuze vast, waardoor
                    het leegmaken hieronder niets deed. */}
                <Select value={appliedTemplate} onValueChange={applyTemplate}>
                  <SelectTrigger><SelectValue placeholder="Kies een opgeslagen rit om in te vullen" /></SelectTrigger>
                  <SelectContent>
                    {templates.map((t) => (
                      <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            <div className="space-y-2">
              <Label>Klant</Label>
              <Select value={selectedCustomerId} onValueChange={changeCustomer}>
                <SelectTrigger><SelectValue placeholder="Selecteer klant" /></SelectTrigger>
                <SelectContent>
                  {customers.map((c) => (
                    <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Project *</Label>
              <Select onValueChange={(v) => form.setValue("projectId", v)} value={form.watch("projectId") ?? ""}>
                <SelectTrigger><SelectValue placeholder="Selecteer project" /></SelectTrigger>
                <SelectContent>
                  {/* title toont de projectomschrijving bij het over-hoveren. */}
                  {filteredProjects.map((p) => (
                    <SelectItem key={p.id} value={p.id} title={p.description || undefined}>{p.customer ? `${p.customer.name} — ` : ""}{p.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {form.formState.errors.projectId && <p className="text-xs text-destructive">{form.formState.errors.projectId.message}</p>}
            </div>

            <div className="space-y-2">
              <Label>Datum *</Label>
              <Input type="date" {...form.register("date")} />
            </div>

            <div className="space-y-2">
              <Label>Kilometers *</Label>
              <Input type="number" step="0.1" min="0.1" placeholder="45.5" {...form.register("km")} />
              {form.formState.errors.km && <p className="text-xs text-destructive">{form.formState.errors.km.message}</p>}
            </div>

            {isAdmin && (
              <div className="space-y-2">
                <Label>
                  Tarief override (€/km)
                  {selectedProject?.defaultKmRate && (
                    <span className="text-muted-foreground font-normal"> · standaard: €{Number(selectedProject.defaultKmRate).toFixed(2)}</span>
                  )}
                </Label>
                <Input type="number" step="0.01" min="0" placeholder="Optioneel" {...form.register("rateOverride")} />
              </div>
            )}

            <div className="space-y-2 sm:col-span-2">
              <Label>Omschrijving</Label>
              <Textarea placeholder="Bijv. bezoek klant Amsterdam" {...form.register("description")} rows={2} />
            </div>

            <div className="sm:col-span-2 flex flex-wrap items-center gap-4">
              <Button type="submit" disabled={loading}>{loading ? (editing ? "Opslaan..." : "Toevoegen...") : (editing ? "Opslaan" : "Toevoegen")}</Button>
              {editing && (
                <Button type="button" variant="outline" onClick={() => {
                  setEditing(null);
                  setSelectedCustomerId("");
                  setAppliedTemplate("");
                  setSaveAsTemplate(false);
                  form.reset({ date: format(new Date(), "yyyy-MM-dd"), userId });
                }}>Annuleren</Button>
              )}
              {!editing && (
                <label className="flex items-center gap-2 text-sm text-muted-foreground cursor-pointer">
                  <input
                    type="checkbox"
                    className="h-4 w-4 rounded border-input"
                    checked={saveAsTemplate}
                    onChange={(e) => setSaveAsTemplate(e.target.checked)}
                  />
                  Opslaan als sjabloon
                </label>
              )}
            </div>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-1.5">
              {viewMode === "week" ? (
                <>
                  <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => handleWeekNav(weekOffset - 1)}>
                    <ChevronLeft className="h-4 w-4" />
                  </Button>
                  <span className="text-sm font-medium tabular-nums">
                    {formatDate(weekStart)} – {formatDate(weekEnd)}
                  </span>
                  <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => handleWeekNav(weekOffset + 1)}>
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                  {weekOffset !== 0 && (
                    <Button variant="ghost" size="sm" className="h-7 text-xs px-2" onClick={() => handleWeekNav(0)}>
                      Deze week
                    </Button>
                  )}
                </>
              ) : (
                <>
                  <CardTitle>Registraties</CardTitle>
                  {entries.length > 0 && (
                    <span className="text-sm text-muted-foreground">{totalKm.toFixed(1)} km</span>
                  )}
                </>
              )}
            </div>
            <div className="flex items-center gap-2 flex-wrap justify-end">
              {isAdmin && users.length > 0 && (
                <Select value={filterUser} onValueChange={handleUserChange}>
                  <SelectTrigger className="w-40 h-8 text-sm"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Alle medewerkers</SelectItem>
                    {users.map((u) => (
                      <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
              {/* Maand en project alleen in lijstmodus: een weekvenster en een
                  maandfilter tegelijk aanbieden spreekt elkaar tegen. */}
              {viewMode === "list" && (
                <div className="flex flex-wrap gap-2">
                  <Input
                    type="month"
                    value={filterMonth}
                    onChange={(e) => handleMonthChange(e.target.value)}
                    className="w-40 h-8 text-sm"
                  />
                  <Select value={filterProject} onValueChange={handleProjectChange}>
                    <SelectTrigger className="w-48 h-8 text-sm"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Alle projecten</SelectItem>
                      {projects.map((p) => (
                        <SelectItem key={p.id} value={p.id}>{p.customer ? `${p.customer.name} — ` : ""}{p.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
              <div className="flex rounded-md border overflow-hidden">
                <Button
                  variant={viewMode === "week" ? "default" : "ghost"}
                  size="sm"
                  className="rounded-none h-8 px-2.5"
                  onClick={switchToWeek}
                  title="Weekoverzicht"
                >
                  <CalendarDays className="h-4 w-4" />
                </Button>
                <Button
                  variant={viewMode === "list" ? "default" : "ghost"}
                  size="sm"
                  className="rounded-none h-8 px-2.5"
                  onClick={switchToList}
                  title="Lijstweergave"
                >
                  <List className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </div>
        </CardHeader>
        {viewMode === "week" && (
          <WeekGrid
            days={weekDays}
            values={kmPerDay}
            today={today}
            selectedDay={selectedDay}
            onSelect={toggleDay}
            formatValue={(v) => v.toFixed(1)}
          />
        )}
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Datum</TableHead>
                <TableHead>Project</TableHead>
                <TableHead>Omschrijving</TableHead>
                {isAdmin && filterUser === "all" && <TableHead>Medewerker</TableHead>}
                <TableHead className="text-right">Km</TableHead>
                {isAdmin && <TableHead className="text-right">Tarief</TableHead>}
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {fetching && (
                <TableRow><TableCell colSpan={isAdmin ? (filterUser === "all" ? 7 : 6) : 5} className="text-center text-muted-foreground py-8">Laden...</TableCell></TableRow>
              )}
              {!fetching && displayedEntries.length === 0 && (
                <TableRow><TableCell colSpan={isAdmin ? (filterUser === "all" ? 7 : 6) : 5} className="text-center text-muted-foreground py-8">Geen registraties gevonden</TableCell></TableRow>
              )}
              {!fetching && displayedEntries.map((entry) => (
                <TableRow key={entry.id}>
                  <TableCell className="whitespace-nowrap">{formatDate(entry.date)}</TableCell>
                  <TableCell>
                    <div className="font-medium">{entry.project?.name}</div>
                    <div className="text-xs text-muted-foreground">{entry.project?.customer?.name}</div>
                  </TableCell>
                  <TableCell className="max-w-48 truncate">{entry.description ?? "—"}</TableCell>
                  {isAdmin && filterUser === "all" && (
                    <TableCell className="text-sm">{entry.user?.name ?? "—"}</TableCell>
                  )}
                  <TableCell className="text-right font-mono">{Number(entry.km).toFixed(1)}</TableCell>
                  {isAdmin && (
                    <TableCell className="text-right">
                      {entry.rateOverride ? formatCurrency(Number(entry.rateOverride)) + "/km" : "—"}
                      {isBillable(entry) === null && (
                        <Badge variant="outline" className="ml-2 text-xs">Onbekend</Badge>
                      )}
                      {isBillable(entry) === false && (
                        <Badge variant="secondary" className="ml-2 text-xs">Niet</Badge>
                      )}
                    </TableCell>
                  )}
                  <TableCell>
                    <div className="flex gap-1 justify-end">
                      <Button variant="ghost" size="icon" onClick={() => startEdit(entry)} disabled={entry.invoiced}>
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button variant="ghost" size="icon" onClick={() => deleteEntry(entry.id)} disabled={entry.invoiced}>
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

      <Dialog open={templateDialogOpen} onOpenChange={(o) => { if (!o) { setTemplateDialogOpen(false); setSaveAsTemplate(false); } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Sjabloon opslaan</DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            <Label>Naam</Label>
            <Input
              value={templateName}
              onChange={(e) => { setTemplateName(e.target.value); setTemplateError(""); }}
              placeholder="Bijv. Thuis–kantoor"
              onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); saveTemplate(); } }}
              autoFocus
            />
            {templateError && <p className="text-xs text-destructive">{templateError}</p>}
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => { setTemplateDialogOpen(false); setSaveAsTemplate(false); }}>Annuleren</Button>
            <Button type="button" onClick={saveTemplate} disabled={savingTemplate || !templateName.trim()}>
              {savingTemplate ? "Opslaan..." : "Opslaan"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
