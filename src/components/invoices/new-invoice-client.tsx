"use client";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { format, addDays } from "date-fns";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow, TableFooter } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { formatDate, formatHours, formatCurrency } from "@/lib/utils";
import { resolveHourRate, effectiveWorkLevel } from "@/lib/rates";
import { WORK_LEVEL_LABELS } from "@/lib/work-levels";
import { ArrowLeft, Plus, Trash2 } from "lucide-react";
import Link from "next/link";

interface Props {
  customers: { id: string; name: string }[];
}

interface InvoiceLine {
  description: string;
  quantity: number;
  unitPrice: number;
  lineType: "HOURS" | "KM" | "OTHER";
  timeEntryIds?: string[];
  kmEntryIds?: string[];
}

export function NewInvoiceClient({ customers }: Props) {
  const router = useRouter();
  const [customerId, setCustomerId] = useState("");
  const [issueDate, setIssueDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const [dueDate, setDueDate] = useState(format(addDays(new Date(), 30), "yyyy-MM-dd"));
  const [vatRate, setVatRate] = useState(21);
  const [notes, setNotes] = useState("");
  const [lines, setLines] = useState<InvoiceLine[]>([]);
  const [unbilledTime, setUnbilledTime] = useState<any[]>([]);
  const [unbilledKm, setUnbilledKm] = useState<any[]>([]);
  const [selectedTimeIds, setSelectedTimeIds] = useState<Set<string>>(new Set());
  const [selectedKmIds, setSelectedKmIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!customerId) { setUnbilledTime([]); setUnbilledKm([]); return; }
    Promise.all([
      fetch(`/api/time?customerId=${customerId}`).then((r) => r.json()),
      fetch(`/api/km?customerId=${customerId}`).then((r) => r.json()),
    ]).then(([time, km]) => {
      setUnbilledTime(time.filter((e: any) => !e.invoiced && e.billable));
      setUnbilledKm(km.filter((e: any) => !e.invoiced && e.billable));
    });
  }, [customerId]);

  function toggleTimeEntry(id: string) {
    setSelectedTimeIds((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  function toggleKmEntry(id: string) {
    setSelectedKmIds((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  function addLinesFromSelection() {
    const newLines: InvoiceLine[] = [];

    const selectedTime = unbilledTime.filter((e) => selectedTimeIds.has(e.id));
    const withRate = selectedTime.filter((e) => resolveHourRate(e) != null);
    if (withRate.length > 0) {
      const grouped = new Map<string, typeof withRate>();
      withRate.forEach((e) => {
        const key = `${e.activityType?.name ?? "Werkzaamheden"}|${resolveHourRate(e)}`;
        if (!grouped.has(key)) grouped.set(key, []);
        grouped.get(key)!.push(e);
      });

      // Splitst één activiteit in meerdere regels zodra er meerdere tarieven in
      // zitten; dan pas komt het niveau in de omschrijving, zodat facturen met
      // één tarief er ongewijzigd uitzien.
      const labelCounts = new Map<string, number>();
      grouped.forEach((_v, key) => {
        const label = key.split("|")[0];
        labelCounts.set(label, (labelCounts.get(label) ?? 0) + 1);
      });

      grouped.forEach((entries, key) => {
        const label = key.split("|")[0];
        const rate = resolveHourRate(entries[0])!;
        const level = effectiveWorkLevel(entries[0]);
        const description =
          (labelCounts.get(label) ?? 0) > 1 && level
            ? `${label} (${WORK_LEVEL_LABELS[level]})`
            : label;
        newLines.push({
          description,
          quantity: entries.reduce((s, e) => s + Number(e.hours), 0),
          unitPrice: rate,
          lineType: "HOURS",
          timeEntryIds: entries.map((e) => e.id),
        });
      });
    }

    const selectedKm = unbilledKm.filter((e) => selectedKmIds.has(e.id));
    if (selectedKm.length > 0) {
      const totalKm = selectedKm.reduce((s, e) => s + Number(e.km), 0);
      const rate = Number(selectedKm[0].rateOverride ?? selectedKm[0].project?.defaultKmRate ?? 0);
      newLines.push({
        description: "Reiskosten",
        quantity: totalKm,
        unitPrice: rate,
        lineType: "KM",
        kmEntryIds: selectedKm.map((e) => e.id),
      });
    }

    setLines((prev) => [...prev, ...newLines]);
    setSelectedTimeIds(new Set());
    setSelectedKmIds(new Set());
  }

  function updateLine(i: number, field: keyof InvoiceLine, value: any) {
    setLines((prev) => prev.map((l, idx) => idx === i ? { ...l, [field]: value } : l));
  }

  function removeLine(i: number) {
    setLines((prev) => prev.filter((_, idx) => idx !== i));
  }

  const subtotal = lines.reduce((s, l) => s + l.quantity * l.unitPrice, 0);
  const vatAmount = (subtotal * vatRate) / 100;
  const total = subtotal + vatAmount;

  async function createInvoice() {
    if (!customerId || lines.length === 0) return;
    setLoading(true);
    const res = await fetch("/api/invoices", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ customerId, issueDate, dueDate, vatRate, notes, lines }),
    });
    if (res.ok) {
      const invoice = await res.json();
      router.push(`/invoices/${invoice.id}`);
    }
    setLoading(false);
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" asChild>
          <Link href="/invoices"><ArrowLeft className="h-4 w-4" /></Link>
        </Button>
        <div>
          <h1 className="text-2xl font-bold">Nieuwe factuur</h1>
          <p className="text-muted-foreground">Maak een nieuwe factuur aan</p>
        </div>
      </div>

      <Card>
        <CardHeader><CardTitle>Factuurgegevens</CardTitle></CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div className="space-y-1 lg:col-span-2">
            <Label>Klant *</Label>
            <Select value={customerId} onValueChange={setCustomerId}>
              <SelectTrigger><SelectValue placeholder="Selecteer klant" /></SelectTrigger>
              <SelectContent>{customers.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label>Factuurdatum</Label>
            <Input type="date" value={issueDate} onChange={(e) => setIssueDate(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label>Vervaldatum</Label>
            <Input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label>BTW (%)</Label>
            <Input type="number" min="0" max="100" value={vatRate} onChange={(e) => setVatRate(Number(e.target.value))} />
          </div>
          <div className="space-y-1 lg:col-span-3">
            <Label>Notities</Label>
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={1} />
          </div>
        </CardContent>
      </Card>

      {customerId && (unbilledTime.length > 0 || unbilledKm.length > 0) && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>Niet-gefactureerde registraties</CardTitle>
              <Button size="sm" onClick={addLinesFromSelection} disabled={selectedTimeIds.size === 0 && selectedKmIds.size === 0}>
                <Plus className="h-4 w-4 mr-2" /> Toevoegen aan factuur
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {unbilledTime.length > 0 && (
              <div>
                <p className="text-sm font-medium mb-2">Uren</p>
                {unbilledTime.some((e) => resolveHourRate(e) == null) && (
                  <p className="text-sm text-muted-foreground px-4 py-2">
                    Sommige uren hebben geen tarief. Stel een tarief in bij de klant of het project, of zet een handmatig tarief op de regel.
                  </p>
                )}
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-8"></TableHead>
                      <TableHead>Datum</TableHead>
                      <TableHead>Project</TableHead>
                      <TableHead>Activiteit</TableHead>
                      <TableHead>Omschrijving</TableHead>
                      <TableHead className="text-right">Uren</TableHead>
                      <TableHead className="text-right">Tarief</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {unbilledTime.map((e) => {
                      const rate = resolveHourRate(e);
                      return (
                      <TableRow key={e.id} className={selectedTimeIds.has(e.id) ? "bg-primary/5" : ""}>
                        <TableCell>
                          <input
                            type="checkbox"
                            checked={selectedTimeIds.has(e.id)}
                            onChange={() => toggleTimeEntry(e.id)}
                            disabled={rate == null}
                            className="h-4 w-4"
                          />
                        </TableCell>
                        <TableCell className="whitespace-nowrap">{formatDate(e.date)}</TableCell>
                        <TableCell>{e.project?.name}</TableCell>
                        <TableCell>{e.activityType?.name ?? "—"}</TableCell>
                        <TableCell className="max-w-32 truncate">{e.description ?? "—"}</TableCell>
                        <TableCell className="text-right">{formatHours(Number(e.hours))}</TableCell>
                        <TableCell className="text-right">
                          {rate == null
                            ? <Badge variant="secondary" className="text-xs">Geen tarief</Badge>
                            : formatCurrency(rate)}
                        </TableCell>
                      </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            )}
            {unbilledKm.length > 0 && (
              <div>
                <p className="text-sm font-medium mb-2">Kilometers</p>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-8"></TableHead>
                      <TableHead>Datum</TableHead>
                      <TableHead>Project</TableHead>
                      <TableHead>Omschrijving</TableHead>
                      <TableHead className="text-right">Km</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {unbilledKm.map((e) => (
                      <TableRow key={e.id} className={selectedKmIds.has(e.id) ? "bg-primary/5" : ""}>
                        <TableCell>
                          <input type="checkbox" checked={selectedKmIds.has(e.id)} onChange={() => toggleKmEntry(e.id)} className="h-4 w-4" />
                        </TableCell>
                        <TableCell className="whitespace-nowrap">{formatDate(e.date)}</TableCell>
                        <TableCell>{e.project?.name}</TableCell>
                        <TableCell className="max-w-32 truncate">{e.description ?? "—"}</TableCell>
                        <TableCell className="text-right">{Number(e.km).toFixed(1)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>Factuurregels</CardTitle>
            <Button size="sm" variant="outline" onClick={() => setLines((prev) => [...prev, { description: "", quantity: 1, unitPrice: 0, lineType: "OTHER" }])}>
              <Plus className="h-4 w-4 mr-2" /> Handmatig toevoegen
            </Button>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Omschrijving</TableHead>
                <TableHead className="text-right w-24">Aantal</TableHead>
                <TableHead className="text-right w-28">Prijs</TableHead>
                <TableHead className="text-right w-28">Totaal</TableHead>
                <TableHead className="w-10"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {lines.length === 0 && (
                <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-6 text-sm">Voeg regels toe via de selectie hierboven of handmatig</TableCell></TableRow>
              )}
              {lines.map((line, i) => (
                <TableRow key={i}>
                  <TableCell>
                    <Input value={line.description} onChange={(e) => updateLine(i, "description", e.target.value)} placeholder="Omschrijving" />
                  </TableCell>
                  <TableCell>
                    <Input type="number" step="0.01" className="text-right" value={line.quantity} onChange={(e) => updateLine(i, "quantity", Number(e.target.value))} />
                  </TableCell>
                  <TableCell>
                    <Input type="number" step="0.01" className="text-right" value={line.unitPrice} onChange={(e) => updateLine(i, "unitPrice", Number(e.target.value))} />
                  </TableCell>
                  <TableCell className="text-right font-medium">{formatCurrency(line.quantity * line.unitPrice)}</TableCell>
                  <TableCell>
                    <Button variant="ghost" size="icon" onClick={() => removeLine(i)}>
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
            {lines.length > 0 && (
              <TableFooter>
                <TableRow>
                  <TableCell colSpan={3} className="text-right">Subtotaal</TableCell>
                  <TableCell className="text-right">{formatCurrency(subtotal)}</TableCell>
                  <TableCell />
                </TableRow>
                <TableRow>
                  <TableCell colSpan={3} className="text-right">BTW ({vatRate}%)</TableCell>
                  <TableCell className="text-right">{formatCurrency(vatAmount)}</TableCell>
                  <TableCell />
                </TableRow>
                <TableRow>
                  <TableCell colSpan={3} className="text-right font-bold">Totaal</TableCell>
                  <TableCell className="text-right font-bold">{formatCurrency(total)}</TableCell>
                  <TableCell />
                </TableRow>
              </TableFooter>
            )}
          </Table>
        </CardContent>
      </Card>

      <div className="flex gap-2">
        <Button onClick={createInvoice} disabled={loading || !customerId || lines.length === 0}>
          {loading ? "Aanmaken..." : "Factuur aanmaken"}
        </Button>
        <Button variant="outline" asChild><Link href="/invoices">Annuleren</Link></Button>
      </div>
    </div>
  );
}
