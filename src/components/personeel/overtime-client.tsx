"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { formatDate, formatHours } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Plus, Pencil, Trash2 } from "lucide-react";
import type { LedgerLine, MonthKey } from "@/lib/overtime";

/** "2026-09" -> "september 2026", net als de periode-titel van het uren-overzicht. */
function monthLabel(key: MonthKey): string {
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
function signed(hours: number): string {
  if (hours > 0) return `+${formatHours(hours)}`;
  if (hours < 0) return `-${formatHours(Math.abs(hours))}`;
  return formatHours(0);
}

function lineKey(line: LedgerLine): string {
  if (line.kind === "opening") return "opening";
  if (line.kind === "month") return line.key;
  return line.id;
}

interface OvertimeUser {
  id: string;
  // Verplicht op de PUT-route, ongeacht welk veld dit scherm bewerkt — zie
  // saveOpening() hieronder.
  name: string;
  email: string;
  role: "ADMIN" | "FINANCE" | "TEAMLEAD" | "EMPLOYEE";
  overtimeOpeningDate: string | null;
  overtimeOpeningHours: number | null;
}

interface Props {
  user: OvertimeUser;
  lines: LedgerLine[];
  saldo: number;
  lopend: { key: MonthKey; geboekt: number; target: number | null } | null;
}

export function OvertimeClient({ user, lines, saldo, lopend }: Props) {
  const router = useRouter();

  const [openingOpen, setOpeningOpen] = useState(false);
  const [openingDate, setOpeningDate] = useState(user.overtimeOpeningDate ?? "");
  const [openingHours, setOpeningHours] = useState(
    user.overtimeOpeningHours != null ? String(user.overtimeOpeningHours) : "",
  );
  const [openingLoading, setOpeningLoading] = useState(false);
  const [openingError, setOpeningError] = useState("");

  const [adjustOpen, setAdjustOpen] = useState(false);
  const [adjustDate, setAdjustDate] = useState("");
  const [adjustHours, setAdjustHours] = useState("");
  const [adjustReason, setAdjustReason] = useState("");
  const [adjustLoading, setAdjustLoading] = useState(false);
  const [adjustError, setAdjustError] = useState("");

  function openOpeningDialog() {
    setOpeningDate(user.overtimeOpeningDate ?? "");
    setOpeningHours(user.overtimeOpeningHours != null ? String(user.overtimeOpeningHours) : "");
    setOpeningError("");
    setOpeningOpen(true);
  }

  function openAdjustDialog() {
    setAdjustDate("");
    setAdjustHours("");
    setAdjustReason("");
    setAdjustError("");
    setAdjustOpen(true);
  }

  async function saveOpening() {
    setOpeningLoading(true);
    setOpeningError("");
    try {
      const res = await fetch(`/api/users/${user.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          // name/email/role zijn verplichte velden op deze route, ook al
          // wijzigt dit scherm ze niet. De overige velden (weeklyHours,
          // workLevel, vacatie-beginstand) laten we weg: die worden alleen
          // weggeschreven als de sleutel meekomt, dus ontbreken ze hier blijft
          // de bestaande waarde ongemoeid — zie de `!== undefined`-guards in
          // /api/users/[id].
          name: user.name,
          email: user.email,
          role: user.role,
          overtimeOpeningDate: openingDate,
          overtimeOpeningHours: openingHours,
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setOpeningError(body.error ?? "Fout bij opslaan");
        return;
      }
      setOpeningOpen(false);
      router.refresh();
    } finally {
      setOpeningLoading(false);
    }
  }

  async function saveAdjustment() {
    setAdjustLoading(true);
    setAdjustError("");
    try {
      const res = await fetch("/api/overtime-adjustments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId: user.id,
          date: adjustDate,
          hours: Number(adjustHours),
          reason: adjustReason,
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setAdjustError(body.error ?? "Fout bij opslaan");
        return;
      }
      setAdjustOpen(false);
      router.refresh();
    } finally {
      setAdjustLoading(false);
    }
  }

  async function deleteAdjustment(id: string) {
    if (!confirm("Deze mutatie verwijderen?")) return;
    const res = await fetch(`/api/overtime-adjustments/${id}`, { method: "DELETE" });
    if (res.ok) router.refresh();
  }

  return (
    <>
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Urensaldo</CardTitle>
              <CardDescription>
                Doorlopend saldo van geboekte uren tegenover het contract, vanaf de beginstand
              </CardDescription>
            </div>
            {user.overtimeOpeningDate && (
              <div className="flex gap-2">
                <Button size="sm" variant="outline" onClick={openOpeningDialog}>
                  <Pencil className="h-4 w-4 mr-2" /> Beginstand
                </Button>
                <Button size="sm" onClick={openAdjustDialog}>
                  <Plus className="h-4 w-4 mr-2" /> Mutatie
                </Button>
              </div>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {!user.overtimeOpeningDate ? (
            <div className="flex items-center justify-between">
              <p className="text-sm text-muted-foreground">Nog geen beginstand ingesteld voor het urensaldo.</p>
              <Button size="sm" variant="outline" onClick={openOpeningDialog}>Beginstand instellen</Button>
            </div>
          ) : (
            <div className="space-y-3">
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
                      {line.kind === "adjustment" && (
                        <Button variant="ghost" size="icon" onClick={() => deleteAdjustment(line.id)}>
                          <Trash2 className="h-3.5 w-3.5 text-destructive" />
                        </Button>
                      )}
                    </div>
                  </div>
                ))}
              </div>

              <div className="flex items-center justify-between border-t pt-2 font-medium">
                <span>Saldo</span>
                <span className={saldo < 0 ? "text-destructive" : ""}>{signed(saldo)}</span>
              </div>

              {lopend && (
                <div className="flex items-center justify-between text-sm text-muted-foreground">
                  <span>{monthLabel(lopend.key)} — loopt nog</span>
                  <span>
                    geboekt {formatHours(lopend.geboekt)}
                    {lopend.target != null && ` / target ${formatHours(lopend.target)}`}
                  </span>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={openingOpen} onOpenChange={(open) => { if (!open) setOpeningOpen(false); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>{user.overtimeOpeningDate ? "Beginstand aanpassen" : "Beginstand instellen"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <Label>Peildatum</Label>
              <input
                type="date"
                className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm"
                value={openingDate}
                onChange={(e) => setOpeningDate(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">Moet op de eerste van een maand liggen. Leeg wist de beginstand.</p>
            </div>
            <div className="space-y-1">
              <Label>Uren op de peildatum</Label>
              <Input
                type="number"
                step="0.1"
                placeholder="0"
                value={openingHours}
                onChange={(e) => setOpeningHours(e.target.value)}
              />
            </div>
            {openingError && <p className="text-sm text-destructive">{openingError}</p>}
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpeningOpen(false)}>Annuleren</Button>
            <Button type="button" disabled={openingLoading} onClick={saveOpening}>
              {openingLoading ? "Opslaan..." : "Opslaan"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={adjustOpen} onOpenChange={(open) => { if (!open) setAdjustOpen(false); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Mutatie toevoegen</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <Label>Datum</Label>
              <input
                type="date"
                className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm"
                value={adjustDate}
                onChange={(e) => setAdjustDate(e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <Label>Uren</Label>
              <Input
                type="number"
                step="0.1"
                placeholder="bijv. -8 of 4"
                value={adjustHours}
                onChange={(e) => setAdjustHours(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">Positief telt op bij het saldo, negatief (bijv. uitbetaald) trekt af.</p>
            </div>
            <div className="space-y-1">
              <Label>Reden *</Label>
              <Input
                placeholder="Bijv. uitbetaald bij salaris"
                value={adjustReason}
                onChange={(e) => setAdjustReason(e.target.value)}
              />
            </div>
            {adjustError && <p className="text-sm text-destructive">{adjustError}</p>}
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setAdjustOpen(false)}>Annuleren</Button>
            <Button type="button" disabled={adjustLoading} onClick={saveAdjustment}>
              {adjustLoading ? "Opslaan..." : "Toevoegen"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
