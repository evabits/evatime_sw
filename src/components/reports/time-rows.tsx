"use client";
import { Pencil, Trash2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow, TableFooter } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatDate, formatHours, formatCurrency } from "@/lib/utils";
import { timeRate } from "@/lib/report-totals";

interface Props {
  entries: any[];
  total: number;
  canEdit: boolean;
  selected: Set<string>;
  selectableIds: string[];
  onToggle: (id: string) => void;
  onToggleAll: () => void;
  onEdit: (entry: any) => void;
  onDelete: (entry: any) => void;
}

export function TimeRows({ entries, total, canEdit, selected, selectableIds, onToggle, onToggleAll, onEdit, onDelete }: Props) {
  return (
    <Card>
      <CardHeader><CardTitle>Uren ({entries.length})</CardTitle></CardHeader>
      <CardContent className="p-0">
        <Table>
          <TableHeader>
            <TableRow>
              {canEdit && (
                <TableHead className="w-8">
                  <input
                    type="checkbox"
                    className="h-4 w-4 rounded border-input accent-primary"
                    checked={selectableIds.length > 0 && selectableIds.every((id) => selected.has(id))}
                    onChange={onToggleAll}
                  />
                </TableHead>
              )}
              <TableHead>Datum</TableHead>
              <TableHead>Medewerker</TableHead>
              <TableHead>Klant / Project</TableHead>
              <TableHead>Activiteit</TableHead>
              <TableHead>Omschrijving</TableHead>
              <TableHead className="text-right">Uren</TableHead>
              <TableHead className="text-right">Tarief</TableHead>
              <TableHead className="text-right">Bedrag</TableHead>
              <TableHead></TableHead>
              {canEdit && <TableHead></TableHead>}
            </TableRow>
          </TableHeader>
          <TableBody>
            {entries.map((e) => {
              const rate = timeRate(e);
              const amount = Number(e.hours) * rate;
              return (
                <TableRow key={e.id}>
                  {canEdit && (
                    <TableCell>
                      {!e.invoiced && (
                        <input
                          type="checkbox"
                          className="h-4 w-4 rounded border-input accent-primary"
                          checked={selected.has(e.id)}
                          onChange={() => onToggle(e.id)}
                        />
                      )}
                    </TableCell>
                  )}
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
                  {canEdit && (
                    <TableCell>
                      <div className="flex gap-1 justify-end">
                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => onEdit(e)} disabled={e.invoiced}>
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => onDelete(e)} disabled={e.invoiced}>
                          <Trash2 className="h-3.5 w-3.5 text-destructive" />
                        </Button>
                      </div>
                    </TableCell>
                  )}
                </TableRow>
              );
            })}
          </TableBody>
          <TableFooter>
            <TableRow>
              {canEdit && <TableCell />}
              <TableCell colSpan={5} className="font-medium">Totaal</TableCell>
              <TableCell className="text-right font-mono font-medium">{formatHours(total)}</TableCell>
              <TableCell />
              <TableCell className="text-right font-medium">
                {formatCurrency(entries.reduce((s, e) => s + Number(e.hours) * timeRate(e), 0))}
              </TableCell>
              <TableCell />
              {canEdit && <TableCell />}
            </TableRow>
          </TableFooter>
        </Table>
      </CardContent>
    </Card>
  );
}
