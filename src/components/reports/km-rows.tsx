"use client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { formatDate, formatCurrency } from "@/lib/utils";
import { kmRate } from "@/lib/report-totals";

interface Props {
  entries: any[];
}

export function KmRows({ entries }: Props) {
  return (
    <Card>
      <CardHeader><CardTitle>Kilometers ({entries.length})</CardTitle></CardHeader>
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
            {entries.map((e) => {
              const rate = kmRate(e);
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
  );
}
