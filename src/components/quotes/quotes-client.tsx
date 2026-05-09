"use client";
import { useState, useMemo } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { formatDate, formatCurrency } from "@/lib/utils";
import { ExternalLink, Trash2 } from "lucide-react";
import Link from "next/link";

const statusLabel: Record<string, string> = {
  DRAFT: "Concept", SENT: "Verzonden", APPROVED: "Goedgekeurd", CANCELLED: "Geannuleerd",
};
const statusVariant: Record<string, string> = {
  DRAFT: "secondary", SENT: "default", APPROVED: "success", CANCELLED: "destructive",
};

const PAGE_SIZE = 25;

export function QuotesClient({ initialQuotes }: { initialQuotes: any[] }) {
  const [quotes, setQuotes] = useState(initialQuotes);
  const [page, setPage] = useState(0);
  const [filterStatus, setFilterStatus] = useState("all");
  const [filterYear, setFilterYear] = useState("all");
  const [filterSearch, setFilterSearch] = useState("");

  const years = useMemo(() => {
    const ys = new Set(quotes.map((q) => new Date(q.issueDate).getFullYear()));
    return Array.from(ys).sort((a, b) => b - a);
  }, [quotes]);

  const filtered = useMemo(() => quotes.filter((q) => {
    if (filterStatus !== "all" && q.status !== filterStatus) return false;
    if (filterYear !== "all" && String(new Date(q.issueDate).getFullYear()) !== filterYear) return false;
    if (filterSearch) {
      const s = filterSearch.toLowerCase();
      if (!q.quoteNumber.toLowerCase().includes(s) && !q.customer.name.toLowerCase().includes(s)) return false;
    }
    return true;
  }), [quotes, filterStatus, filterYear, filterSearch]);

  async function deleteQuote(id: string) {
    if (!confirm("Offerte verwijderen?")) return;
    const res = await fetch(`/api/quotes/${id}`, { method: "DELETE" });
    if (res.ok) setQuotes((prev) => prev.filter((q) => q.id !== id));
  }

  const pageCount = Math.ceil(filtered.length / PAGE_SIZE);
  const paged = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  return (
    <Card>
      <div className="flex flex-wrap gap-2 p-4 border-b">
        <Input
          placeholder="Zoeken op nummer of klant..."
          value={filterSearch}
          onChange={(e) => { setFilterSearch(e.target.value); setPage(0); }}
          className="h-8 text-sm w-56"
        />
        <Select value={filterStatus} onValueChange={(v) => { setFilterStatus(v); setPage(0); }}>
          <SelectTrigger className="h-8 text-sm w-40"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Alle statussen</SelectItem>
            <SelectItem value="DRAFT">Concept</SelectItem>
            <SelectItem value="SENT">Verzonden</SelectItem>
            <SelectItem value="APPROVED">Goedgekeurd</SelectItem>
            <SelectItem value="CANCELLED">Geannuleerd</SelectItem>
          </SelectContent>
        </Select>
        <Select value={filterYear} onValueChange={(v) => { setFilterYear(v); setPage(0); }}>
          <SelectTrigger className="h-8 text-sm w-28"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Alle jaren</SelectItem>
            {years.map((y) => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}
          </SelectContent>
        </Select>
        {filtered.length !== quotes.length && (
          <span className="text-sm text-muted-foreground self-center">{filtered.length} resultaten</span>
        )}
      </div>
      <CardContent className="p-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nummer</TableHead>
              <TableHead>Klant</TableHead>
              <TableHead>Datum</TableHead>
              <TableHead>Geldig tot</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Bedrag</TableHead>
              <TableHead></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.length === 0 && (
              <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground py-8">Geen offertes gevonden</TableCell></TableRow>
            )}
            {paged.map((q) => (
              <TableRow key={q.id}>
                <TableCell className="font-mono font-medium">{q.quoteNumber}</TableCell>
                <TableCell>{q.customer.name}</TableCell>
                <TableCell>{formatDate(q.issueDate)}</TableCell>
                <TableCell>{formatDate(q.validUntil)}</TableCell>
                <TableCell>
                  <Badge variant={statusVariant[q.status] as any}>{statusLabel[q.status]}</Badge>
                </TableCell>
                <TableCell className="text-right">{formatCurrency(Number(q.total))}</TableCell>
                <TableCell>
                  <div className="flex gap-1 justify-end">
                    <Button variant="ghost" size="icon" asChild>
                      <Link href={`/quotes/${q.id}`}><ExternalLink className="h-3.5 w-3.5" /></Link>
                    </Button>
                    <Button variant="ghost" size="icon" onClick={() => deleteQuote(q.id)} disabled={q.status === "APPROVED"}>
                      <Trash2 className="h-3.5 w-3.5 text-destructive" />
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        {pageCount > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t text-sm text-muted-foreground">
            <span>{page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, filtered.length)} van {filtered.length}</span>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={() => setPage((p) => p - 1)} disabled={page === 0}>Vorige</Button>
              <Button variant="outline" size="sm" onClick={() => setPage((p) => p + 1)} disabled={page >= pageCount - 1}>Volgende</Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
