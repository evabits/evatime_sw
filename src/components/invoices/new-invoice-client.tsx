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
import { resolveHourRate } from "@/lib/rates";
import { isBillable } from "@/lib/billable";
import { groupHourEntriesForInvoice, groupKmEntriesForInvoice } from "@/lib/invoice-lines";
import { kmRate } from "@/lib/report-totals";
import { resolvePeriod } from "@/lib/periods";
import { splitInvoicePeriod } from "@/lib/invoice-period";
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

/**
 * Het vinkje in de kolomkop dat een hele lijst aan- of uitzet.
 *
 * `ids` zijn de regels waar het over gaat: bij uren alleen de selecteerbare
 * (een regel zonder tarief heeft een uitgeschakeld vinkje), anders zou de kop
 * nooit op "alles aan" komen te staan.
 *
 * De halve stand is `indeterminate`, en dat is geen attribuut maar een
 * eigenschap van het element — hij moet dus via een ref gezet worden. De ref
 * geeft bewust niets terug: React 19 leest een teruggegeven waarde als
 * opruimfunctie.
 */
function AllesVinkje({
  ids,
  geselecteerd,
  onChange,
}: {
  ids: string[];
  geselecteerd: Set<string>;
  onChange: (next: Set<string>) => void;
}) {
  const aantalAan = ids.filter((id) => geselecteerd.has(id)).length;
  const allesAan = ids.length > 0 && aantalAan === ids.length;

  return (
    <input
      type="checkbox"
      className="h-4 w-4"
      title={allesAan ? "Alles uitvinken" : "Alles aanvinken"}
      checked={allesAan}
      disabled={ids.length === 0}
      ref={(el) => {
        if (el) el.indeterminate = aantalAan > 0 && !allesAan;
      }}
      onChange={() => {
        const next = new Set(geselecteerd);
        for (const id of ids) {
          if (allesAan) next.delete(id);
          else next.add(id);
        }
        onChange(next);
      }}
    />
  );
}

