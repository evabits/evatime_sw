"use client";
import { format } from "date-fns";
import { cn } from "@/lib/utils";

const DAY_ABBR = ["Ma", "Di", "Wo", "Do", "Vr", "Za", "Zo"];

/**
 * Het weekraster boven een registratielijst: zeven klikbare dagen en een
 * totaalkolom.
 *
 * Wat per scherm verschilt gaat als prop mee. `formatValue` bepaalt hoe een
 * getal eruitziet — uren en kilometers rekenen niet in dezelfde eenheid — en
 * `noteFor` mag per dag een tekst in plaats van dat getal geven. Dat laatste
 * bestaat voor de `vrij`-markering van het urenscherm; de voorwaarden daarvoor
 * hangen af van het weekrooster van de medewerker, en dat is kennis die in het
 * urenscherm hoort en niet in een gedeeld raster.
 */
export function WeekGrid({
  days,
  values,
  today,
  selectedDay,
  onSelect,
  formatValue,
  noteFor,
}: {
  days: Date[];
  values: number[];
  today: string;
  selectedDay: string | null;
  onSelect: (day: string) => void;
  formatValue: (value: number) => string;
  noteFor?: (dayStr: string, index: number, value: number) => string | null;
}) {
  const total = values.reduce((s, v) => s + v, 0);
  return (
    <div className="overflow-x-auto border-b">
      <div className="grid grid-cols-8 min-w-[560px]">
        {days.map((day, i) => {
          const dayStr = format(day, "yyyy-MM-dd");
          const isToday = dayStr === today;
          const isSelected = selectedDay === dayStr;
          const value = values[i];
          const note = noteFor?.(dayStr, i, value) ?? null;
          return (
            <button
              key={dayStr}
              onClick={() => onSelect(dayStr)}
              className={cn(
                "flex flex-col items-start px-3 py-2.5 hover:bg-muted/50 transition-colors text-left",
                isSelected && "bg-muted/50"
              )}
            >
              <span className={cn(
                "text-xs font-semibold pb-0.5",
                isToday ? "border-b-2 border-primary text-primary" : "text-muted-foreground"
              )}>
                {DAY_ABBR[i]} {format(day, "d")}
              </span>
              <span className={cn("text-sm tabular-nums mt-1", value === 0 ? "text-muted-foreground" : "font-medium")}>
                {note ?? formatValue(value)}
              </span>
            </button>
          );
        })}
        <div className="flex flex-col items-end px-3 py-2.5">
          <span className="text-xs font-semibold text-muted-foreground pb-0.5">Totaal</span>
          <span className={cn("text-sm tabular-nums mt-1", total === 0 ? "text-muted-foreground" : "font-medium")}>
            {formatValue(total)}
          </span>
        </div>
      </div>
    </div>
  );
}
