"use client";
import { useState, useEffect, useCallback, useRef } from "react";
import { format } from "date-fns";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { formatHours } from "@/lib/utils";
import { readHiddenIds, hiddenStorageKey } from "@/lib/standup-visibility";
import { missingHours } from "@/lib/work-schedule";

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
  lastWorked: { date: string; entries: Entry[] } | null;
  absence: string | null;
  scheduledHours: number | null;
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

function weekdag(d: string) {
  return new Date(`${d}T00:00:00Z`).toLocaleDateString("nl-NL", { weekday: "long", timeZone: "UTC" });
}

// Kort, want deze datum staat midden in een regel en niet in een kop:
// "vr 3 aug" in plaats van "vrijdag 3 augustus".
function kortNl(d: string) {
  return new Date(`${d}T00:00:00Z`).toLocaleDateString("nl-NL", {
    weekday: "short",
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  });
}

function EntryList({ entries }: { entries: Entry[] }) {
  return (
    <ul className="space-y-0.5">
      {entries.map((e, i) => (
        <li key={i}>
          <span className="tabular-nums font-medium">{formatHours(e.hours)}</span>{" "}
          {e.customer ? `${e.customer} / ` : ""}{e.project}
          {e.description ? ` — ${e.description}` : ""}
        </li>
      ))}
    </ul>
  );
}

