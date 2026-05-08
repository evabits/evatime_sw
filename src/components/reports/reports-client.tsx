"use client";
import { useState } from "react";
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
  users: any[];
  currentUserId: string;
}

export function ReportsClient({ customers, projects, users }: Props) {
  const now = new Date();
  const [from, setFrom] = useState(format(startOfMonth(now), "yyyy-MM-dd"));
  const [to, setTo] = useState(format(endOfMonth(now), "yyyy-MM-dd"));
  const [customerId, setCustomerId] = useState("");
  const [projectId, setProjectId] = useState("");
  const [userId, setUserId] = useState("");
  const [billable, setBillable] = useState("");
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<{ timeEntries: any[]; kmEntries: any[] } | null>(null);

  const filteredProjects = customerId ? projects.filter((p) => p.customerId === customerId) : projects;

  async function loadReport() {
    setLoading(true);
    const params = new URLSearchParams();
    if (from) params.set("from", from);
    if (to) params.set("to", to);
    if (customerId) params.set("customerId", customerId);
    if (projectId) params.set("projectId", projectId);
    if (userId) params.set("userId", userId);
    if (billable) params.set("billable", billable);

    const res = await fetch(`/api/reports?${params}`);
    if (res.ok) setData(await res.json());
    setLoading(false);
  }

  const totalHours = data?.timeEntries.reduce((s, e) => s + Number(e.hours), 0) ?? 0;
  const totalKm = data?.kmEntries.reduce((s, e) => s + Number(e.km), 0) ?? 0;
  const totalRevenue = data
    ? data.timeEntries.reduce((s, e) => {
        const rate = Number(e.rateOverride ?? e.activityType?.defaultRate ?? e.project?.defaultHourlyRate ?? 0);
        return s + Number(e.hours) * rate;
      }, 0) +
      data.kmEntries.reduce((s, e) => {
        const rate = Number(e.rateOverride ?? e.project?.defaultKmRate ?? 0);
        return s + Number(e.km) * rate;
      }, 0)
    : 0;

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
          <Button className="mt-4" onClick={loadReport} disabled={loading}>
            <Search className="h-4 w-4 mr-2" />
            {loading ? "Laden..." : "Rapport ophalen"}
          </Button>
        </CardContent>
      </Card>

      {data && (
        <>
          <div className="grid gap-4 sm:grid-cols-3">
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
                <div className="text-2xl font-bold">{formatCurrency(totalRevenue)}</div>
                <p className="text-sm text-muted-foreground">Totaal omzet (excl. BTW)</p>
              </CardContent>
            </Card>
          </div>

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
                      <TableCell className="text-right font-medium">{formatCurrency(totalRevenue)}</TableCell>
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

          {data.timeEntries.length === 0 && data.kmEntries.length === 0 && (
            <Card>
              <CardContent className="py-12 text-center text-muted-foreground">
                Geen registraties gevonden voor de geselecteerde filters
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  );
}
