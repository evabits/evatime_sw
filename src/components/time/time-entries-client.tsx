"use client";
import { useState, useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { format } from "date-fns";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { formatDate, formatHours, formatCurrency } from "@/lib/utils";
import { Pencil, Trash2 } from "lucide-react";

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
  initialEntries: any[];
  userId: string;
  role: string;
}

export function TimeEntriesClient({ projects, activityTypes, customers, initialEntries, role }: Props) {
  const isAdmin = role === "ADMIN";

  const [entries, setEntries] = useState(initialEntries);
  const [editing, setEditing] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [filterMonth, setFilterMonth] = useState(currentMonth());
  const [filterProject, setFilterProject] = useState("all");
  const [fetching, setFetching] = useState(false);
  const [selectedCustomerId, setSelectedCustomerId] = useState<string>("");

  const form = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: { date: format(new Date(), "yyyy-MM-dd"), billable: true },
  });

  const selectedProjectId = form.watch("projectId");
  const selectedProject = projects.find((p) => p.id === selectedProjectId);
  const activityTypeId = form.watch("activityTypeId");

  // Filter projects by selected customer
  const filteredProjects = selectedCustomerId === ""
    ? projects
    : projects.filter((p) => p.customer.id === selectedCustomerId);

  // Filter activity types to those relevant for the selected project
  const filteredActivityTypes = activityTypes.filter((a) => {
    if (a.showInAllProjects) return true;
    if (!selectedProjectId) return false;
    return a.projects.some((p: any) => p.projectId === selectedProjectId);
  });

  // Derive billable from selected activity for non-admins
  useEffect(() => {
    if (!isAdmin) {
      const act = activityTypes.find((a) => a.id === activityTypeId);
      form.setValue("billable", act?.billable ?? true);
    }
  }, [activityTypeId, isAdmin]); // eslint-disable-line react-hooks/exhaustive-deps

  // Clear projectId when customer filter resets available projects
  useEffect(() => {
    form.setValue("projectId", "");
    form.setValue("activityTypeId", undefined);
  }, [selectedCustomerId]); // eslint-disable-line react-hooks/exhaustive-deps

  function getEffectiveRate(atId?: string): number | null {
    if (!selectedProject) return null;
    const override = selectedProject.activityRates?.find((r: any) => r.activityTypeId === atId);
    if (override) return Number(override.rate);
    const actType = activityTypes.find((a: any) => a.id === atId);
    if (actType?.defaultRate) return Number(actType.defaultRate);
    return selectedProject.defaultHourlyRate ? Number(selectedProject.defaultHourlyRate) : null;
  }

  async function fetchEntries(month: string, projectId: string) {
    setFetching(true);
    const { from, to } = monthBounds(month);
    const params = new URLSearchParams({ from, to });
    if (projectId !== "all") params.set("projectId", projectId);
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
          const updated = await res.json();
          setEntries((prev) => prev.map((e) => (e.id === editing ? { ...e, ...updated } : e)));
          setEditing(null);
          form.reset({ date: format(new Date(), "yyyy-MM-dd"), billable: true });
        }
      } else {
        const res = await fetch("/api/time", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        if (res.ok) {
          const created = await res.json();
          const { from, to } = monthBounds(filterMonth);
          const entryDate = data.date;
          if (entryDate >= from && entryDate <= to && (filterProject === "all" || data.projectId === filterProject)) {
            setEntries((prev) => [created, ...prev]);
          }
          form.reset({ date: format(new Date(), "yyyy-MM-dd"), billable: true });
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
              <Select onValueChange={(v) => form.setValue("projectId", v)} value={form.watch("projectId") ?? ""}>
                <SelectTrigger><SelectValue placeholder="Selecteer project" /></SelectTrigger>
                <SelectContent>
                  {filteredProjects.map((p) => (
                    <SelectItem key={p.id} value={p.id}>{p.customer.name} — {p.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
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
              <Button type="submit" disabled={loading}>{loading ? (editing ? "Opslaan..." : "Toevoegen...") : (editing ? "Opslaan" : "Toevoegen")}</Button>
              {editing && (
                <Button type="button" variant="outline" onClick={() => {
                  setEditing(null);
                  setSelectedCustomerId("");
                  form.reset({ date: format(new Date(), "yyyy-MM-dd"), billable: true });
                }}>Annuleren</Button>
              )}
            </div>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <CardTitle>Registraties</CardTitle>
              {entries.length > 0 && (
                <span className="text-sm text-muted-foreground">{formatHours(totalHours)} uur</span>
              )}
            </div>
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
                    <SelectItem key={p.id} value={p.id}>{p.customer.name} — {p.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Datum</TableHead>
                <TableHead>Project</TableHead>
                <TableHead>Activiteit</TableHead>
                <TableHead>Omschrijving</TableHead>
                <TableHead className="text-right">Uren</TableHead>
                {isAdmin && <TableHead className="text-right">Tarief</TableHead>}
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {fetching && (
                <TableRow><TableCell colSpan={isAdmin ? 7 : 6} className="text-center text-muted-foreground py-8">Laden...</TableCell></TableRow>
              )}
              {!fetching && entries.length === 0 && (
                <TableRow><TableCell colSpan={isAdmin ? 7 : 6} className="text-center text-muted-foreground py-8">Geen registraties gevonden</TableCell></TableRow>
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
      </Card>
    </div>
  );
}
