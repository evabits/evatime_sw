"use client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow, TableFooter } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { formatDate, formatHours, formatCurrency } from "@/lib/utils";
import { timeRate } from "@/lib/report-totals";

interface Props {
  entries: any[];
  total: number;
}

export function TimeRows({ entries, total }: Props) {
  return (
    <Card>
      <CardHeader><CardTitle>Uren ({entries.length})</CardTitle></CardHeader>
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
            {entries.map((e) => {
              const rate = timeRate(e);
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
              <TableCell className="text-right font-mono font-medium">{formatHours(total)}</TableCell>
              <TableCell />
              <TableCell className="text-right font-medium">
                {formatCurrency(entries.reduce((s, e) => s + Number(e.hours) * timeRate(e), 0))}
              </TableCell>
              <TableCell />
            </TableRow>
          </TableFooter>
        </Table>
      </CardContent>
    </Card>
  );
}
