"use client";
import { useState, useMemo } from "react";
import { format, startOfMonth, endOfMonth } from "date-fns";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow, TableFooter } from "@/components/ui/table";
import { formatHours, formatCurrency } from "@/lib/utils";
import { reportTotals, groupByEmployee as groupEntriesByEmployee } from "@/lib/report-totals";
import { ReportFilters, type FilterState } from "@/components/reports/report-filters";
import { TimeRows } from "@/components/reports/time-rows";
import { KmRows } from "@/components/reports/km-rows";
import { ExpenseRows } from "@/components/reports/expense-rows";

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

export function ReportsClient({ customers, projects, users, tags }: Props) {
  const now = new Date();
  const [filters, setFilters] = useState<FilterState>({
    from: format(startOfMonth(now), "yyyy-MM-dd"),
    to: format(endOfMonth(now), "yyyy-MM-dd"),
    customerId: "",
    projectId: "",
    userId: "",
    billable: "",
    tagIds: [],
    groupByEmployee: false,
  });
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<ReportData | null>(null);

  async function loadReport() {
    setLoading(true);
    const params = new URLSearchParams();
    if (filters.from) params.set("from", filters.from);
    if (filters.to) params.set("to", filters.to);
    if (filters.customerId) params.set("customerId", filters.customerId);
    if (filters.projectId) params.set("projectId", filters.projectId);
    if (filters.userId) params.set("userId", filters.userId);
    if (filters.billable) params.set("billable", filters.billable);
    if (filters.tagIds.length > 0) params.set("tags", filters.tagIds.join(","));

    const res = await fetch(`/api/reports?${params}`);
    if (res.ok) setData(await res.json());
    setLoading(false);
  }

  const totals = data ? reportTotals(data) : { hours: 0, km: 0, expenses: 0, revenue: 0 };
  const { hours: totalHours, km: totalKm, expenses: totalExpenses, revenue: totalRevenue } = totals;

  const employeeGroups = useMemo(() => (data ? groupEntriesByEmployee(data, users) : []), [data, users]);

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
                <TimeRows entries={data.timeEntries} total={totalHours} />
              )}

              {data.kmEntries.length > 0 && (
                <KmRows entries={data.kmEntries} />
              )}

              {data.expenses.length > 0 && (
                <ExpenseRows entries={data.expenses} total={totalExpenses} />
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