export function NewInvoiceClient({ customers }: Props) {
  const router = useRouter();
  const [customerId, setCustomerId] = useState("");
  const [issueDate, setIssueDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const [dueDate, setDueDate] = useState(format(addDays(new Date(), 30), "yyyy-MM-dd"));
  // Er wordt vrijwel altijd één kalendermaand gefactureerd, en bij het
  // aanmaken is dat de maand die net voorbij is. resolvePeriod is dezelfde
  // functie die de rapportagefilters gebruiken; hij geeft alleen null voor de
  // preset "custom".
  const [periodeVan, setPeriodeVan] = useState(() => resolvePeriod("last-month", new Date())!.from);
  const [periodeTot, setPeriodeTot] = useState(() => resolvePeriod("last-month", new Date())!.to);
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
      setUnbilledTime(time.filter((e: any) => !e.invoiced && isBillable(e) === true));
      setUnbilledKm(km.filter((e: any) => !e.invoiced && isBillable(e) === true));
    });
  }, [customerId]);

  // unbilledTime en unbilledKm blijven ongefilterd — daar zit de achterstand
  // in. Alles wat het scherm toont en gebruikt gaat door de zichtbare lijsten,
  // zodat er niets op de factuur kan belanden wat je niet in beeld hebt.
  const tijdSplitsing = splitInvoicePeriod(unbilledTime, periodeVan, periodeTot);
  const kmSplitsing = splitInvoicePeriod(unbilledKm, periodeVan, periodeTot);
  const zichtbaarTijd = tijdSplitsing.binnen;
  const zichtbaarKm = kmSplitsing.binnen;

  const achterstandAantal = tijdSplitsing.ervoorAantal + kmSplitsing.ervoorAantal;
  // De oudste van de twee lijsten. Sorteren mag op de string, want YYYY-MM-DD
  // loopt lexicografisch gelijk met de kalender.
  const achterstandOudste =
    [tijdSplitsing.ervoorOudste, kmSplitsing.ervoorOudste]
      .filter((d): d is string => d !== null)
      .sort()[0] ?? null;

  // Een aangevinkte regel die buiten de nieuwe periode valt zou onzichtbaar
  // meeliften naar de factuur. Teruggeven van dezelfde Set wanneer er niets
  // afvalt is nodig: een nieuwe Set zou elke render opnieuw state zetten.
  useEffect(() => {
    const zichtbaar = new Set(zichtbaarTijd.map((e) => e.id));
    setSelectedTimeIds((prev) => {
      const next = new Set([...prev].filter((id) => zichtbaar.has(id)));
      return next.size === prev.size ? prev : next;
    });
    const zichtbaarK = new Set(zichtbaarKm.map((e) => e.id));
    setSelectedKmIds((prev) => {
      const next = new Set([...prev].filter((id) => zichtbaarK.has(id)));
      return next.size === prev.size ? prev : next;
    });
    // zichtbaarTijd en zichtbaarKm zijn elke render nieuwe arrays en kunnen
    // dus geen dependency zijn; de waarden waaruit ze volgen wel.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [periodeVan, periodeTot, unbilledTime, unbilledKm]);

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

  function wisselKlant(nieuw: string) {
    // Al toegevoegde regels horen bij de vórige klant en mogen niet meeverhuizen:
    // dat zou een factuur voor deze klant opleveren met de uren van de vorige,
    // die daarbij ook nog als gefactureerd worden weggeschreven. De factuurroute
    // weigert dat inmiddels, maar dan sta je er pas bij het opslaan voor —
    // hier kun je nog kiezen.
    if (
      lines.length > 0 &&
      !confirm("Je hebt al factuurregels toegevoegd. Die vervallen als je van klant wisselt.")
    ) {
      return;
    }
    setLines([]);
    setSelectedTimeIds(new Set());
    setSelectedKmIds(new Set());
    setCustomerId(nieuw);
  }

  function addLinesFromSelection() {
    const newLines: InvoiceLine[] = [];

    const selectedTime = zichtbaarTijd.filter((e) => selectedTimeIds.has(e.id));
    // Groepeert de geselecteerde urenregels tot factuurregels: één regel per
    // project + tarief + werkniveau. Zie invoice-lines.ts voor waarom de
    // sleutel op project-id (niet -naam) en niveau steunt.
    for (const line of groupHourEntriesForInvoice(selectedTime)) {
      newLines.push({ ...line, lineType: "HOURS" });
    }

    const selectedKm = zichtbaarKm.filter((e) => selectedKmIds.has(e.id));
    // Eén regel per tarief. Alles onder het tarief van de eerste selectie
    // scharen factureerde bij twee projecten met verschillende kilometer-
    // tarieven stilzwijgend te weinig.
    for (const line of groupKmEntriesForInvoice(selectedKm)) {
      newLines.push({ ...line, lineType: "KM" });
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
            <Select value={customerId} onValueChange={wisselKlant}>
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
            <div className="grid grid-cols-2 gap-3 sm:max-w-md">
              <div className="space-y-1">
                <Label>Van</Label>
                <Input type="date" value={periodeVan} onChange={(e) => setPeriodeVan(e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label>Tot en met</Label>
                <Input type="date" value={periodeTot} onChange={(e) => setPeriodeTot(e.target.value)} />
              </div>
            </div>
            {zichtbaarTijd.length > 0 && (
              <div>
                <p className="text-sm font-medium mb-2">Uren</p>
                {zichtbaarTijd.some((e) => resolveHourRate(e) == null) && (
                  <p className="text-sm text-muted-foreground px-4 py-2">
                    Sommige uren hebben geen tarief. Stel een tarief in bij de klant of het project, of zet een handmatig tarief op de regel.
                  </p>
                )}
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-8">
                        <AllesVinkje
                          ids={zichtbaarTijd.filter((e) => resolveHourRate(e) != null).map((e) => e.id)}
                          geselecteerd={selectedTimeIds}
                          onChange={setSelectedTimeIds}
                        />
                      </TableHead>
                      <TableHead>Datum</TableHead>
                      <TableHead>Project</TableHead>
                      <TableHead>Omschrijving</TableHead>
                      <TableHead className="text-right">Uren</TableHead>
                      <TableHead className="text-right">Tarief</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {zichtbaarTijd.map((e) => {
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
            {zichtbaarKm.length > 0 && (
              <div>
                <p className="text-sm font-medium mb-2">Kilometers</p>
                {zichtbaarKm.some((e) => kmRate(e) <= 0) && (
                  <p className="text-sm text-muted-foreground px-4 py-2">
                    Sommige ritten hebben geen kilometertarief. Stel er een in bij het project, of zet een handmatig tarief op de rit.
                  </p>
                )}
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-8">
                        <AllesVinkje
                          ids={zichtbaarKm.filter((e) => kmRate(e) > 0).map((e) => e.id)}
                          geselecteerd={selectedKmIds}
                          onChange={setSelectedKmIds}
                        />
                      </TableHead>
                      <TableHead>Datum</TableHead>
                      <TableHead>Project</TableHead>
                      <TableHead>Omschrijving</TableHead>
                      <TableHead className="text-right">Km</TableHead>
                      <TableHead className="text-right">Tarief</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {zichtbaarKm.map((e) => {
                      // Zonder tarief valt de rit weg bij het groeperen, dus hij
                      // mag hier ook niet aan te vinken zijn — anders verdwijnt
                      // een aangevinkte rit zonder uitleg van de factuur.
                      const tarief = kmRate(e);
                      return (
                      <TableRow key={e.id} className={selectedKmIds.has(e.id) ? "bg-primary/5" : ""}>
                        <TableCell>
                          <input
                            type="checkbox"
                            checked={selectedKmIds.has(e.id)}
                            onChange={() => toggleKmEntry(e.id)}
                            disabled={tarief <= 0}
                            className="h-4 w-4"
                          />
                        </TableCell>
                        <TableCell className="whitespace-nowrap">{formatDate(e.date)}</TableCell>
                        <TableCell>{e.project?.name}</TableCell>
                        <TableCell className="max-w-32 truncate">{e.description ?? "—"}</TableCell>
                        <TableCell className="text-right">{Number(e.km).toFixed(1)}</TableCell>
                        <TableCell className="text-right">
                          {tarief <= 0
                            ? <Badge variant="secondary" className="text-xs">Geen tarief</Badge>
                            : formatCurrency(tarief)}
                        </TableCell>
                      </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            )}
            {zichtbaarTijd.length === 0 && zichtbaarKm.length === 0 && (
              <p className="text-sm text-muted-foreground">
                Geen registraties in deze periode.
              </p>
            )}
            {achterstandAantal > 0 && achterstandOudste !== null && (
              <div className="flex flex-wrap items-center gap-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm dark:border-amber-900 dark:bg-amber-950/30">
                <span>
                  Nog {achterstandAantal} {achterstandAantal === 1 ? "regel" : "regels"} open van
                  vóór deze periode, oudste {formatDate(achterstandOudste)}.
                </span>
                <Button size="sm" variant="outline" onClick={() => setPeriodeVan(achterstandOudste)}>
                  Periode oprekken
                </Button>
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
