"use client";
import { useState, useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { format, addDays, addWeeks, startOfWeek } from "date-fns";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { formatDate, formatHours, formatCurrency, cn } from "@/lib/utils";
import { Pencil, Trash2, CalendarDays, List, ChevronLeft, ChevronRight, MessageSquare } from "lucide-react";

const DAY_ABBR = ["Ma", "Di", "Wo", "Do", "Vr", "Za", "Zo"];

const schema = z.object({
  projectId: z.string().min(1, "Verplicht"),
  activityTypeId: z.string().optional(),
  date: z.string().min(1, "Verplicht"),
  hours: z.coerce.number().positive("Moet positief zijn"),
  description: z.string().optional(),
  rateOverride: z.coerce.number().positive().optional().or(z.literal("")),
  billable: z.boolean().optional(),
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
  activityTypes: any[];
  customers: any[];
  users: any[];
  initialEntries: any[];
  userId: string;
  role: string;
}

export function TimeEntriesClient({ projects: projectsProp, activityTypes: activityTypesProp, customers, users, initialEntries, userId, role }: Props) {
  const isAdmin = role === "ADMIN";

  const [projects, setProjects] = useState(projectsProp);
  const [activityTypes, setActivityTypes] = useState(activityTypesProp);
  const [entries, setEntries] = useState(initialEntries);
  const [editing, setEditing] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [filterMonth, setFilterMonth] = useState(currentMonth());
  const [filterProject, setFilterProject] = useState("all");
  const [fetching, setFetching] = useState(false);
  const [selectedCustomerId, setSelectedCustomerId] = useState<string>("");

  const [newProjectOpen, setNewProjectOpen] = useState(false);
  const [newProjectName, setNewProjectName] = useState("");
  const [newProjectActivityIds, setNewProjectActivityIds] = useState<string[]>([]);
  const [newProjectSaving, setNewProjectSaving] = useState(false);

  const [filterUser, setFilterUser] = useState("all");

  // Week view state
  const [viewMode, setViewMode] = useState<"week" | "list">("week");
  const [weekOffset, setWeekOffset] = useState(0);
  const [selectedDay, setSelectedDay] = useState<string | null>(null);

  const today = format(new Date(), "yyyy-MM-dd");
  const weekStart = startOfWeek(addWeeks(new Date(), weekOffset), { weekStartsOn: 1 });
  const weekEnd = addDays(weekStart, 6);
  const weekFrom = format(weekStart, "yyyy-MM-dd");
  const weekTo = format(weekEnd, "yyyy-MM-dd");
  const weekDays = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));

  // Filter entries to the current week window (works for initial entries too)
  const weekEntries = entries.filter((e) => {
    const d = format(new Date(e.date), "yyyy-MM-dd");
    return d >= weekFrom && d <= weekTo;
  });

  const hoursPerDay = weekDays.map((day) => {
    const dayStr = format(day, "yyyy-MM-dd");
    return weekEntries
      .filter((e) => format(new Date(e.date), "yyyy-MM-dd") === dayStr)
      .reduce((s, e) => s + Number(e.hours), 0);
  });
  const weekTotal = hoursPerDay.reduce((s, h) => s + h, 0);

  const displayedEntries = viewMode === "week"
    ? (selectedDay ? weekEntries.filter((e) => format(new Date(e.date), "yyyy-MM-dd") === selectedDay) : weekEntries)
    : entries;

  const form = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: { date: today, billable: true },
  });

  const selectedProjectId = form.watch("projectId");
  const selectedProject = projects.find((p) => p.id === selectedProjectId);
  const activityTypeId = form.watch("activityTypeId");

  const filteredProjects = selectedCustomerId === ""
    ? projects
    : projects.filter((p) => p.customer?.id === selectedCustomerId);

  const filteredActivityTypes = activityTypes.filter((a) => {
    if (a.showInAllProjects) return true;
    if (!selectedProjectId) return false;
    return a.projects.some((p: any) => p.projectId === selectedProjectId);
  });

  useEffect(() => {
    if (!isAdmin) {
      const act = activityTypes.find((a) => a.id === activityTypeId);
      form.setValue("billable", act?.billable ?? true);
    }
  }, [activityTypeId, isAdmin]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    form.setValue("projectId", "");
    form.setValue("activityTypeId", undefined);
  }, [selectedCustomerId]); // eslint-disable-line react-hooks/exhaustive-deps

  // When a day is selected in week view, pre-fill the form date
  useEffect(() => {
    if (viewMode === "week" && selectedDay) {
      form.setValue("date", selectedDay);
    }
  }, [selectedDay]); // eslint-disable-line react-hooks/exhaustive-deps

  function getEffectiveRate(atId?: string): number | null {
    if (!selectedProject) return null;
    const override = selectedProject.activityRates?.find((r: any) => r.activityTypeId === atId);
    if (override) return Number(override.rate);
    const actType = activityTypes.find((a: any) => a.id === atId);
    if (actType?.defaultRate) return Number(actType.defaultRate);
    return selectedProject.defaultHourlyRate ? Number(selectedProject.defaultHourlyRate) : null;
  }

  async function fetchEntries(month: string, projectId: string, userFilter = filterUser) {
    setFetching(true);
    const { from, to } = monthBounds(month);
    const params = new URLSearchParams({ from, to });
    if (projectId !== "all") params.set("projectId", projectId);
    if (userFilter !== "all") params.set("userId", userFilter);
    const res = await fetch(`/api/time?${params}`);
    if (res.ok) setEntries(await res.json());
    setFetching(false);
  }

  async function fetchWeekEntries(offset: number, userFilter = filterUser) {
    const ws = startOfWeek(addWeeks(new Date(), offset), { weekStartsOn: 1 });
    const we = addDays(ws, 6);
    setFetching(true);
    const params = new URLSearchParams({ from: format(ws, "yyyy-MM-dd"), to: format(we, "yyyy-MM-dd") });
    if (userFilter !== "all") params.set("userId", userFilter);
    const res = await fetch(`/api/time?${params}`);
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

  function handleUserChange(uid: string) {
    setFilterUser(uid);
    if (viewMode === "week") fetchWeekEntries(weekOffset, uid);
    else fetchEntries(filterMonth, filterProject, uid);
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
    await fetchEntries(filterMonth, filterProject);
  }

  function toggleDay(dayStr: string) {
    setSelectedDay((prev) => (prev === dayStr ? null : dayStr));
  }

  async function handleCreateConceptProject() {
    if (!newProjectName.trim()) return;
    setNewProjectSaving(true);
    try {
      const res = await fetch("/api/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: newProjectName.trim(),
          status: "CONCEPT",
          activityTypeIds: newProjectActivityIds,
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        alert(body.error ?? "Aanmaken mislukt");
        return;
      }
      const created = await res.json();
      setProjects((prev) => [
        ...prev,
        { id: created.id, name: created.name, status: "CONCEPT", defaultHourlyRate: null, customer: null, activityRates: [] },
      ]);
      // Make the chosen activities selectable for the new project without a reload.
      setActivityTypes((prev) =>
        prev.map((a) =>
          newProjectActivityIds.includes(a.id)
            ? { ...a, projects: [...a.projects, { projectId: created.id }] }
            : a,
        ),
      );
      form.setValue("projectId", created.id);
      setNewProjectOpen(false);
      setNewProjectName("");
      setNewProjectActivityIds([]);
    } finally {
      setNewProjectSaving(false);
    }
  }

  async function onSubmit(data: FormData) {
    setLoading(true);
    const payload = {
      ...data,
      rateOverride: data.rateOverride === "" ? null : data.rateOverride || null,
      activityTypeId: data.activityTypeId || null,
    };
    try {
      if (editing) {
        const res = await fetch(`/api/time/${editing}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        if (res.ok) {
          setEditing(null);
          form.reset({ date: selectedDay ?? today, billable: true });
          if (viewMode === "week") await fetchWeekEntries(weekOffset);
          else {
            const updated = await res.json();
            setEntries((prev) => prev.map((e) => (e.id === editing ? { ...e, ...updated } : e)));
          }
        }
      } else {
        const res = await fetch("/api/time", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        if (res.ok) {
          form.reset({ date: selectedDay ?? today, billable: true });
          if (viewMode === "week") {
            await fetchWeekEntries(weekOffset);
          } else {
            const created = await res.json();
            const { from, to } = monthBounds(filterMonth);
            const entryDate = data.date;
            if (entryDate >= from && entryDate <= to && (filterProject === "all" || data.projectId === filterProject)) {
              setEntries((prev) => [created, ...prev]);
            }
          }
        }
      }
    } finally {
      setLoading(false);
    }
  }

  async function deleteEntry(id: string) {
    if (!confirm("Weet u zeker dat u deze registratie wilt verwijderen?")) return;
    await fetch(`/api/time/${id}`, { method: "DELETE" });
    setEntries((prev) => prev.filter((e) => e.id !== id));
  }

  function startEdit(entry: any) {
    setEditing(entry.id);
    setSelectedCustomerId(entry.project?.customer?.id ?? "");
    form.reset({
      projectId: entry.projectId,
      activityTypeId: entry.activityTypeId ?? undefined,
      date: format(new Date(entry.date), "yyyy-MM-dd"),
      hours: Number(entry.hours),
      description: entry.description ?? "",
      rateOverride: entry.rateOverride ? Number(entry.rateOverride) : undefined,
      billable: entry.billable,
    });
  }

  const effectiveRate = getEffectiveRate(activityTypeId);
  const totalHours = entries.reduce((s, e) => s + Number(e.hours), 0);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Uren registreren</h1>
        <p className="text-muted-foreground">Beheer uw urenregistraties</p>
      </div>

      {/* ── Entry form ── */}
      <Card>
        <CardHeader>
          <CardTitle>{editing ? "Uren aanpassen" : "Uren toevoegen"}</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={form.handleSubmit(onSubmit)} className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>Klant</Label>
              <Select value={selectedCustomerId || undefined} onValueChange={(v) => setSelectedCustomerId(v)}>
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
              <div className="flex gap-2">
                <Select onValueChange={(v) => form.setValue("projectId", v)} value={form.watch("projectId") ?? ""}>
                  <SelectTrigger><SelectValue placeholder="Selecteer project" /></SelectTrigger>
                  <SelectContent>
                    {filteredProjects.map((p) => (
                      <SelectItem key={p.id} value={p.id}>
                        {p.customer ? `${p.customer.name} — ` : ""}{p.name}{p.status === "CONCEPT" ? " (concept)" : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button type="button" variant="outline" size="sm" onClick={() => setNewProjectOpen(true)}>
                  + Nieuw project
                </Button>
              </div>
              {form.formState.errors.projectId && <p className="text-xs text-destructive">{form.formState.errors.projectId.message}</p>}
            </div>

            <div className="space-y-2">
              <Label>Activiteit</Label>
              <Select
                onValueChange={(v) => form.setValue("activityTypeId", v)}
                value={form.watch("activityTypeId") ?? ""}
              >
                <SelectTrigger><SelectValue placeholder="Selecteer activiteit" /></SelectTrigger>
                <SelectContent>
                  {filteredActivityTypes.map((a) => (
                    <SelectItem key={a.id} value={a.id}>
                      {a.name}{isAdmin && a.defaultRate ? ` (€${Number(a.defaultRate).toFixed(2)}/u)` : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Datum *</Label>
              <Input type="date" {...form.register("date")} />
            </div>

            <div className="space-y-2">
              <Label>Uren *</Label>
              <Input type="number" step="0.25" min="0.25" placeholder="1.5" {...form.register("hours")} />
              {form.formState.errors.hours && <p className="text-xs text-destructive">{form.formState.errors.hours.message}</p>}
            </div>

            {isAdmin && (
              <div className="space-y-2">
                <Label>
                  Tarief override (€/u)
                  {effectiveRate && <span className="text-muted-foreground font-normal"> · standaard: €{effectiveRate.toFixed(2)}</span>}
                </Label>
                <Input type="number" step="0.01" min="0" placeholder="Optioneel" {...form.register("rateOverride")} />
              </div>
            )}

            {isAdmin && (
              <div className="space-y-2">
                <Label>Factureerbaar</Label>
                <Select onValueChange={(v) => form.setValue("billable", v === "true")} value={form.watch("billable") ? "true" : "false"}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="true">Ja</SelectItem>
                    <SelectItem value="false">Nee</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}

            <div className="space-y-2 sm:col-span-2">
              <Label>Omschrijving</Label>
              <Textarea placeholder="Wat heeft u gedaan?" {...form.register("description")} rows={2} />
            </div>

            <div className="sm:col-span-2 flex gap-2">
              <Button type="submit" disabled={loading}>
                {loading ? (editing ? "Opslaan..." : "Toevoegen...") : (editing ? "Opslaan" : "Toevoegen")}
              </Button>
              {editing && (
                <Button type="button" variant="outline" onClick={() => {
                  setEditing(null);
                  setSelectedCustomerId("");
                  form.reset({ date: selectedDay ?? today, billable: true });
                }}>Annuleren</Button>
              )}
            </div>
          </form>
        </CardContent>
      </Card>

      {/* ── Registrations card ── */}
      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-3">
            {/* Left: title / week nav */}
            <div className="flex items-center gap-1.5">
              {viewMode === "week" ? (
                <>
                  <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => handleWeekNav(weekOffset - 1)}>
                    <ChevronLeft className="h-4 w-4" />
                  </Button>
                  <span className="text-sm font-medium tabular-nums">
                    {format(weekStart, "d MMM")} – {format(weekEnd, "d MMM yyyy")}
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
                    <span className="text-sm text-muted-foreground">{formatHours(totalHours)} uur</span>
                  )}
                </>
              )}
            </div>

            {/* Right: filters + view toggle */}
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
                        <SelectItem key={p.id} value={p.id}>
                          {p.customer ? `${p.customer.name} — ` : ""}{p.name}{p.status === "CONCEPT" ? " (concept)" : ""}
                        </SelectItem>
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

        {/* ── Week view ── */}
        {viewMode === "week" && (
          <CardContent className="p-0">
            {/* Day header */}
            <div className="overflow-x-auto border-b">
              <div className="grid grid-cols-8 min-w-[560px]">
                {weekDays.map((day, i) => {
                  const dayStr = format(day, "yyyy-MM-dd");
                  const isToday = dayStr === today;
                  const isSelected = selectedDay === dayStr;
                  const h = hoursPerDay[i];
                  return (
                    <button
                      key={dayStr}
                      onClick={() => toggleDay(dayStr)}
                      className={cn(
                        "flex flex-col items-start px-3 py-2.5 hover:bg-muted/50 transition-colors text-left",
                        isSelected && "bg-muted/50"
                      )}
                    >
                      <span className={cn(
                        "text-xs font-semibold pb-0.5",
                        isToday ? "border-b-2 border-primary text-primary" : "text-muted-foreground"
                      )}>
                        {DAY_ABBR[i]} {format(day, "d")}
                      </span>
                      <span className={cn("text-sm tabular-nums mt-1", h === 0 ? "text-muted-foreground" : "font-medium")}>
                        {formatHours(h)}
                      </span>
                    </button>
                  );
                })}
                {/* Totaal column */}
                <div className="flex flex-col items-end px-3 py-2.5">
                  <span className="text-xs font-semibold text-muted-foreground pb-0.5">Totaal</span>
                  <span className={cn("text-sm tabular-nums mt-1", weekTotal === 0 ? "text-muted-foreground" : "font-medium")}>
                    {formatHours(weekTotal)}
                  </span>
                </div>
              </div>
            </div>

            {/* Entry list */}
            {fetching ? (
              <div className="py-8 text-center text-sm text-muted-foreground">Laden...</div>
            ) : displayedEntries.length === 0 ? (
              <div className="py-8 text-center text-sm text-muted-foreground">
                {selectedDay ? "Geen registraties op deze dag" : "Geen registraties deze week"}
              </div>
            ) : (
              <div>
                {displayedEntries.map((entry) => (
                  <div
                    key={entry.id}
                    className="flex items-start justify-between px-4 py-3 border-b last:border-b-0 gap-4"
                  >
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium leading-snug">
                        {entry.project?.name}
                        {entry.activityType?.name && (
                          <span className="font-normal"> — {entry.activityType.name}</span>
                        )}
                        <span className="text-muted-foreground font-normal"> ({entry.project?.customer?.name})</span>
                        {entry.description && (
                          <MessageSquare className="inline h-3 w-3 ml-1.5 text-muted-foreground align-middle" />
                        )}
                      </div>
                      {entry.description && (
                        <div className="text-sm text-muted-foreground mt-0.5 truncate">{entry.description}</div>
                      )}
                      <div className="text-xs text-muted-foreground mt-0.5 flex gap-2">
                        {!selectedDay && <span>{formatDate(entry.date)}</span>}
                        {isAdmin && filterUser === "all" && entry.user?.name && (
                          <span className={!selectedDay ? "before:content-['·'] before:mr-2" : ""}>{entry.user.name}</span>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <span className="font-mono text-sm font-medium w-12 text-right">{formatHours(Number(entry.hours))}</span>
                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => startEdit(entry)} disabled={entry.invoiced}>
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => deleteEntry(entry.id)} disabled={entry.invoiced}>
                        <Trash2 className="h-3.5 w-3.5 text-destructive" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        )}

        {/* ── List view ── */}
        {viewMode === "list" && (
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Datum</TableHead>
                  <TableHead>Project</TableHead>
                  <TableHead>Activiteit</TableHead>
                  <TableHead>Omschrijving</TableHead>
                  {isAdmin && filterUser === "all" && <TableHead>Medewerker</TableHead>}
                  <TableHead className="text-right">Uren</TableHead>
                  {isAdmin && <TableHead className="text-right">Tarief</TableHead>}
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {fetching && (
                  <TableRow><TableCell colSpan={isAdmin ? (filterUser === "all" ? 8 : 7) : 6} className="text-center text-muted-foreground py-8">Laden...</TableCell></TableRow>
                )}
                {!fetching && entries.length === 0 && (
                  <TableRow><TableCell colSpan={isAdmin ? (filterUser === "all" ? 8 : 7) : 6} className="text-center text-muted-foreground py-8">Geen registraties gevonden</TableCell></TableRow>
                )}
                {!fetching && entries.map((entry) => (
                  <TableRow key={entry.id}>
                    <TableCell className="whitespace-nowrap">{formatDate(entry.date)}</TableCell>
                    <TableCell>
                      <div className="font-medium">{entry.project?.name}</div>
                      <div className="text-xs text-muted-foreground">{entry.project?.customer?.name}</div>
                    </TableCell>
                    <TableCell>{entry.activityType?.name ?? "—"}</TableCell>
                    <TableCell className="max-w-48 truncate">{entry.description ?? "—"}</TableCell>
                    {isAdmin && filterUser === "all" && (
                      <TableCell className="text-sm">{entry.user?.name ?? "—"}</TableCell>
                    )}
                    <TableCell className="text-right font-mono">{formatHours(Number(entry.hours))}</TableCell>
                    {isAdmin && (
                      <TableCell className="text-right">
                        {entry.rateOverride ? formatCurrency(Number(entry.rateOverride)) : "—"}
                        {!entry.billable && <Badge variant="secondary" className="ml-2 text-xs">Niet</Badge>}
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
        )}
      </Card>

      <Dialog open={newProjectOpen} onOpenChange={setNewProjectOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Nieuw conceptproject</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Naam</Label>
              <Input value={newProjectName} onChange={(e) => setNewProjectName(e.target.value)} />
            </div>
            <div>
              <Label>Activiteiten</Label>
              <div className="space-y-1">
                {activityTypes.map((a) => (
                  <label key={a.id} className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={newProjectActivityIds.includes(a.id)}
                      onChange={(e) =>
                        setNewProjectActivityIds((prev) =>
                          e.target.checked ? [...prev, a.id] : prev.filter((id) => id !== a.id),
                        )
                      }
                    />
                    {a.name}
                  </label>
                ))}
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button onClick={handleCreateConceptProject} disabled={newProjectSaving || !newProjectName.trim()}>
              Aanmaken
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
