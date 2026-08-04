"use client";
import { useState, useEffect, useCallback, useRef } from "react";
import { format } from "date-fns";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatHours } from "@/lib/utils";

interface Entry {
  hours: number;
  project: string;
  customer: string | null;
  description: string | null;
}
interface Member {
  userId: string;
  userName: string | null;
  entries: Entry[];
  absence: string | null;
  previousNote: string | null;
  note: string;
}
interface Data {
  date: string;
  previousWorkingDay: string;
  previousStandupDate: string | null;
  members: Member[];
}

function nl(d: string) {
  return new Date(`${d}T00:00:00Z`).toLocaleDateString("nl-NL", {
    weekday: "long",
    day: "numeric",
    month: "long",
    timeZone: "UTC",
  });
}

export function StandupClient() {
  const [date, setDate] = useState(() => format(new Date(), "yyyy-MM-dd"));
  const [data, setData] = useState<Data | null>(null);
  const [laden, setLaden] = useState(true);
  const [fout, setFout] = useState("");
  const [concept, setConcept] = useState<Record<string, string>>({});
  const [opgeslagen, setOpgeslagen] = useState<string[]>([]);
  // Houdt de datum die nu op het scherm staat bij, ook tijdens een lopend
  // save()-verzoek: zo kan een antwoord van een verlaten dag herkend worden.
  const huidigeDatum = useRef(date);
  useEffect(() => { huidigeDatum.current = date; }, [date]);

  const load = useCallback(async (d: string) => {
    setLaden(true);
    setFout("");
    try {
      const res = await fetch(`/api/standup?date=${d}`);
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setFout(body.error ?? `Fout ${res.status}`);
        setData(null);
        return;
      }
      setData(body);
      setConcept(Object.fromEntries(body.members.map((m: Member) => [m.userId, m.note])));
      setOpgeslagen([]);
    } catch {
      setFout("Netwerkfout, probeer opnieuw");
      setData(null);
    } finally {
      setLaden(false);
    }
  }, []);

  useEffect(() => { load(date); }, [date, load]);

  async function save(userId: string) {
    const note = concept[userId] ?? "";
    // Alleen schrijven als er daadwerkelijk iets veranderd is: het opslaan hangt
    // aan onBlur, en dat vuurt ook wanneer je alleen even wegklikt.
    const origineel = data?.members.find((m) => m.userId === userId)?.note ?? "";
    if (note.trim() === origineel.trim()) return;

    const datumBijOpslaan = date;

    const res = await fetch("/api/standup/note", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ date, userId, note }),
    });
    const body = await res.json().catch(() => ({}));

    // De gebruiker kan intussen naar een andere datum zijn gewisseld: het
    // schrijven op de server is dan nog steeds correct (de datum stond in de
    // request), maar het scherm toont inmiddels een andere dag en mag dat
    // antwoord niet meer overnemen.
    if (datumBijOpslaan !== huidigeDatum.current) return;

    if (!res.ok) {
      setFout(body.error ?? `Fout ${res.status}`);
      return;
    }
    setFout("");
    setData((prev) =>
      prev
        ? { ...prev, members: prev.members.map((m) => (m.userId === userId ? { ...m, note: body.note ?? "" } : m)) }
        : prev,
    );
    setOpgeslagen((prev) => (prev.includes(userId) ? prev : [...prev, userId]));
  }

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">StandUp</h1>
          <p className="text-muted-foreground">
            {data
              ? `Uren van ${nl(data.previousWorkingDay)}`
              : "Uren van de vorige werkdag"}
          </p>
        </div>
        <div className="space-y-1">
          <Label>Datum standup</Label>
          <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="w-44" />
        </div>
      </div>

      {fout && <p className="text-sm text-destructive">{fout}</p>}
      {laden && <p className="text-sm text-muted-foreground">Laden…</p>}

      {data && data.members.length === 0 && (
        <p className="text-sm text-muted-foreground">Geen actieve medewerkers gevonden.</p>
      )}

      {data?.members.map((m) => (
        <Card key={m.userId}>
          <CardContent className="p-4 space-y-3">
            <div className="flex items-center gap-2">
              <span className="font-medium">{m.userName}</span>
              {m.absence && <Badge variant="secondary">afwezig — {m.absence}</Badge>}
              {opgeslagen.includes(m.userId) && (
                <span className="text-xs text-muted-foreground ml-auto">opgeslagen</span>
              )}
            </div>

            <div className="text-sm">
              {m.entries.length === 0 ? (
                <p className="text-muted-foreground">geen uren geboekt</p>
              ) : (
                <ul className="space-y-0.5">
                  {m.entries.map((e, i) => (
                    <li key={i}>
                      <span className="tabular-nums font-medium">{formatHours(e.hours)}</span>{" "}
                      {e.customer ? `${e.customer} / ` : ""}{e.project}
                      {e.description ? ` — ${e.description}` : ""}
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {m.previousNote && (
              <p className="text-sm text-muted-foreground border-l-2 pl-3">
                {data.previousStandupDate && (
                  <span className="block text-xs">{nl(data.previousStandupDate)}</span>
                )}
                {m.previousNote}
              </p>
            )}

            <Textarea
              rows={2}
              placeholder="Notitie…"
              value={concept[m.userId] ?? ""}
              onChange={(e) => setConcept((prev) => ({ ...prev, [m.userId]: e.target.value }))}
              onBlur={() => save(m.userId)}
            />
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
