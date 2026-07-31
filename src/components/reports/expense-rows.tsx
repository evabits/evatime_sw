"use client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow, TableFooter } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { formatDate, formatCurrency } from "@/lib/utils";

interface Props {
  entries: any[];
  total: number;
}

export function ExpenseRows({ entries, total }: Props) {
  return (
    <Card>
      <CardHeader><CardTitle>Uitgaven ({entries.length})</CardTitle></CardHeader>
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
            {entries.map((e) => (
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
              <TableCell className="text-right font-medium">{formatCurrency(total)}</TableCell>
              <TableCell />
            </TableRow>
          </TableFooter>
        </Table>
      </CardContent>
    </Card>
  );
}
