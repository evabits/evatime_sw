"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { format, addDays } from "date-fns";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow, TableFooter } from "@/components/ui/table";
import { ArrowLeft, Plus, Trash2 } from "lucide-react";
import { formatCurrency } from "@/lib/utils";
import Link from "next/link";

interface Line { description: string; quantity: number; unitPrice: number; }

export function NewQuoteClient({ customers }: { customers: any[] }) {
  const router = useRouter();
  const today = format(new Date(), "yyyy-MM-dd");
  const [customerId, setCustomerId] = useState("");
  const [issueDate, setIssueDate] = useState(today);
  const [validUntil, setValidUntil] = useState(format(addDays(new Date(), 30), "yyyy-MM-dd"));
  const [vatRate, setVatRate] = useState(21);
  const [reference, setReference] = useState("");
  const [subject, setSubject] = useState("");
  const [notes, setNotes] = useState("");
  const [lines, setLines] = useState<Line[]>([{ description: "", quantity: 1, unitPrice: 0 }]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  function updateLine(i: number, field: keyof Line, value: any) {
    setLines((prev) => prev.map((l, idx) => idx === i ? { ...l, [field]: value } : l));
  }

  function addLine() {
    setLines((prev) => [...prev, { description: "", quantity: 1, unitPrice: 0 }]);
  }

  function removeLine(i: number) {
    setLines((prev) => prev.filter((_, idx) => idx !== i));
  }

  const subtotal = lines.reduce((s, l) => s + l.quantity * l.unitPrice, 0);
  const vatAmount = (subtotal * vatRate) / 100;
  const total = subtotal + vatAmount;

  async function submit() {
    if (!customerId) { setError("Selecteer een klant"); return; }
    if (lines.some((l) => !l.description.trim())) { setError("Vul alle omschrijvingen in"); return; }
    setSaving(true);
    setError("");
    const res = await fetch("/api/quotes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ customerId, issueDate, validUntil, vatRate, reference: reference || null, subject: subject || null, notes: notes || null, lines }),
    });
    setSaving(false);
    if (res.ok) {
      const quote = await res.json();
      router.push(`/quotes/${quote.id}`);
    } else {
      const err = await res.json().catch(() => ({}));
      setError(err.error ?? "Fout bij aanmaken");
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" asChild>
          <Link href="/quotes"><ArrowLeft className="h-4 w-4" /></Link>
        </Button>
        <div>
          <h1 className="text-2xl font-bold">Nieuwe offerte</h1>
          <p className="text-muted-foreground">Maak een offerte aan voor een klant</p>
        </div>
      </div>

      {error && <p className="text-sm text-destructive bg-destructive/10 px-4 py-2 rounded-md">{error}</p>}

      <Card>
        <CardContent className="pt-6">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1 sm:col-span-2">
              <Label>Klant *</Label>
              <Select value={customerId} onValueChange={setCustomerId}>
                <SelectTrigger><SelectValue placeholder="Selecteer klant" /></SelectTrigger>
                <SelectContent>
                  {customers.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Datum</Label>
              <Input type="date" value={issueDate} onChange={(e) => setIssueDate(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label>Geldig tot</Label>
              <Input type="date" value={validUntil} onChange={(e) => setValidUntil(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label>Kenmerk</Label>
              <Input value={reference} onChange={(e) => setReference(e.target.value)} placeholder="Optioneel" />
            </div>
            <div className="space-y-1">
              <Label>Onderwerp</Label>
              <Input value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="Optioneel" />
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>Regels</CardTitle>
            <Button size="sm" variant="outline" onClick={addLine}>
              <Plus className="h-4 w-4 mr-2" /> Regel toevoegen
            </Button>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Omschrijving</TableHead>
                <TableHead className="w-24 text-right">Aantal</TableHead>
                <TableHead className="w-28 text-right">Prijs (€)</TableHead>
                <TableHead className="w-28 text-right">Totaal</TableHead>
                <TableHead className="w-10" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {lines.map((line, i) => (
                <TableRow key={i}>
                  <TableCell>
                    <Input value={line.description} onChange={(e) => updateLine(i, "description", e.target.value)} className="h-8" placeholder="Omschrijving" />
                  </TableCell>
                  <TableCell>
                    <Input type="number" step="0.01" min="0" value={line.quantity} onChange={(e) => updateLine(i, "quantity", Number(e.target.value))} className="h-8 text-right" />
                  </TableCell>
                  <TableCell>
                    <Input type="number" step="0.01" min="0" value={line.unitPrice} onChange={(e) => updateLine(i, "unitPrice", Number(e.target.value))} className="h-8 text-right" />
                  </TableCell>
                  <TableCell className="text-right">{formatCurrency(line.quantity * line.unitPrice)}</TableCell>
                  <TableCell>
                    {lines.length > 1 && (
                      <Button variant="ghost" size="icon" onClick={() => removeLine(i)}>
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
            <TableFooter>
              <TableRow>
                <TableCell colSpan={3} className="text-right text-xs text-muted-foreground">BTW %</TableCell>
                <TableCell>
                  <Input type="number" min="0" max="100" value={vatRate} onChange={(e) => setVatRate(Number(e.target.value))} className="h-8 text-right w-20 ml-auto" />
                </TableCell>
                <TableCell />
              </TableRow>
              <TableRow>
                <TableCell colSpan={3} className="text-right text-muted-foreground">Subtotaal</TableCell>
                <TableCell className="text-right">{formatCurrency(subtotal)}</TableCell>
                <TableCell />
              </TableRow>
              <TableRow>
                <TableCell colSpan={3} className="text-right text-muted-foreground">BTW ({vatRate}%)</TableCell>
                <TableCell className="text-right">{formatCurrency(vatAmount)}</TableCell>
                <TableCell />
              </TableRow>
              <TableRow>
                <TableCell colSpan={3} className="text-right font-bold text-base">Totaal</TableCell>
                <TableCell className="text-right font-bold text-base">{formatCurrency(total)}</TableCell>
                <TableCell />
              </TableRow>
            </TableFooter>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">Opmerkingen</CardTitle></CardHeader>
        <CardContent>
          <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} placeholder="Optionele opmerkingen of voorwaarden..." />
        </CardContent>
      </Card>

      <div className="flex gap-2">
        <Button onClick={submit} disabled={saving}>{saving ? "Aanmaken..." : "Offerte aanmaken"}</Button>
        <Button variant="outline" asChild><Link href="/quotes">Annuleren</Link></Button>
      </div>
    </div>
  );
}
