"use client";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { weekTotal, type WeekSchedule } from "@/lib/work-schedule";

const LEEG: WeekSchedule = { monday: 0, tuesday: 0, wednesday: 0, thursday: 0, friday: 0 };

const VELDEN: Array<{ key: keyof WeekSchedule; label: string }> = [
  { key: "monday", label: "Ma" },
  { key: "tuesday", label: "Di" },
  { key: "wednesday", label: "Wo" },
  { key: "thursday", label: "Do" },
  { key: "friday", label: "Vr" },
];

interface Props {
  employeeId: string;
  initialSchedule: WeekSchedule | null;
  weeklyHours: number | null;
}

export function WorkScheduleClient({ employeeId, initialSchedule, weeklyHours }: Props) {
  const [rooster, setRooster] = useState<WeekSchedule>(initialSchedule ?? LEEG);
  const [bestaat, setBestaat] = useState(initialSchedule !== null);
  const [loading, setLoading] = useState(false);
  const [fout, setFout] = useState("");

  const totaal = weekTotal(rooster);
  const wijktAf = weeklyHours !== null && Math.round(totaal * 100) !== Math.round(weeklyHours * 100);

  async function opslaan() {
    setLoading(true);
    setFout("");
    try {
      const res = await fetch(`/api/work-schedules/${employeeId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(rooster),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setFout(body.error ?? `Fout ${res.status}`);
        return;
      }
      setRooster(body);
      setBestaat(true);
    } finally {
      setLoading(false);
    }
  }

  async function verwijderen() {
    if (!confirm("Weet u zeker dat u het weekrooster wilt verwijderen? Deze medewerker valt dan terug op de standaardberekening.")) return;
    setLoading(true);
    setFout("");
    try {
      const res = await fetch(`/api/work-schedules/${employeeId}`, { method: "DELETE" });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setFout(body.error ?? `Fout ${res.status}`);
        return;
      }
      setRooster(LEEG);
      setBestaat(false);
    } finally {
      setLoading(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Weekrooster</CardTitle>
        <CardDescription>
          Hoeveel uur deze medewerker op elke weekdag werkt. Zonder rooster blijft de
          urenherinnering rekenen met de weekuren gedeeld over vijf dagen.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap gap-3">
          {VELDEN.map((v) => (
            <div key={v.key} className="space-y-1">
              <Label>{v.label}</Label>
              <Input
                type="number"
                step="0.25"
                min="0"
                max="24"
                className="w-20"
                value={rooster[v.key]}
                onChange={(e) =>
                  setRooster((prev) => ({ ...prev, [v.key]: Number(e.target.value) || 0 }))
                }
              />
            </div>
          ))}
        </div>

        <p className="text-sm">
          <span className="font-medium tabular-nums">{totaal.toFixed(2)}</span> uur per week
        </p>

        {wijktAf && (
          <p className="text-sm text-muted-foreground">
            Weekuren staan op {weeklyHours!.toFixed(2)} — dit rooster telt op tot {totaal.toFixed(2)}.
          </p>
        )}

        {fout && <p className="text-sm text-destructive">{fout}</p>}

        <div className="flex gap-2">
          <Button onClick={opslaan} disabled={loading}>
            {loading ? "Opslaan..." : bestaat ? "Rooster bijwerken" : "Rooster instellen"}
          </Button>
          {bestaat && (
            <Button variant="outline" onClick={verwijderen} disabled={loading}>
              Rooster verwijderen
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
