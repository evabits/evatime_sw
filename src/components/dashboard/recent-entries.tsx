import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatDate, formatHours } from "@/lib/utils";

interface TimeEntry {
  id: string;
  date: Date;
  hours: { toString(): string } | string | number;
  description: string | null;
  project: { name: string };
  activityType: { name: string } | null;
}

interface KmEntry {
  id: string;
  date: Date;
  km: { toString(): string } | string | number;
  description: string | null;
  project: { name: string };
}

interface Props {
  timeEntries: TimeEntry[];
  kmEntries: KmEntry[];
}

export function RecentEntries({ timeEntries, kmEntries }: Props) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Recente registraties</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {timeEntries.length === 0 && kmEntries.length === 0 && (
          <p className="text-sm text-muted-foreground text-center py-4">Geen recente registraties</p>
        )}
        {timeEntries.map((entry) => (
          <div key={entry.id} className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="text-sm font-medium truncate">{entry.project.name}</p>
              <p className="text-xs text-muted-foreground">
                {entry.activityType?.name} · {formatDate(entry.date)}
              </p>
              {entry.description && (
                <p className="text-xs text-muted-foreground truncate">{entry.description}</p>
              )}
            </div>
            <span className="text-sm font-mono shrink-0">{formatHours(Number(entry.hours))}</span>
          </div>
        ))}
        {kmEntries.map((entry) => (
          <div key={entry.id} className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="text-sm font-medium truncate">{entry.project.name}</p>
              <p className="text-xs text-muted-foreground">Kilometers · {formatDate(entry.date)}</p>
              {entry.description && (
                <p className="text-xs text-muted-foreground truncate">{entry.description}</p>
              )}
            </div>
            <span className="text-sm font-mono shrink-0">{Number(entry.km).toFixed(0)} km</span>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
