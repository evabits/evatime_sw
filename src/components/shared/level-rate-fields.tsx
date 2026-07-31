"use client";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { WORK_LEVEL_ORDER, WORK_LEVEL_LABELS } from "@/lib/work-levels";

interface Props {
  /** Gekeyd op niveau; een lege string betekent "niet ingesteld". */
  value: Record<string, string>;
  onChange: (next: Record<string, string>) => void;
  hint?: string;
}

export function LevelRateFields({ value, onChange, hint }: Props) {
  return (
    <div className="space-y-2">
      <Label>Uurtarieven per werkniveau</Label>
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
      <div className="grid gap-2 sm:grid-cols-2">
        {WORK_LEVEL_ORDER.map((level) => (
          <div key={level} className="flex items-center gap-2">
            <span className="text-sm w-36 shrink-0">{WORK_LEVEL_LABELS[level]}</span>
            <Input
              type="number"
              step="0.01"
              min="0.01"
              placeholder="Niet ingesteld"
              value={value[level] ?? ""}
              onChange={(e) => onChange({ ...value, [level]: e.target.value })}
            />
          </div>
        ))}
      </div>
    </div>
  );
}
