import { formatDate, formatHours } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Trash2 } from "lucide-react";
import type { LedgerLine, MonthKey } from "@/lib/overtime";

/**
 * De opsomming van het urensaldo. Gedeeld door de personeelspagina (met
 * verwijderknop) en het dashboard (alleen lezen).
 */

/** "2026-09" -> "september 2026", net als de periode-titel van het uren-overzicht. */
export function monthLabel(key: MonthKey): string {
  const [jaar, maand] = key.split("-").map(Number);
  return new Date(jaar, maand - 1, 1).toLocaleDateString("nl-NL", { month: "long", year: "numeric" });
}

/**
 * Uren met teken: `+` voor een overschot, een eigen `-` voor een tekort.
 *
 * formatHours() zelf kan geen negatieve uren aan — Math.floor van bijvoorbeeld
 * -2,5 geeft -3, en de minuten erna kloppen dan niet meer. Daarom hier altijd
 * de absolute waarde aan formatHours geven en het teken er zelf voor zetten.
 */
export function signed(hours: number): string {
  if (hours > 0) return `+${formatHours(hours)}`;
  if (hours < 0) return `-${formatHours(Math.abs(hours))}`;
  return formatHours(0);
}

function lineKey(line: LedgerLine): string {
  if (line.kind === "opening") return "opening";
  if (line.kind === "month") return line.key;
  return line.id;
}

export function OvertimeLedgerList({ lines, onDelete }: { lines: LedgerLine[]; onDelete?: (id: string) => void }) {
  return (
    <div className="divide-y divide-border">
      {lines.map((line) => (
        <div key={lineKey(line)} className="flex items-center justify-between py-2 text-sm gap-4">
          {line.kind === "opening" && (
            <span>Beginstand {formatDate(line.date)}</span>
          )}
          {line.kind === "month" && (
            <span>
              {monthLabel(line.key)}
              <span className="text-muted-foreground text-xs ml-2">
                {line.target != null
                  ? `geboekt ${formatHours(line.geboekt)} / target ${formatHours(line.target)}`
                  : `geboekt ${formatHours(line.geboekt)} (geen contract)`}
              </span>
            </span>
          )}
          {line.kind === "adjustment" && (
            <span>
              {formatDate(line.date)}
              <span className="text-muted-foreground text-xs ml-2">{line.reason}</span>
            </span>
          )}
          <div className="flex items-center gap-2 shrink-0">
            <span className={line.hours < 0 ? "text-destructive" : ""}>{signed(line.hours)}</span>
            {line.kind === "adjustment" && onDelete && (
              <Button variant="ghost" size="icon" onClick={() => onDelete(line.id)}>
                <Trash2 className="h-3.5 w-3.5 text-destructive" />
              </Button>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
