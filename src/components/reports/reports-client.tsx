"use client";
import { useState, useMemo } from "react";
import { format, startOfMonth, endOfMonth } from "date-fns";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow, TableFooter } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { formatDate, formatHours, formatCurrency } from "@/lib/utils";
import { Search } from "lucide-react";

interface Props {
  customers: any[];
  projects: any[];
  users: { id: string; name: string; weeklyHours: number | null }[];
  currentUserId: string;
  tags: { id: string; name: string }[];
}

type ReportData = {
  timeEntries: any[];
  kmEntries: any[];
  expenses: any[];
};

type EmployeeSummary = {
  userId: string;
  name: string;
  hours: number;
  km: number;
  expenses: number;
  revenue: number;
  weeklyHours: number | null;
};

export function ReportsClient({ customers, projects, users, tags }: Props) {
  const now = new Date();
  const [from, setFrom] = useState(format(startOfMonth(now), "yyyy-MM-dd"));
  const [to, setTo] = useState(format(endOfMonth(now), "yyyy-MM-dd"));
  const [customerId, setCustomerId] = useState("");
  const [projectId, setProjectId] = useState("");
  const [userId, setUserId] = useState("");
  const [billable, setBillable] = useState("");
  const [selectedTagIds, setSelectedTagIds] = useState<string[]>([]);
  const [groupByEmployee, setGroupByEmployee] = useState(false);
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<ReportData | null>(null);

  const filteredProjects = customerId ? projects.filter((p) => p.customerId === customerId) : projects;

  function toggleTag(id: string) {
    setSelectedTagIds((prev) => prev.includes(id) ? prev.filter((t) => t !== id) : [...prev, id]);
  }

  async function loadReport() {
    setLoading(true);
    const params = new URLSearchParams();
    if (from) params.set("from", from);
    if (to) params.set("to", to);
    if (customerId) params.set("customerId", customerId);
    if (projectId) params.set("projectId", projectId);
    if (userId) params.set("userId", userId);
    if (billable) params.set("billable", billable);
    if (selectedTagIds.length > 0) params.set("tags", selectedTagIds.join(","));

    const res = await fetch(`/api/reports?${params}`);
    if (res.ok) setData(await res.json());
    setLoading(false);
  }

  const totalHours = data?.timeEntries.reduce((s, e) => s + Number(e.hours), 0) ?? 0;
  const totalKm = data?.kmEntries.reduce((s, e) => s + Number(e.km), 0) ?? 0;
  const totalExpenses = data?.expenses.reduce((s, e) => s + Number(e.amount), 0) ?? 0;
  const totalRevenue = data
    ? data.timeEntries.reduce((s, e) => {
        const rate = Number(e.rateOverride ?? e.activityType?.defaultRate ?? e.project?.defaultHourlyRate ?? 0);
        return s + Number(e.hours) * rate;
      }, 0) +
      data.kmEntries.reduce((s, e) => {
        const rate = Number(e.rateOverride ?? e.project?.defaultKmRate ?? 0);
        return s + Number(e.km) * rate;
      }, 0) +
      data.expenses.filter((e) => e.billable).reduce((s, e) => s + Number(e.amount), 0)
    : 0;

  const employeeGroups = useMemo<EmployeeSummary[]>(() => {
    if (!data) return [];
    const map = new Map<string, EmployeeSummary>();
    const userWeeklyHours = new Map(users.map((u) => [u.id, u.weeklyHours]));

    function getOrCreate(userId: string, name: string): EmployeeSummary {
      if (!map.has(userId)) {
        map.set(userId, { userId, name, hours: 0, km: 0, expenses: 0, revenue: 0, weeklyHours: userWeeklyHours.get(userId) ?? null });
      }
      return map.get(userId)!;
    }

    for (const e of data.timeEntries) {
      const entry = getOrCreate(e.user?.id ?? "unknown", e.user?.name ?? "Onbekend");
      const rate = Number(e.rateOverride ?? e.activityType?.defaultRate ?? e.project?.defaultHourlyRate ?? 0);
      entry.hours += Number(e.hours);
      entry.revenue += Number(e.hours) * rate;
    }

    for (const e of data.kmEntries) {
      const entry = getOrCreate(e.user?.id ?? "unknown", e.user?.name ?? "Onbekend");
      const rate = Number(e.rateOverride ?? e.project?.defaultKmRate ?? 0);
      entry.km += Number(e.km);
      entry.revenue += Number(e.km) * rate;
    }

    for (const e of data.expenses) {
      const entry = getOrCreate(e.user?.id ?? "unknown", e.user?.name ?? "Onbekend");
      entry.expenses += Number(e.amount);
      if (e.billable) entry.revenue += Number(e.amount);
    }

    return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name));
  }, [data, users]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Rapporten</h1>
        <p className="text-muted-foreground">Gedetailleerd overzicht met filters</p>
      </div>

      <Card>
        <CardHeader><CardTitle>Filters</CardTitle></CardHeader>
        <CardContent>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <div className="space-y-1">
              <Label>Van</Label>
              <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label>Tot</Label>
              <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label>Klant</Label>
              <Select value={customerId} onValueChange={(v) => { setCustomerId(v === "_all" ? "" : v); setProjectId(""); }}>
                <SelectTrigger><SelectValue placeholder="Alle klanten" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="_all">Alle klanten</SelectItem>
                  {customers.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Project</Label>
              <Select value={projectId} onValueChange={(v) => setProjectId(v === "_all" ? "" : v)}>
                <SelectTrigger><SelectValue placeholder="Alle projecten" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="_all">Alle projecten</SelectItem>
                  {filteredProjects.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Medewerker</Label>
              <Select value={userId} onValueChange={(v) => setUserId(v === "_all" ? "" : v)}>
                <SelectTrigger><SelectValue placeholder="Alle medewerkers" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="_all">Alle medewerkers</SelectItem>
                  {users.map((u) => <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Factureerbaar</Label>
              <Select value={billable} onValueChange={(v) => setBillable(v === "_all" ? "" : v)}>
                <SelectTrigger><SelectValue placeholder="Alles" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="_all">Alles</SelectItem>
                  <SelectItem value="true">Factureerbaar</SelectItem>
                  <SelectItem value="false">Niet factureerbaar</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {tags.length > 0 && (
            <div className="mt-4 space-y-1">
              <Label>Tags</Label>
              <div className="flex flex-wrap gap-2 mt-1">
                {tags.map((tag) => (
                  <Badge
                    key={tag.id}
                    variant={selectedTagIds.includes(tag.id) ? "default" : "outline"}
                    className="cursor-pointer select-none"
                    onClick={() => toggleTag(tag.id)}
                  >
                    {tag.name}
                  </Badge>
                ))}
              </div>
            </div>
          )}

          <div className="mt-4 flex items-center gap-2">
            <input
              type="checkbox"
              id="group-by-employee"
              checked={groupByEmployee}
              onChange={(e) => setGroupByEmployee(e.target.checked)}
              className="h-4 w-4 rounded border-input accent-primary"
            />
            <Label htmlFor="group-by-employee">Groepeer per medewerker</Label>
          </div>

          <Button className="mt-4" onClick={loadReport} disabled={loading}>
            <Search className="h-4 w-4 mr-2" />
            {loading ? "Laden..." : "Rapport ophalen"}
          </Button>
        </CardContent>
      </Card>

      {data && (
        <>
          <div className="grid gap-4 sm:grid-cols-4">
            <Card>
              <CardContent className="pt-6">
                <div className="text-2xl font-bold">{formatHours(totalHours)}</div>
                <p className="text-sm text-muted-foreground">Totaal uren</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <div className="text-2xl font-bold">{totalKm.toFixed(1)} km</div>
                <p className="text-sm text-muted-foreground">Totaal kilometers</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <div className="text-2xl font-bold">{formatCurrency(totalExpenses)}</div>
                <p className="text-sm text-muted-foreground">Totaal uitgaven</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <div className="text-2xl font-bold">{formatCurrency(totalRevenue)}</div>
                <p className="text-sm text-muted-foreground">Totaal omzet (excl. BTW)</p>
              </CardContent>
            </Card>
          </div>

          {groupByEmployee ? (
            <Card>
              <CardHeader><CardTitle>Per medewerker</CardTitle></CardHeader>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Medewerker</TableHead>
                      <TableHead className="text-right">Uren</TableHead>
                      <TableHead className="text-right">Extra uren</TableHead>
                      <TableHead className="text-right">Km</TableHead>
                      <TableHead className="text-right">Uitgaven</TableHead>
                      <TableHead className="text-right">Omzet</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {employeeGroups.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                          Geen registraties gevonden voor de geselecteerde filters
                        </TableCell>
                      </TableRow>
                    )}
                    {employeeGroups.map((emp) => {
                      const days = from && to
                        ? Math.round((new Date(to).getTime() - new Date(from).getTime()) / 86_400_000) + 1
                        : 7;
                      const targetHours = emp.weeklyHours != null ? emp.weeklyHours * (days / 7) : null;
                      const extraHours = targetHours != null ? Math.max(0, emp.hours - targetHours) : null;

                      return (
                        <TableRow key={emp.userId}>
                          <TableCell className="font-medium">{emp.name}</TableCell>
                          <TableCell className="text-right font-mono">{formatHours(emp.hours)}</TableCell>
                          <TableCell className="text-right font-mono">
                            {extraHours != null && extraHours > 0
                              ? <span className="text-amber-600 font-medium">+{formatHours(extraHours)}</span>
                              : <span className="text-muted-foreground">—</span>}
                          </TableCell>
                          <TableCell className="text-right font-mono">{emp.km.toFixed(1)} km</TableCell>
                          <TableCell className="text-right">{formatCurrency(emp.expenses)}</TableCell>
                          <TableCell className="text-right">{formatCurrency(emp.revenue)}</TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                  {employeeGroups.length > 0 && (
                    <TableFooter>
                      <TableRow>
                        <TableCell className="font-medium">Totaal</TableCell>
                        <TableCell className="text-right font-mono font-medium">{formatHours(totalHours)}</TableCell>
                        <TableCell />
                        <TableCell className="text-right font-mono font-medium">{totalKm.toFixed(1)} km</TableCell>
                        <TableCell className="text-right font-medium">{formatCurrency(totalExpenses)}</TableCell>
                        <TableCell className="text-right font-medium">{formatCurrency(totalRevenue)}</TableCell>
                      </TableRow>
                    </TableFooter>
                  )}
                </Table>
              </CardContent>
            </Card>
          ) : (
            <>
              {data.timeEntries.length > 0 && (
                <Card>
                  <CardHeader><CardTitle>Uren ({data.timeEntries.length})</CardTitle></CardHeader>
                  <CardContent className="p-0">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Datum</TableHead>
                          <TableHead>Medewerker</TableHead>
                          <TableHead>Klant / Project</TableHead>
                          <TableHead>Activiteit</TableHead>
                          <TableHead>Omschrijving</TableHead>
                          <TableHead className="text-right">Uren</TableHead>
                          <TableHead className="text-right">Tarief</TableHead>
                          <TableHead className="text-right">Bedrag</TableHead>
                          <TableHead></TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {data.timeEntries.map((e) => {
                          const rate = Number(e.rateOverride ?? e.activityType?.defaultRate ?? 0);
                          const amount = Number(e.hours) * rate;
                          return (
                            <TableRow key={e.id}>
                              <TableCell className="whitespace-nowrap">{formatDate(e.date)}</TableCell>
                              <TableCell>{e.user?.name}</TableCell>
                              <TableCell>
                                <div>{e.project?.customer?.name}</div>
                                <div className="text-xs text-muted-foreground">{e.project?.name}</div>
                              </TableCell>
                              <TableCell>{e.activityType?.name ?? "—"}</TableCell>
                              <TableCell className="max-w-32 truncate">{e.description ?? "—"}</TableCell>
                              <TableCell className="text-right font-mono">{formatHours(Number(e.hours))}</TableCell>
                              <TableCell className="text-right">{rate ? formatCurrency(rate) : "—"}</TableCell>
                              <TableCell className="text-right">{amount ? formatCurrency(amount) : "—"}</TableCell>
                              <TableCell>
                                {e.invoiced && <Badge variant="success" className="text-xs">Gefactureerd</Badge>}
                                {!e.billable && <Badge variant="secondary" className="text-xs">Niet</Badge>}
                              </TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                      <TableFooter>
                        <TableRow>
                          <TableCell colSpan={5} className="font-medium">Totaal</TableCell>
                          <TableCell className="text-right font-mono font-medium">{formatHours(totalHours)}</TableCell>
                          <TableCell />
                          <TableCell className="text-right font-medium">
                            {formatCurrency(data.timeEntries.reduce((s, e) => {
                              const rate = Number(e.rateOverride ?? e.activityType?.defaultRate ?? e.project?.defaultHourlyRate ?? 0);
                              return s + Number(e.hours) * rate;
                            }, 0))}
                          </TableCell>
                          <TableCell />
                        </TableRow>
                      </TableFooter>
                    </Table>
                  </CardContent>
                </Card>
              )}

              {data.kmEntries.length > 0 && (
                <Card>
                  <CardHeader><CardTitle>Kilometers ({data.kmEntries.length})</CardTitle></CardHeader>
                  <CardContent className="p-0">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Datum</TableHead>
                          <TableHead>Medewerker</TableHead>
                          <TableHead>Klant / Project</TableHead>
                          <TableHead>Omschrijving</TableHead>
                          <TableHead className="text-right">Km</TableHead>
                          <TableHead className="text-right">Tarief</TableHead>
                          <TableHead className="text-right">Bedrag</TableHead>
                          <TableHead></TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {data.kmEntries.map((e) => {
                          const rate = Number(e.rateOverride ?? e.project?.defaultKmRate ?? 0);
                          const amount = Number(e.km) * rate;
                          return (
                            <TableRow key={e.id}>
                              <TableCell className="whitespace-nowrap">{formatDate(e.date)}</TableCell>
                              <TableCell>{e.user?.name}</TableCell>
                              <TableCell>
                                <div>{e.project?.customer?.name}</div>
                                <div className="text-xs text-muted-foreground">{e.project?.name}</div>
                              </TableCell>
                              <TableCell className="max-w-32 truncate">{e.description ?? "—"}</TableCell>
                              <TableCell className="text-right font-mono">{Number(e.km).toFixed(1)}</TableCell>
                              <TableCell className="text-right">{rate ? `€${rate.toFixed(2)}/km` : "—"}</TableCell>
                              <TableCell className="text-right">{amount ? formatCurrency(amount) : "—"}</TableCell>
                              <TableCell>
                                {e.invoiced && <Badge variant="success" className="text-xs">Gefactureerd</Badge>}
                              </TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  </CardContent>
                </Card>
              )}

              {data.expenses.length > 0 && (
                <Card>
                  <CardHeader><CardTitle>Uitgaven ({data.expenses.length})</CardTitle></CardHeader>
                  <CardContent className="p-0">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Datum</TableHead>
                          <TableHead>Medewerker</TableHead>
                          <TableHead>Klant / Project</TableHead>
                          <TableHead>Categorie</TableHead>
                          <TableHead>Omschrijving</TableHead>
                          <TableHead className="text-right">Bedrag</TableHead>
                          <TableHead></TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {data.expenses.map((e) => (
                          <TableRow key={e.id}>
                            <TableCell className="whitespace-nowrap">{formatDate(e.date)}</TableCell>
                            <TableCell>{e.user?.name}</TableCell>
                            <TableCell>
                              {e.project ? (
                                <>
                                  <div>{e.project?.customer?.name}</div>
                                  <div className="text-xs text-muted-foreground">{e.project?.name}</div>
                                </>
                              ) : "—"}
                            </TableCell>
                            <TableCell>{e.category?.name}</TableCell>
                            <TableCell className="max-w-32 truncate">{e.description ?? "—"}</TableCell>
                            <TableCell className="text-right font-mono">{formatCurrency(Number(e.amount))}</TableCell>
                            <TableCell>
                              {e.invoiced && <Badge variant="success" className="text-xs">Gefactureerd</Badge>}
                              {!e.billable && <Badge variant="secondary" className="text-xs">Niet</Badge>}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                      <TableFooter>
                        <TableRow>
                          <TableCell colSpan={5} className="font-medium">Totaal</TableCell>
                          <TableCell className="text-right font-medium">{formatCurrency(totalExpenses)}</TableCell>
                          <TableCell />
                        </TableRow>
                      </TableFooter>
                    </Table>
                  </CardContent>
                </Card>
              )}

              {data.timeEntries.length === 0 && data.kmEntries.length === 0 && data.expenses.length === 0 && (
                <Card>
                  <CardContent className="py-12 text-center text-muted-foreground">
                    Geen registraties gevonden voor de geselecteerde filters
                  </CardContent>
                </Card>
              )}
            </>
          )}
        </>
      )}
    </div>
  );
}