export function StandupClient({ userId }: { userId: string }) {
  const [date, setDate] = useState(() => format(new Date(), "yyyy-MM-dd"));
  const [data, setData] = useState<Data | null>(null);
  const [laden, setLaden] = useState(true);
  const [fout, setFout] = useState("");
  const [concept, setConcept] = useState<Record<string, string>>({});
  const [opgeslagen, setOpgeslagen] = useState<string[]>([]);
  // Wie de leider uit beeld heeft geklikt. Leeg betekent iedereen zichtbaar,
  // dus het scherm gedraagt zich als voorheen tot hij zelf iets wegklikt.
  const [verborgen, setVerborgen] = useState<string[]>([]);
  const [kiezerOpen, setKiezerOpen] = useState(false);
  const opslagSleutel = hiddenStorageKey(userId);

  // Pas na het hydrateren lezen: op de server bestaat localStorage niet. De
  // try/catch is niet decoratief — die property gooit een SecurityError in een
  // browser die site-data blokkeert, en dan zou dit scherm omvallen.
  useEffect(() => {
    try {
      setVerborgen(readHiddenIds(localStorage.getItem(opslagSleutel)));
    } catch {
      /* geen opslag beschikbaar: iedereen blijft in beeld */
    }
  }, [opslagSleutel]);

  function bewaarVerborgen(ids: string[]) {
    setVerborgen(ids);
    try {
      localStorage.setItem(opslagSleutel, JSON.stringify(ids));
    } catch {
      /* schrijven mag mislukken; de keuze geldt dan voor deze sessie */
    }
  }
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
      // Zelfde probleem als bij save(): de gebruiker kan intussen naar een
      // andere datum zijn gewisseld. Twee load()-verzoeken kunnen dan buiten
      // volgorde terugkomen, dus een verlaten antwoord mag het scherm niet
      // meer aanpassen.
      if (d !== huidigeDatum.current) return;
      if (!res.ok) {
        setFout(body.error ?? `Fout ${res.status}`);
        setData(null);
        return;
      }
      setData(body);
      setConcept(Object.fromEntries(body.members.map((m: Member) => [m.userId, m.note])));
      setOpgeslagen([]);
    } catch {
      if (d !== huidigeDatum.current) return;
      setFout("Netwerkfout, probeer opnieuw");
      setData(null);
    } finally {
      // Alleen de spinner van dít verzoek uitzetten: een nog lopend verzoek
      // voor de huidige datum moet 'm zelf nog uitzetten.
      if (d === huidigeDatum.current) setLaden(false);
    }
  }, []);

  useEffect(() => {
    if (!date) {
      // Een leeg datumveld levert geen verzoek op. De spinner moet hier wél uit:
      // een verzoek dat nog liep herkent zichzelf niet meer in huidigeDatum ("")
      // en laat 'm anders voorgoed aan staan.
      setLaden(false);
      return;
    }
    load(date);
  }, [date, load]);

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

  const alleLeden = data?.members ?? [];
  const zichtbareLeden = alleLeden.filter((m) => !verborgen.includes(m.userId));

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
        <div className="flex items-end gap-2">
          {alleLeden.length > 0 && (
            <Button variant="outline" className="h-10" onClick={() => setKiezerOpen(true)}>
              In beeld: {zichtbareLeden.length} van {alleLeden.length}
            </Button>
          )}
          <div className="space-y-1">
            <Label>Datum standup</Label>
            <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="w-44" />
          </div>
        </div>
      </div>

      {fout && <p className="text-sm text-destructive">{fout}</p>}
      {laden && <p className="text-sm text-muted-foreground">Laden…</p>}

      {data && alleLeden.length === 0 && (
        <p className="text-sm text-muted-foreground">Geen actieve medewerkers gevonden.</p>
      )}

      {data && alleLeden.length > 0 && zichtbareLeden.length === 0 && (
        <p className="text-sm text-muted-foreground">
          Iedereen staat uit beeld. Kies wie u wilt zien via &quot;In beeld&quot;.
        </p>
      )}

      {data && zichtbareLeden.map((m) => {
          const geboekt = m.entries.reduce((som, e) => som + e.hours, 0);
          const mist = missingHours(m.scheduledHours, geboekt, !!m.absence);
          return (
        <Card key={m.userId}>
          <CardContent className="p-4 space-y-3">
            <div className="flex items-center gap-2">
              <span className="font-medium">{m.userName}</span>
              {m.absence && <Badge variant="secondary">afwezig — {m.absence}</Badge>}
              {mist > 0 && (
                <Badge variant="outline" className="border-amber-500/60 text-amber-700 dark:text-amber-400">
                  mist {formatHours(mist)}
                </Badge>
              )}
              {opgeslagen.includes(m.userId) && (
                <span className="text-xs text-muted-foreground ml-auto">opgeslagen</span>
              )}
            </div>

            <div className="text-sm">
              {m.entries.length === 0 ? (
                // Een afwezigheid is de uitzonderlijkere mededeling en wint
                // daarom van het rooster: wie op zijn vaste vrije dag ook nog
                // vakantie opnam, ziet die badge al naast zijn naam staan.
                <p className="text-muted-foreground">
                  {m.scheduledHours === 0 && !m.absence
                    ? `werkt niet op ${weekdag(data.previousWorkingDay)}`
                    : "geen uren geboekt"}
                </p>
              ) : (
                <EntryList entries={m.entries} />
              )}
            </div>

            {m.entries.length === 0 && m.lastWorked && (
              <div className="text-sm text-muted-foreground">
                <p className="text-xs">laatst gewerkt: {kortNl(m.lastWorked.date)}</p>
                <EntryList entries={m.lastWorked.entries} />
              </div>
            )}

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
          );
        })}

      <Dialog open={kiezerOpen} onOpenChange={setKiezerOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Wie in beeld</DialogTitle>
          </DialogHeader>
          <div className="space-y-1 max-h-80 overflow-y-auto">
            {alleLeden.map((m) => {
              const zichtbaar = !verborgen.includes(m.userId);
              return (
                <label key={m.userId} className="flex items-center gap-2 text-sm cursor-pointer py-1">
                  <input
                    type="checkbox"
                    className="h-4 w-4 rounded border-input accent-primary"
                    checked={zichtbaar}
                    onChange={() =>
                      bewaarVerborgen(
                        zichtbaar
                          ? [...verborgen, m.userId]
                          : verborgen.filter((id) => id !== m.userId),
                      )
                    }
                  />
                  {m.userName}
                </label>
              );
            })}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => bewaarVerborgen([])}>Toon iedereen</Button>
            <Button onClick={() => setKiezerOpen(false)}>Klaar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
