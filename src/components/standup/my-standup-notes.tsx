import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatDate, formatWeekday } from "@/lib/utils";

interface Note {
  id: string;
  date: string;
  note: string;
}

export function MyStandupNotes({ notes }: { notes: Note[] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Standup-notities</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {notes.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Er zijn nog geen notities over u vastgelegd in een standup.
          </p>
        ) : (
          notes.map((n) => (
            <div key={n.id} className="text-sm">
              <span className="block text-xs text-muted-foreground">
                {formatWeekday(n.date)} {formatDate(n.date)}
              </span>
              {n.note}
            </div>
          ))
        )}
      </CardContent>
    </Card>
  );
}
