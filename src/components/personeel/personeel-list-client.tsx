"use client";
import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Pencil } from "lucide-react";
import { formatCurrency } from "@/lib/utils";

interface Row {
  id: string; name: string; email: string; role: string;
  jobTitle: string | null; salaryMonthly: number | null;
  contractType: "PERMANENT" | "FIXED_TERM" | "ZERO_HOURS" | null;
  endDate: string | null;
}

const CONTRACT_LABELS: Record<string, string> = {
  PERMANENT: "Vast",
  FIXED_TERM: "Bepaalde tijd",
  ZERO_HOURS: "0-uren",
};

export function PersoneelListClient({ rows }: { rows: Row[] }) {
  const todayPlus30 = new Date(Date.now() + 30 * 864e5).toISOString().slice(0, 10);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Personeel</h1>
        <p className="text-muted-foreground">Overzicht van medewerkers en hun contracten</p>
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Naam</TableHead>
                <TableHead>Functie</TableHead>
                <TableHead>Salaris</TableHead>
                <TableHead>Status</TableHead>
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row) => {
                const expiringSoon =
                  row.contractType === "FIXED_TERM" &&
                  row.endDate != null &&
                  row.endDate <= todayPlus30;
                return (
                  <TableRow key={row.id}>
                    <TableCell className="font-medium">{row.name}</TableCell>
                    <TableCell>{row.jobTitle ?? <span className="text-muted-foreground">—</span>}</TableCell>
                    <TableCell className="font-mono">
                      {row.salaryMonthly != null
                        ? `${formatCurrency(row.salaryMonthly)} /mnd`
                        : <span className="text-muted-foreground">—</span>}
                    </TableCell>
                    <TableCell>
                      {expiringSoon ? (
                        <Badge variant="destructive">Loopt af</Badge>
                      ) : row.contractType != null ? (
                        <Badge variant="secondary">{CONTRACT_LABELS[row.contractType]}</Badge>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button asChild variant="ghost" size="icon">
                        <Link href={`/personeel/${row.id}`} aria-label="Bewerken">
                          <Pencil className="h-3.5 w-3.5" />
                        </Link>
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
