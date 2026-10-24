"use client";
import { useState, useEffect } from "react";
import { format } from "date-fns";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { MemberPicker } from "@/components/shared/member-picker";
import { formatHoursDecimal } from "@/lib/utils";
import { readHiddenIds, hiddenStorageKey } from "@/lib/hidden-members";

type ContractType = "PERMANENT" | "FIXED_TERM" | "ZERO_HOURS";

interface PayrollRow {
  userId: string;
  name: string;
  contractType: ContractType;
  contractHours: number | null;
  workedHours: number;
  wbsoHours: number;
  overtime: number | null;
  km: number;
  /** Overurensaldo aan het eind van de maand; null zonder beginstand. */
  saldo: number | null;
}

const contractLabel: Record<ContractType, string> = {
  PERMANENT: "Vast",
  FIXED_TERM: "Bepaalde tijd",
  ZERO_HOURS: "0-uren",
};

export function PayrollClient({ userId }: { userId: string }) {
  const [month, setMonth] = useState(() => format(new Date(), "yyyy-MM"));
  const [data, setData] = useState<PayrollRow[]>([]);
  const [loading, setLoading] = useState(false);
  // Wie er weggeklikt is. Leeg betekent iedereen in beeld, dus het scherm
  // gedraagt zich als voorheen tot er zelf iets uit gaat.
  const [verborgen, setVerborgen] = useState<string[]>([]);
  const [kiezerOpen, setKiezerOpen] = useState(false);
  const opslagSleutel = hiddenStorageKey("payroll", userId);

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

  const [herlaad, setHerlaad] = useState(0);

  // Uitbetalen = een negatieve mutatie, standaard op de laatste dag van deze maand.
  const [betaal, setBetaal] = useState<{ row: PayrollRow; uren: string; datum: string; reden: string } | null>(null);
  const [betaalFout, setBetaalFout] = useState("");
  const [betaalBezig, setBetaalBezig] = useState(false);

  function openUitbetalen(row: PayrollRow) {
    const [j, m] = month.split("-").map(Number);
    const maandNaam = new Date(j, m - 1, 1).toLocaleDateString("nl-NL", { month: "long", year: "numeric" });
    setBetaalFout("");
    setBetaal({
      row,
      uren: row.saldo && row.saldo > 0 ? String(row.saldo) : "",
      datum: `${month}-${String(new Date(j, m, 0).getDate()).padStart(2, "0")}`,
      reden: `Uitbetaald bij salaris ${maandNaam}`,
    });
  }

  async function bevestigUitbetalen() {
    if (!betaal) return;
    const uren = Number(betaal.uren.replace(",", "."));
    if (!(uren > 0)) { setBetaalFout("Vul een positief aantal uren in"); return; }
    if (!betaal.datum) { setBetaalFout("Vul een datum in"); return; }
    setBetaalBezig(true);
    setBetaalFout("");
    try {
      const res = await fetch("/api/overtime-adjustments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: betaal.row.userId, date: betaal.datum, hours: -uren, reason: betaal.reden }),
      });
      if (!res.ok) {
        setBetaalFout((await res.json().catch(() => ({}))).error ?? `Fout ${res.status}`);
        return;
      }
      setBetaal(null);
      setHerlaad((n) => n + 1);
    } catch {
      setBetaalFout("Netwerkfout, probeer opnieuw");
    } finally {
      setBetaalBezig(false);
    }
  }

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetch(`/api/payroll?month=${month}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!cancelled) {
          if (d) setData(d);
          setLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [month, herlaad]);

  const zichtbaar = data.filter((r) => !verborgen.includes(r.userId));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Loonverwerking</h1>
        <p className="text-muted-foreground">Maandoverzicht per medewerker voor de salarisadministratie</p>
      </div>

      <Card>
        <CardHeader>
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <CardTitle>Overzicht</CardTitle>
            <div className="flex items-center gap-2">
              {data.length > 0 && (
                <Button variant="outline" onClick={() => setKiezerOpen(true)}>
                  In beeld: {zichtbaar.length} van {data.length}
                </Button>
              )}
              <Label htmlFor="month" className="text-sm text-muted-foreground">Maand</Label>
              <Input
                id="month"
                type="month"
                value={month}
                onChange={(e) => setMonth(e.target.value)}
                className="w-40"
              />
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Medewerker</TableHead>
                <TableHead>Contract</TableHead>
                <TableHead className="text-right">Gewerkte uren</TableHead>
                <TableHead className="text-right">WBSO-uren</TableHead>
                <TableHead className="text-right">Overuren</TableHead>
                <TableHead className="text-right">Kilometers</TableHead>
                <TableHead className="text-right">Saldo overuren</TableHead>
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading && (
                <TableRow>
                  <TableCell colSpan={8} className="text-center text-muted-foreground py-8">Laden...</TableCell>
                </TableRow>
              )}
              {!loading && data.length === 0 && (
                <TableRow>
                  <TableCell colSpan={8} className="text-center text-muted-foreground py-8">Geen medewerkers gevonden</TableCell>
                </TableRow>
              )}
              {!loading && data.length > 0 && zichtbaar.length === 0 && (
                <TableRow>
                  <TableCell colSpan={8} className="text-center text-muted-foreground py-8">
                    Iedereen staat uit beeld. Kies wie u wilt zien via &quot;In beeld&quot;.
                  </TableCell>
                </TableRow>
              )}
              {!loading && zichtbaar.map((row) => (
                <TableRow key={row.userId}>
                  <TableCell className="font-medium">{row.name}</TableCell>
                  <TableCell>
                    {contractLabel[row.contractType]}
                    {row.contractHours != null && (
                      <span className="text-muted-foreground"> · {row.contractHours}u/wk</span>
                    )}
                  </TableCell>
                  <TableCell className="text-right font-mono">{formatHoursDecimal(row.workedHours)}</TableCell>
                  <TableCell className="text-right font-mono">{formatHoursDecimal(row.wbsoHours)}</TableCell>
                  <TableCell className="text-right font-mono">
                    {row.overtime != null ? formatHoursDecimal(row.overtime) : <span className="text-muted-foreground">—</span>}
                  </TableCell>
                  {/* Afgerond op hele kilometers: het maandtotaal telt op uit
                      ritten met een decimaal, en 1.398,4 km overtypen in een
                      salarissysteem is precisie die niemand gebruikt. De
                      registraties zelf houden hun decimalen. */}
                  <TableCell className="text-right font-mono">{Math.round(row.km).toLocaleString("nl-NL")} km</TableCell>
                  <TableCell className={`text-right font-mono ${row.saldo != null && row.saldo < 0 ? "text-destructive" : ""}`}>
                    {row.saldo != null ? formatHoursDecimal(row.saldo) : <span className="text-muted-foreground" title="Geen beginstand ingesteld op de personeelspagina">—</span>}
                  </TableCell>
                  <TableCell className="text-right">
                    {row.saldo != null && <Button size="sm" variant="outline" onClick={() => openUitbetalen(row)}>Uitbetalen</Button>}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Dialog open={!!betaal} onOpenChange={(open) => { if (!open) setBetaal(null); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Overuren uitbetalen — {betaal?.row.name}</DialogTitle>
          </DialogHeader>
          {betaal && (
            <div className="space-y-3">
              <div className="space-y-1">
                <Label>Uren</Label>
                <Input type="number" step="0.1" min="0" value={betaal.uren} onChange={(e) => setBetaal({ ...betaal, uren: e.target.value })} autoFocus />
                {betaal.row.saldo != null && <p className="text-xs text-muted-foreground">Saldo: {formatHoursDecimal(betaal.row.saldo)} uur</p>}
              </div>
              <div className="space-y-1">
                <Label>Datum</Label>
                <Input type="date" value={betaal.datum} onChange={(e) => setBetaal({ ...betaal, datum: e.target.value })} />
              </div>
              <div className="space-y-1">
                <Label>Reden</Label>
                <Input value={betaal.reden} onChange={(e) => setBetaal({ ...betaal, reden: e.target.value })} />
              </div>
              {betaalFout && <p className="text-sm text-destructive">{betaalFout}</p>}
            </div>
          )}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setBetaal(null)}>Annuleren</Button>
            <Button type="button" disabled={betaalBezig} onClick={bevestigUitbetalen}>{betaalBezig ? "Bezig..." : "Uitbetalen"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <MemberPicker
        open={kiezerOpen}
        onOpenChange={setKiezerOpen}
        members={data.map((r) => ({ id: r.userId, name: r.name }))}
        hidden={verborgen}
        onChange={bewaarVerborgen}
      />
    </div>
  );
}
