"use client";
import { useState, useEffect } from "react";
import {
  startOfWeek, endOfWeek, startOfMonth, endOfMonth,
  addWeeks, subWeeks, addMonths, subMonths, getISOWeek, format,
} from "date-fns";
import { ChevronLeft, ChevronRight, Mail, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { formatHours } from "@/lib/utils";

interface OverviewEntry {
  userId: string;
  userName: string;
  userEmail: string | null;
  weeklyHours: number | null;
  targetHours: number | null;
  loggedHours: number;
  delta: number | null;
}

interface Props {
  isAdmin: boolean;
}

type Mode = "week" | "month";

function periodBounds(mode: Mode, ref: Date) {
  return mode === "week"
    ? { from: startOfWeek(ref, { weekStartsOn: 1 }), to: endOfWeek(ref, { weekStartsOn: 1 }) }
    : { from: startOfMonth(ref), to: endOfMonth(ref) };
}

function periodLabel(mode: Mode, ref: Date) {
  const { from, to } = periodBounds(mode, ref);
  if (mode === "week") {
    const weekNum = getISOWeek(from);
    const fromStr = from.toLocaleDateString("nl-NL", { day: "numeric", month: "short" });
    const toStr = to.toLocaleDateString("nl-NL", { day: "numeric", month: "short", year: "numeric" });
    return `Week ${weekNum}, ${fromStr} – ${toStr}`;
  }
  return ref.toLocaleDateString("nl-NL", { month: "long", year: "numeric" });
}

function navigate(mode: Mode, ref: Date, dir: 1 | -1): Date {
  if (mode === "week") return dir === 1 ? addWeeks(ref, 1) : subWeeks(ref, 1);
  return dir === 1 ? addMonths(ref, 1) : subMonths(ref, 1);
}

function deltaColor(delta: number | null) {
  if (delta == null) return "";
  if (delta >= 0) return "text-green-600";
  if (delta >= -10) return "text-amber-600";
  return "text-red-600";
}

export function HoursOverviewClient({ isAdmin }: Props) {
  const [mode, setMode] = useState<Mode>("week");
  const [ref, setRef] = useState<Date>(new Date());
  const [data, setData] = useState<OverviewEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState<Set<string>>(new Set());
  const [sending, setSending] = useState<Set<string>>(new Set());

  const { from, to } = periodBounds(mode, ref);
  const fromStr = format(from, "yyyy-MM-dd");
  const toStr = format(to, "yyyy-MM-dd");
  const label = periodLabel(mode, ref);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetch(`/api/hours-overview?from=${fromStr}&to=${toStr}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (!cancelled) { if (d) setData(d); setLoading(false); } });
    return () => { cancelled = true; };
  }, [fromStr, toStr]);

  async function sendReminder(entry: OverviewEntry) {
    if (!entry.targetHours) return;
    setSending((prev) => new Set(prev).add(entry.userId));
    const res = await fetch("/api/hours-overview/remind", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        userId: entry.userId,
        periodLabel: label,
        hoursLogged: entry.loggedHours,
        hoursExpected: entry.targetHours,
      }),
    });
    setSending((prev) => { const s = new Set(prev); s.delete(entry.userId); return s; });
    if (res.ok) setSent((prev) => new Set(prev).add(entry.userId));
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Uren Overzicht</h1>
        <p className="text-muted-foreground">Bijhouden wie uren heeft ingevuld</p>
      </div>

      <Card>
        <CardHeader>
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <CardTitle>
              <div className="flex items-center gap-1">
                <Button variant="ghost" size="icon" onClick={() => setRef((r) => navigate(mode, r, -1))}>
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <span className="text-base font-semibold min-w-56 text-center">{label}</span>
                <Button variant="ghost" size="icon" onClick={() => setRef((r) => navigate(mode, r, 1))}>
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </CardTitle>
            <div className="flex gap-1 rounded-md border p-1 w-fit">
              <Button
                variant={mode === "week" ? "default" : "ghost"}
                size="sm"
                onClick={() => setMode("week")}
              >
                Week
              </Button>
              <Button
                variant={mode === "month" ? "default" : "ghost"}
                size="sm"
                onClick={() => setMode("month")}
              >
                Maand
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Medewerker</TableHead>
                <TableHead className="text-right">Uren/week</TableHead>
                <TableHead className="text-right">Target</TableHead>
                <TableHead className="text-right">Gelogd</TableHead>
                <TableHead className="text-right">Verschil</TableHead>
                <TableHead>Status</TableHead>
                {isAdmin && <TableHead></TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading && (
                <TableRow>
                  <TableCell colSpan={isAdmin ? 7 : 6} className="text-center text-muted-foreground py-8">
                    Laden...
                  </TableCell>
                </TableRow>
              )}
              {!loading && data.length === 0 && (
                <TableRow>
                  <TableCell colSpan={isAdmin ? 7 : 6} className="text-center text-muted-foreground py-8">
                    Geen medewerkers gevonden
                  </TableCell>
                </TableRow>
              )}
              {!loading && data.map((entry) => {
                const hasSent = sent.has(entry.userId);
                const isSending = sending.has(entry.userId);
                const canRemind = isAdmin && entry.targetHours != null && entry.userEmail && !hasSent;

                return (
                  <TableRow key={entry.userId}>
                    <TableCell className="font-medium">{entry.userName}</TableCell>
                    <TableCell className="text-right font-mono">
                      {entry.weeklyHours != null ? `${entry.weeklyHours}u` : <span className="text-muted-foreground">—</span>}
                    </TableCell>
                    <TableCell className="text-right font-mono">
                      {entry.targetHours != null ? formatHours(entry.targetHours) : <span className="text-muted-foreground">—</span>}
                    </TableCell>
                    <TableCell className="text-right font-mono">{formatHours(entry.loggedHours)}</TableCell>
                    <TableCell className={`text-right font-mono font-medium ${deltaColor(entry.delta)}`}>
                      {entry.delta != null
                        ? (entry.delta >= 0 ? `+${entry.delta.toFixed(1)}` : entry.delta.toFixed(1)) + "u"
                        : <span className="text-muted-foreground">—</span>}
                    </TableCell>
                    <TableCell>
                      {entry.targetHours == null ? (
                        <Badge variant="secondary">Geen target</Badge>
                      ) : (entry.delta ?? 0) >= 0 ? (
                        <Badge variant="success">Op schema</Badge>
                      ) : (
                        <Badge variant="destructive">Achter</Badge>
                      )}
                    </TableCell>
                    {isAdmin && (
                      <TableCell className="text-right">
                        {hasSent ? (
                          <span className="flex items-center gap-1 text-xs text-green-600 justify-end">
                            <Check className="h-3.5 w-3.5" /> Verzonden
                          </span>
                        ) : (
                          <Button
                            variant="outline"
                            size="sm"
                            disabled={!canRemind || isSending}
                            onClick={() => sendReminder(entry)}
                          >
                            <Mail className="h-3.5 w-3.5 mr-1.5" />
                            {isSending ? "Versturen..." : "Herinnering"}
                          </Button>
                        )}
                      </TableCell>
                    )}
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
