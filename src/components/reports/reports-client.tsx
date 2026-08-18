"use client";
import { useState, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow, TableFooter } from "@/components/ui/table";
import { formatHours, formatCurrency } from "@/lib/utils";
import { reportTotals, groupByEmployee as groupEntriesByEmployee, type ReportData } from "@/lib/report-totals";
import { ReportFilters, type FilterState } from "@/components/reports/report-filters";
import { TimeRows } from "@/components/reports/time-rows";
import { KmRows } from "@/components/reports/km-rows";
import { ExpenseRows } from "@/components/reports/expense-rows";
import { ENTRY_ENDPOINT, type BulkKind, type BulkAction } from "@/lib/bulk-entries";
import { resolvePeriod } from "@/lib/periods";
import { EntryEditDialog } from "./entry-edit-dialog";
import { BulkBar } from "./bulk-bar";

interface Props {
  customers: any[];
  projects: any[];
  users: { id: string; name: string; weeklyHours: number | null }[];
  tags: { id: string; name: string }[];
  categories: any[];
  role: string;
}

export function ReportsClient({ customers, projects, users, tags, categories, role }: Props) {
  const [filters, setFilters] = useState<FilterState>(() => {
    const range = resolvePeriod("this-month", new Date())!;
    return {
      period: "this-month",
      from: range.from,
      to: range.to,
      customerId: "",
      projectId: "",
      userId: "",
      billable: "",
      invoiced: "",
      tagIds: [],
      groupByEmployee: false,
    };
  });
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<ReportData | null>(null);
  const canEdit = role === "ADMIN";
  const [editing, setEditing] = useState<{ kind: BulkKind; entry: any } | null>(null);
  const [selected, setSelected] = useState<Record<BulkKind, Set<string>>>({
    time: new Set(), km: new Set(), expense: new Set(),
  });
  const [bulkBusy, setBulkBusy] = useState(false);

  async function deleteEntry(kind: BulkKind, entry: any) {
    if (!confirm("Weet u zeker dat u deze registratie wilt verwijderen?")) return;
    const res = await fetch(`${ENTRY_ENDPOINT[kind]}/${entry.id}`, { method: "DELETE" });
    if (!res.ok) {
      const payload = await res.json().catch(() => ({}));
      alert(payload.error ?? "Verwijderen mislukt");
      return;
    }
    await loadReport();
  }

  function toggle(kind: BulkKind, id: string) {
    setSelected((prev) => {
      const next = new Set(prev[kind]);
      if (next.has(id)) next.delete(id); else next.add(id);
      return { ...prev, [kind]: next };
    });
  }

  function toggleAll(kind: BulkKind, ids: string[]) {
    setSelected((prev) => {
      const allSelected = ids.length > 0 && ids.every((id) => prev[kind].has(id));
      return { ...prev, [kind]: allSelected ? new Set<string>() : new Set(ids) };
    });
  }

  async function applyBulk(kind: BulkKind, action: BulkAction) {
    const ids = Array.from(selected[kind]);
    if (ids.length === 0) return;
    if (action.type === "delete" && !confirm(`Weet u zeker dat u ${ids.length} registratie(s) wilt verwijderen?`)) return;

    setBulkBusy(true);
    const res = await fetch("/api/entries/bulk", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ kind, ids, action }),
    });
    setBulkBusy(false);

    if (!res.ok) {
      const payload = await res.json().catch(() => ({}));
      alert(payload.error ?? "Bulkactie mislukt");
      return;
    }
    const { count } = await res.json();
    if (count < ids.length) {
      const verb = action.type === "delete" ? "verwijderd" : "bijgewerkt";
      alert(`${count} van de ${ids.length} regels ${verb}, gefactureerde regels overgeslagen`);
    }
    setSelected((prev) => ({ ...prev, [kind]: new Set<string>() }));
    await loadReport();
  }

  async function loadReport() {
    setLoading(true);
    // Elke nieuwe rapportlading maakt de vorige selectie ongeldig (andere filters, andere
    // rijen) — wissen vóór de fetch zodat een trage fetch nooit een bulkactie op
    // onzichtbare, oude ids toestaat.
    setSelected({ time: new Set(), km: new Set(), expense: new Set() });
    const params = new URLSearchParams();
    if (filters.from) params.set("from", filters.from);
    if (filters.to) params.set("to", filters.to);
    if (filters.customerId) params.set("customerId", filters.customerId);
    if (filters.projectId) params.set("projectId", filters.projectId);
    if (filters.userId) params.set("userId", filters.userId);
    if (filters.billable) params.set("billable", filters.billable);
    if (filters.invoiced) params.set("invoiced", filters.invoiced);
    if (filters.tagIds.length > 0) params.set("tags", filters.tagIds.join(","));

    const res = await fetch(`/api/reports?${params}`);
    if (res.ok) setData(await res.json());
    setLoading(false);
  }

  const totals = data ? reportTotals(data) : { hours: 0, km: 0, expenses: 0, revenue: 0 };
  const { hours: totalHours, km: totalKm, expenses: totalExpenses, revenue: totalRevenue } = totals;

  const employeeGroups = useMemo(() => (data ? groupEntriesByEmployee(data, users) : []), [data, users]);

  const selectableIds = {
    time: data?.timeEntries.filter((e) => !e.invoiced).map((e) => e.id) ?? [],
    km: data?.kmEntries.filter((e) => !e.invoiced).map((e) => e.id) ?? [],
    expense: data?.expenses.filter((e) => !e.invoiced).map((e) => e.id) ?? [],
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Rapporten</h1>
        <p className="text-muted-foreground">Gedetailleerd overzicht met filters</p>
      </div>

      <ReportFilters
        customers={customers}
        projects={projects}
        users={users}
        tags={tags}
        value={filters}
        onChange={setFilters}
        onSubmit={loadReport}
        loading={loading}
      />

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

          {filters.groupByEmployee ? (
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
                      const days = filters.from && filters.to
                        ? Math.round((new Date(filters.to).getTime() - new Date(filters.from).getTime()) / 86_400_000) + 1
                        : 7;
                      const targetHours = emp.weeklyHours != null ? emp.weeklyHours * (days / 7) : null;
                      const extraHours = targetHours != null ? Math.max(0, emp.hours - targetHours) : null;

                      return (
                        <TableRow key={emp.userId}>
                          <TableCell className="font-medium">{emp.name}</TableCell>
                          <TableCell className="text-right font-mono">{formatHours(emp.hours)}</TableCell>
                          <TableCell className="text-right font-mono">
                            {extraHours != null && extraHours > 0
                              ? <span className="text-amber-600 dark:text-amber-400 font-medium">+{formatHours(extraHours)}</span>
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
                <div>
                  {canEdit && selected.time.size > 0 && (
                    <BulkBar kind="time" count={selected.time.size} projects={projects} users={users} busy={bulkBusy} onApply={(a) => applyBulk("time", a)} />
                  )}
                  <TimeRows
                    entries={data.timeEntries}
                    total={totalHours}
                    canEdit={canEdit}
                    selected={selected.time}
                    selectableIds={selectableIds.time}
                    onToggle={(id) => toggle("time", id)}
                    onToggleAll={() => toggleAll("time", selectableIds.time)}
                    onEdit={(e) => setEditing({ kind: "time", entry: e })}
                    onDelete={(e) => deleteEntry("time", e)}
                  />
                </div>
              )}

              {data.kmEntries.length > 0 && (
                <div>
                  {canEdit && selected.km.size > 0 && (
                    <BulkBar kind="km" count={selected.km.size} projects={projects} users={users} busy={bulkBusy} onApply={(a) => applyBulk("km", a)} />
                  )}
                  <KmRows
                    entries={data.kmEntries}
                    canEdit={canEdit}
                    selected={selected.km}
                    selectableIds={selectableIds.km}
                    onToggle={(id) => toggle("km", id)}
                    onToggleAll={() => toggleAll("km", selectableIds.km)}
                    onEdit={(e) => setEditing({ kind: "km", entry: e })}
                    onDelete={(e) => deleteEntry("km", e)}
                  />
                </div>
              )}

              {data.expenses.length > 0 && (
                <div>
                  {canEdit && selected.expense.size > 0 && (
                    <BulkBar kind="expense" count={selected.expense.size} projects={projects} users={users} busy={bulkBusy} onApply={(a) => applyBulk("expense", a)} />
                  )}
                  <ExpenseRows
                    entries={data.expenses}
                    total={totalExpenses}
                    canEdit={canEdit}
                    selected={selected.expense}
                    selectableIds={selectableIds.expense}
                    onToggle={(id) => toggle("expense", id)}
                    onToggleAll={() => toggleAll("expense", selectableIds.expense)}
                    onEdit={(e) => setEditing({ kind: "expense", entry: e })}
                    onDelete={(e) => deleteEntry("expense", e)}
                  />
                </div>
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

      <EntryEditDialog
        kind={editing?.kind ?? null}
        entry={editing?.entry ?? null}
        projects={projects}
        categories={categories}
        users={users}
        onClose={() => setEditing(null)}
        onSaved={async () => { setEditing(null); await loadReport(); }}
      />
    </div>
  );
}
