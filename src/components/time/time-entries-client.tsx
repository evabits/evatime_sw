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
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { WeekGrid } from "@/components/shared/week-grid";
import { formatDate, formatHours, formatCurrency } from "@/lib/utils";
import { partitionProjectsByCustomer, isProjectOffered } from "@/lib/projects";
import { resolveHourRate } from "@/lib/rates";
import { isBillable } from "@/lib/billable";
import type { WorkLevel } from "@/lib/work-levels";
import { scheduledHoursOn, type WeekSchedule } from "@/lib/work-schedule";
import { Pencil, Trash2, CalendarDays, List, ChevronLeft, ChevronRight, MessageSquare } from "lucide-react";
import { hoursBetween, toQuarter, normalizeTime, TIME_CHOICES, HOUR_CHOICES } from "@/lib/quarter-hours";
import { perDayTotals } from "@/lib/per-day-totals";

const VERLOF_UITLEG = "Verlofregels wijzig je via de afwezigheidsaanvraag";

const schema = z.object({
  projectId: z.string().min(1, "Verplicht"),
  date: z.string().min(1, "Verplicht"),
  // Afronden hoort bij het valideren en niet alleen bij het verlaten van het
  // veld: met Enter opslaan slaat die onBlur over, en dan zou er alsnog een
  // kwartiermelding komen voor iets wat het scherm zelf oplost. Eerst afronden,
  // dan pas op positief controleren — 0,1 wordt 0 en hoort een melding te geven
  // in plaats van als nul weggeschreven te worden.
  hours: z.coerce.number().transform(toQuarter).refine((h) => h > 0, "Moet positief zijn"),
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
  userId: string;
  role: string;
  currentUserLevel: WorkLevel | null;
  workSchedule: WeekSchedule | null;
}

export function TimeEntriesClient({ projects: projectsProp, customers, users, initialEntries, userId, role, currentUserLevel, workSchedule }: Props) {
  const isAdmin = role === "ADMIN";

  const [projects, setProjects] = useState(projectsProp);
  const [entries, setEntries] = useState(initialEntries);
  const [editing, setEditing] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [filterMonth, setFilterMonth] = useState(currentMonth());
  const [filterProject, setFilterProject] = useState("all");
  const [fetching, setFetching] = useState(false);
  const [selectedCustomerId, setSelectedCustomerId] = useState<string>("");

  const [newProjectOpen, setNewProjectOpen] = useState(false);
  const [newProjectName, setNewProjectName] = useState("");
  const [newProjectSaving, setNewProjectSaving] = useState(false);

  const [filterUser, setFilterUser] = useState("all");

  const filtersKey = `time-filters:${userId}`;

  // Hydrate saved filters once on mount, then re-fetch to match (client-only; avoids SSR mismatch).
  useEffect(() => {
    let savedUser: string | undefined;
    let savedProject: string | undefined;
    try {
      const raw = localStorage.getItem(filtersKey);
      if (raw) {
        const saved = JSON.parse(raw) as { filterUser?: string; filterProject?: string };
        savedUser = saved.filterUser;
        savedProject = saved.filterProject;
      }
    } catch {
      /* ignore malformed storage */
    }
    if (savedUser) setFilterUser(savedUser);
    if (savedProject) setFilterProject(savedProject);
    // initialEntries were fetched with the default "all" filters; re-fetch if we restored anything.
    if (savedUser || savedProject) {
      if (viewMode === "week") fetchWeekEntries(weekOffset, savedUser ?? "all");
      else fetchEntries(filterMonth, savedProject ?? "all", savedUser ?? "all");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Persist on change.
  useEffect(() => {
    try {
      localStorage.setItem(filtersKey, JSON.stringify({ filterUser, filterProject }));
    } catch {
      /* ignore quota/private-mode errors */
    }
  }, [filtersKey, filterUser, filterProject]);

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

  const hoursPerDay = perDayTotals(
    weekEntries.map((e) => ({ date: e.date, value: Number(e.hours) })),
    weekDays.map((day) => format(day, "yyyy-MM-dd")),
  );

  const displayedEntries = viewMode === "week"
    ? (selectedDay ? weekEntries.filter((e) => format(new Date(e.date), "yyyy-MM-dd") === selectedDay) : weekEntries)
    : entries;

  const form = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: { date: today, userId },
  });

  // Van-tot is invoerhulp en geen veld: het wordt niet meegestuurd en niet
  // opgeslagen. Daarom losse toestand naast het formulier in plaats van in het
  // zod-schema.
  const [vanTijd, setVanTijd] = useState("");
  const [totTijd, setTotTijd] = useState("");
  const [pauze, setPauze] = useState("");

  // Eén plek om alle drie leeg te maken. Er zijn vijf plaatsen die het
  // formulier resetten, en een pauze die daar vergeten wordt gaat er bij de
  // volgende regel een tweede keer af zonder dat iets klaagt.
  function leegTijdvak() {
    setVanTijd("");
    setTotTijd("");
    setPauze("");
  }

  const pauzeMinuten = pauze === "" ? 0 : Number(pauze);
  // Bruto ernaast, zodat een te lange pauze te onderscheiden is van een
  // omgekeerd tijdvak: anders zou de gebruiker bij een fout in de pauze een
  // melding over zijn eindtijd krijgen.
  const bruto = hoursBetween(vanTijd, totTijd);
  const tijdvak = hoursBetween(vanTijd, totTijd, pauzeMinuten);
  // Tijdens het typen niet klagen. Een tekstveld ziet halve invoer — na de "9"
  // van "9:00" is er nog geen geldig tijdstip — en bij type="time" kon dat niet
  // gebeuren, want dat veld gaf een halve waarde als leeg door. Zonder deze
  // vlag knippert de melding bij elke aanslag.
  const [tijdBezig, setTijdBezig] = useState(false);
  const tijdvakFout = !tijdBezig && vanTijd !== "" && totTijd !== "" && bruto === null;
  const pauzeTeLang = bruto !== null && tijdvak === null;
  // Een pauze hoeft geen kwartier te zijn: het uitgerekende aantal uren wordt
  // toch afgerond. Negatief blijft wél fout — dat zou uren bíjtellen. min={0}
  // vangt dat in de browser pas bij het versturen af, en dit veld wordt niet
  // verstuurd, dus een getypte -30 komt er gewoon doorheen.
  const pauzeNegatief = pauzeMinuten < 0;

  useEffect(() => {
    if (tijdvak === null) return;
    // Afronden op het scherm en niet op de server: het uren-veld toont meteen
    // wat er opgeslagen wordt. Van 9:00 tot 17:07 staat er dus 8, terwijl de
    // eindtijd 17:07 blijft — die tijd is wat er werkelijk gewerkt is.
    form.setValue("hours", toQuarter(tijdvak), { shouldValidate: true });
  }, [tijdvak, form]);

  const selectedProjectId = form.watch("projectId");
  const selectedProject = projects.find((p) => p.id === selectedProjectId);

  // `projects` also feeds the registration-list filter further down, which must
  // keep showing every project (an admin may want to filter on a project they
  // don't book on themselves). Only the entry form's picker narrows to what the
  // selected employee may actually book on.
  const targetUserId = form.watch("userId") || userId;
  const bookableProjects = isAdmin
    ? projects.filter((p: any) => (p.members ?? []).some((m: any) => m.userId === targetUserId))
    : projects;

  const { matched: matchedProjects, customerless: customerlessProjects } =
    partitionProjectsByCustomer(bookableProjects, selectedCustomerId);

  // Een project loslaten zodra het niet meer in de keuzelijst staat, en alleen
  // dán. Hier stond "de klant is veranderd", en dat is te grof: startEdit vult
  // de klant en het project van de te bewerken regel samen in, waarna dit
  // effect het project meteen weer wiste. Je moest het dus elke keer opnieuw
  // kiezen — behalve als je toevallig twee regels van dezelfde klant achter
  // elkaar bewerkte, want dan veranderde de klant niet.
  useEffect(() => {
    const huidig = form.getValues("projectId");
    if (huidig && !isProjectOffered(bookableProjects, selectedCustomerId, huidig)) {
      form.setValue("projectId", "");
    }
  }, [selectedCustomerId]); // eslint-disable-line react-hooks/exhaustive-deps

  // When a day is selected in week view, pre-fill the form date
  useEffect(() => {
    if (viewMode === "week" && selectedDay) {
      form.setValue("date", selectedDay);
    }
  }, [selectedDay]); // eslint-disable-line react-hooks/exhaustive-deps

  function getEffectiveRate(): number | null {
    if (!selectedProject) return null;
    const targetUserId = form.watch("userId") || userId;
    const level =
      users.find((u: any) => u.id === targetUserId)?.workLevel ?? currentUserLevel ?? null;
    return resolveHourRate({
      workLevel: level,
      project: {
        levelRates: selectedProject.levelRates,
        customer: selectedProject.customer,
      },
    });
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

  async function handleUserChange(uid: string) {
    setFilterUser(uid);
    if (viewMode === "week") await fetchWeekEntries(weekOffset, uid);
    else await fetchEntries(filterMonth, filterProject, uid);
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
        { id: created.id, name: created.name, description: created.description ?? null, status: "CONCEPT", levelRates: [], customer: null, members: created.members },
      ]);
      form.setValue("projectId", created.id);
      setNewProjectOpen(false);
      setNewProjectName("");
    } finally {
      setNewProjectSaving(false);
    }
  }

  async function onSubmit(data: FormData) {
    setLoading(true);
    setSubmitError(null);
    const payload = {
      ...data,
      rateOverride: data.rateOverride === "" ? null : data.rateOverride || null,
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
          form.reset({ date: selectedDay ?? today, userId });
          // Net als bij Annuleren en bij het toevoegen: het formulier is hierna
          // weer een leeg toevoegformulier, dus de klant hoort ook leeg.
          setSelectedCustomerId("");
          leegTijdvak();
          if (viewMode === "week") await fetchWeekEntries(weekOffset);
          else {
            const updated = await res.json();
            setEntries((prev) => prev.map((e) => (e.id === editing ? { ...e, ...updated } : e)));
          }
        } else {
          const body = await res.json().catch(() => ({}));
          setSubmitError(body.issues ? "Controleer de ingevulde velden." : (body.error ?? "Opslaan mislukt"));
        }
      } else {
        const res = await fetch("/api/time", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        if (res.ok) {
          const targetUser = data.userId ?? userId;
          const switchedFilter =
            isAdmin && targetUser !== userId && filterUser !== "all" && filterUser !== targetUser;
          // Datum en medewerker blijven staan: je boekt meestal meerdere
          // regels op dezelfde dag voor dezelfde persoon. De rest gaat leeg —
          // form.reset wist alles wat hier niet genoemd wordt, en de klant
          // staat naast het formulier en moet dus apart.
          form.reset({ date: data.date, userId: data.userId ?? userId });
          setSelectedCustomerId("");
          leegTijdvak();
          if (switchedFilter) {
            await handleUserChange(targetUser);
          } else if (viewMode === "week") {
            await fetchWeekEntries(weekOffset);
          } else {
            const created = await res.json();
            const { from, to } = monthBounds(filterMonth);
            const entryDate = data.date;
            if (entryDate >= from && entryDate <= to && (filterProject === "all" || data.projectId === filterProject)) {
              setEntries((prev) => [created, ...prev]);
            }
          }
        } else {
          const body = await res.json().catch(() => ({}));
          setSubmitError(body.issues ? "Controleer de ingevulde velden." : (body.error ?? "Opslaan mislukt"));
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
    setSubmitError(null);
    // De tijden zijn niet opgeslagen, dus bij het bewerken van een bestaande
    // regel is er niets om te tonen. Leeg laten is eerlijker dan gokken.
    leegTijdvak();
    setSelectedCustomerId(entry.project?.customer?.id ?? "");
    form.reset({
      projectId: entry.projectId,
      date: format(new Date(entry.date), "yyyy-MM-dd"),
      hours: Number(entry.hours),
      description: entry.description ?? "",
      rateOverride: entry.rateOverride ? Number(entry.rateOverride) : undefined,
      userId: entry.userId,
    });
  }

  const effectiveRate = getEffectiveRate();
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

            <div className="space-y-2">
              <Label>Project *</Label>
              <div className="flex gap-2">
                <Select onValueChange={(v) => form.setValue("projectId", v)} value={form.watch("projectId") ?? ""}>
                  <SelectTrigger><SelectValue placeholder="Selecteer project" /></SelectTrigger>
                  <SelectContent>
                    {/* title is de omschrijving van het project: een native
                        tooltip bij het over-hoveren. Geen tooltipcomponent
                        nodig, en hij werkt ook binnen de portal waar Radix
                        deze lijst in rendert. */}
                    {matchedProjects.map((p) => (
                      <SelectItem key={p.id} value={p.id} title={p.description || undefined}>
                        {p.customer ? `${p.customer.name} — ` : ""}{p.name}{p.status === "CONCEPT" ? " (concept)" : ""}
                      </SelectItem>
                    ))}
                    {customerlessProjects.length > 0 && (
                      <SelectGroup>
                        <SelectLabel>Zonder klant</SelectLabel>
                        {customerlessProjects.map((p) => (
                          <SelectItem key={p.id} value={p.id} title={p.description || undefined}>
                            {p.name}{p.status === "CONCEPT" ? " (concept)" : ""}
                          </SelectItem>
                        ))}
                      </SelectGroup>
                    )}
                  </SelectContent>
                </Select>
                <Button type="button" variant="outline" size="sm" onClick={() => setNewProjectOpen(true)}>
                  + Nieuw project
                </Button>
              </div>
              {form.formState.errors.projectId && <p className="text-xs text-destructive">{form.formState.errors.projectId.message}</p>}
            </div>

            <div className="space-y-2">
              <Label>Datum *</Label>
              <Input type="date" {...form.register("date")} />
            </div>

            <div className="space-y-2">
              <Label>Van — tot</Label>
              <div className="flex items-center gap-2">
                {/* Geen type="time": dat rendert volgens de taal van de browser
                    en toont dan AM/PM, ongeacht wat de pagina zegt. Een
                    tekstveld met een datalist staat altijd op HH:MM en levert
                    de keuzelijst meteen op. normalizeTime maakt van een getypte
                    9:00 een 09:00, want typen is hier de gewone weg. */}
                <Input
                  type="text"
                  inputMode="numeric"
                  placeholder="09:00"
                  list="tijdstippen"
                  value={vanTijd}
                  onChange={(e) => setVanTijd(e.target.value)}
                  onFocus={() => setTijdBezig(true)}
                  onBlur={(e) => {
                    setVanTijd(normalizeTime(e.target.value));
                    setTijdBezig(false);
                  }}
                  className="w-32"
                />
                <span className="text-muted-foreground">—</span>
                <Input
                  type="text"
                  inputMode="numeric"
                  placeholder="17:00"
                  list="tijdstippen"
                  value={totTijd}
                  onChange={(e) => setTotTijd(e.target.value)}
                  onFocus={() => setTijdBezig(true)}
                  onBlur={(e) => {
                    setTotTijd(normalizeTime(e.target.value));
                    setTijdBezig(false);
                  }}
                  className="w-32"
                />
                <datalist id="tijdstippen">
                  {TIME_CHOICES.map((t) => <option key={t} value={t} />)}
                </datalist>
                <Input
                  type="number"
                  step={15}
                  min={0}
                  placeholder="Pauze (min)"
                  value={pauze}
                  onChange={(e) => setPauze(e.target.value)}
                  className="w-32"
                />
              </div>
              {tijdvakFout ? (
                <p className="text-xs text-destructive">De eindtijd moet ná de begintijd liggen</p>
              ) : pauzeNegatief ? (
                <p className="text-xs text-destructive">De pauze kan niet negatief zijn</p>
              ) : pauzeTeLang ? (
                <p className="text-xs text-destructive">De pauze is even lang als of langer dan het tijdvak</p>
              ) : (
                <p className="text-xs text-muted-foreground">Optioneel — vult het aantal uren voor u in, pauze eraf, afgerond op kwartieren</p>
              )}
            </div>

            <div className="space-y-2">
              <Label>Uren *</Label>
              {/* Afronden bij het verlaten van het veld en niet bij het opslaan:
                  zo staat er wat er opgeslagen wordt. Zou het pas bij versturen
                  gebeuren, dan verstuur je een getal en krijg je een ander
                  terug. */}
              <Input
                type="number"
                step="0.25"
                min="0.25"
                placeholder="1.5"
                list="urenkeuzes"
                {...form.register("hours", {
                  onBlur: (e) => {
                    const waarde = Number(e.target.value);
                    if (e.target.value === "" || Number.isNaN(waarde)) return;
                    form.setValue("hours", toQuarter(waarde), { shouldValidate: true });
                  },
                })}
              />
              <datalist id="urenkeuzes">
                {HOUR_CHOICES.map((u) => <option key={u} value={u} />)}
              </datalist>
              {form.formState.errors.hours && <p className="text-xs text-destructive">{form.formState.errors.hours.message}</p>}
            </div>

            {isAdmin && (
              <div className="space-y-2">
                <Label>
                  Tarief override (€/u)
                  {selectedProject && (effectiveRate == null
                    ? <span className="text-muted-foreground font-normal"> · geen tarief voor dit niveau</span>
                    : <span className="text-muted-foreground font-normal"> · standaard: €{effectiveRate.toFixed(2)}</span>)}
                </Label>
                <Input type="number" step="0.01" min="0" placeholder="Optioneel" {...form.register("rateOverride")} />
              </div>
            )}

            <div className="space-y-2 sm:col-span-2">
              <Label>Omschrijving</Label>
              <Textarea placeholder="Wat heeft u gedaan?" {...form.register("description")} rows={2} />
            </div>

            {submitError && (
              <p className="text-xs text-destructive sm:col-span-2">{submitError}</p>
            )}

            <div className="sm:col-span-2 flex gap-2">
              <Button type="submit" disabled={loading}>
                {loading ? (editing ? "Opslaan..." : "Toevoegen...") : (editing ? "Opslaan" : "Toevoegen")}
              </Button>
              {editing && (
                <Button type="button" variant="outline" onClick={() => {
                  setEditing(null);
                  setSelectedCustomerId("");
                  form.reset({ date: selectedDay ?? today, userId });
                  leegTijdvak();
                  setSubmitError(null);
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
            <WeekGrid
              days={weekDays}
              values={hoursPerDay}
              today={today}
              selectedDay={selectedDay}
              onSelect={toggleDay}
              formatValue={formatHours}
              // Alleen markeren als er ook niets geboekt is: boekte je toch uren
              // op je vrije dag, dan is dát de informatie die telt. En alleen
              // wanneer het raster ook echt eigen uren toont (niet andermans,
              // gefilterd of niet) en op een werkdag — het weekend heeft geen
              // vaste vrije dag, dat is gewoon niemands werkdag.
              noteFor={(dayStr, i, h) => {
                const eigenRooster = !isAdmin || filterUser === userId;
                const vrijeDag =
                  eigenRooster &&
                  i < 5 &&
                  workSchedule !== null &&
                  scheduledHoursOn(workSchedule, dayStr) === 0 &&
                  h === 0;
                return vrijeDag ? "vrij" : null;
              }}
            />

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
                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => startEdit(entry)} disabled={entry.invoiced || Boolean(entry.absenceRequestId)} title={entry.absenceRequestId ? VERLOF_UITLEG : undefined}>
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => deleteEntry(entry.id)} disabled={entry.invoiced || Boolean(entry.absenceRequestId)} title={entry.absenceRequestId ? VERLOF_UITLEG : undefined}>
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
                  <TableHead>Omschrijving</TableHead>
                  {isAdmin && filterUser === "all" && <TableHead>Medewerker</TableHead>}
                  <TableHead className="text-right">Uren</TableHead>
                  {isAdmin && <TableHead className="text-right">Tarief</TableHead>}
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {fetching && (
                  <TableRow><TableCell colSpan={isAdmin ? (filterUser === "all" ? 7 : 6) : 5} className="text-center text-muted-foreground py-8">Laden...</TableCell></TableRow>
                )}
                {!fetching && entries.length === 0 && (
                  <TableRow><TableCell colSpan={isAdmin ? (filterUser === "all" ? 7 : 6) : 5} className="text-center text-muted-foreground py-8">Geen registraties gevonden</TableCell></TableRow>
                )}
                {!fetching && entries.map((entry) => (
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
                    <TableCell className="text-right font-mono">{formatHours(Number(entry.hours))}</TableCell>
                    {isAdmin && (
                      <TableCell className="text-right">
                        {entry.rateOverride ? formatCurrency(Number(entry.rateOverride)) : "—"}
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
                        <Button variant="ghost" size="icon" onClick={() => startEdit(entry)} disabled={entry.invoiced || Boolean(entry.absenceRequestId)} title={entry.absenceRequestId ? VERLOF_UITLEG : undefined}>
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        <Button variant="ghost" size="icon" onClick={() => deleteEntry(entry.id)} disabled={entry.invoiced || Boolean(entry.absenceRequestId)} title={entry.absenceRequestId ? VERLOF_UITLEG : undefined}>
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
