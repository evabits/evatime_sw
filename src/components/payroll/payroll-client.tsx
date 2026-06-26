"use client";
import { useState, useEffect } from "react";
import { format } from "date-fns";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatHours } from "@/lib/utils";

type ContractType = "PERMANENT" | "FIXED_TERM" | "ZERO_HOURS";

interface PayrollRow {
  userId: string;
  name: string;
  contractType: ContractType;
  contractHours: number | null;
  workedHours: number;
  wbsoHours: number;
  overtime: number | null;
  km: number;
}

const contractLabel: Record<ContractType, string> = {
  PERMANENT: "Vast",
  FIXED_TERM: "Bepaalde tijd",
  ZERO_HOURS: "0-uren",
};

export function PayrollClient() {
  const [month, setMonth] = useState(() => format(new Date(), "yyyy-MM"));
  const [data, setData] = useState<PayrollRow[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetch(`/api/payroll?month=${month}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!cancelled) {
          if (d) setData(d);
          setLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [month]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Loonverwerking</h1>
        <p className="text-muted-foreground">Maandoverzicht per medewerker voor de salarisadministratie</p>
      </div>

      <Card>
        <CardHeader>
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <CardTitle>Overzicht</CardTitle>
            <div className="flex items-center gap-2">
              <Label htmlFor="month" className="text-sm text-muted-foreground">Maand</Label>
              <Input
                id="month"
                type="month"
                value={month}
                onChange={(e) => setMonth(e.target.value)}
                className="w-40"
              />
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Medewerker</TableHead>
                <TableHead>Contract</TableHead>
                <TableHead className="text-right">Gewerkte uren</TableHead>
                <TableHead className="text-right">WBSO-uren</TableHead>
                <TableHead className="text-right">Overuren</TableHead>
                <TableHead className="text-right">Kilometers</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading && (
                <TableRow>
                  <TableCell colSpan={6} className="text-center text-muted-foreground py-8">Laden...</TableCell>
                </TableRow>
              )}
              {!loading && data.length === 0 && (
                <TableRow>
                  <TableCell colSpan={6} className="text-center text-muted-foreground py-8">Geen medewerkers gevonden</TableCell>
                </TableRow>
              )}
              {!loading && data.map((row) => (
                <TableRow key={row.userId}>
                  <TableCell className="font-medium">{row.name}</TableCell>
                  <TableCell>
                    {contractLabel[row.contractType]}
                    {row.contractHours != null && (
                      <span className="text-muted-foreground"> · {row.contractHours}u/wk</span>
                    )}
                  </TableCell>
                  <TableCell className="text-right font-mono">{formatHours(row.workedHours)}</TableCell>
                  <TableCell className="text-right font-mono">{formatHours(row.wbsoHours)}</TableCell>
                  <TableCell className="text-right font-mono">
                    {row.overtime != null ? formatHours(row.overtime) : <span className="text-muted-foreground">—</span>}
                  </TableCell>
                  <TableCell className="text-right font-mono">{row.km.toLocaleString("nl-NL")} km</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
