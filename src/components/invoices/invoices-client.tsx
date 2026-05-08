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

const statusLabel: Record<string, string> = { DRAFT: "Concept", SENT: "Verzonden", PAID: "Betaald", CANCELLED: "Geannuleerd" };
const statusVariant: Record<string, string> = { DRAFT: "secondary", SENT: "default", PAID: "success", CANCELLED: "destructive" };

const PAGE_SIZE = 25;

interface Props {
  initialInvoices: any[];
}

export function InvoicesClient({ initialInvoices }: Props) {
  const [invoices, setInvoices] = useState(initialInvoices);
  const [page, setPage] = useState(0);
  const [filterStatus, setFilterStatus] = useState("all");
  const [filterYear, setFilterYear] = useState("all");
  const [filterSearch, setFilterSearch] = useState("");

  const years = useMemo(() => {
    const ys = new Set(invoices.map((i) => new Date(i.issueDate).getFullYear()));
    return Array.from(ys).sort((a, b) => b - a);
  }, [invoices]);

  const filtered = useMemo(() => {
    return invoices.filter((inv) => {
      if (filterStatus !== "all" && inv.status !== filterStatus) return false;
      if (filterYear !== "all" && String(new Date(inv.issueDate).getFullYear()) !== filterYear) return false;
      if (filterSearch) {
        const q = filterSearch.toLowerCase();
        if (
          !inv.invoiceNumber.toLowerCase().includes(q) &&
          !inv.customer.name.toLowerCase().includes(q)
        ) return false;
      }
      return true;
    });
  }, [invoices, filterStatus, filterYear, filterSearch]);

  function handleFilterChange() {
    setPage(0);
  }

  async function deleteInvoice(id: string) {
    if (!confirm("Weet u zeker dat u deze factuur wilt verwijderen? Gekoppelde registraties worden ontfactureerd.")) return;
    await fetch(`/api/invoices/${id}`, { method: "DELETE" });
    setInvoices((prev) => prev.filter((i) => i.id !== id));
  }

  const pageCount = Math.ceil(filtered.length / PAGE_SIZE);
  const paged = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  return (
    <Card>
      {/* Filters */}
      <div className="flex flex-wrap gap-2 p-4 border-b">
        <Input
          placeholder="Zoeken op nummer of klant..."
          value={filterSearch}
          onChange={(e) => { setFilterSearch(e.target.value); handleFilterChange(); }}
          className="h-8 text-sm w-56"
        />
        <Select value={filterStatus} onValueChange={(v) => { setFilterStatus(v); handleFilterChange(); }}>
          <SelectTrigger className="h-8 text-sm w-40"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Alle statussen</SelectItem>
            <SelectItem value="DRAFT">Concept</SelectItem>
            <SelectItem value="SENT">Verzonden</SelectItem>
            <SelectItem value="PAID">Betaald</SelectItem>
            <SelectItem value="CANCELLED">Geannuleerd</SelectItem>
          </SelectContent>
        </Select>
        <Select value={filterYear} onValueChange={(v) => { setFilterYear(v); handleFilterChange(); }}>
          <SelectTrigger className="h-8 text-sm w-28"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Alle jaren</SelectItem>
            {years.map((y) => (
              <SelectItem key={y} value={String(y)}>{y}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        {filtered.length !== invoices.length && (
          <span className="text-sm text-muted-foreground self-center">{filtered.length} resultaten</span>
        )}
      </div>

      <CardContent className="p-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Factuurnummer</TableHead>
              <TableHead>Klant</TableHead>
              <TableHead>Datum</TableHead>
              <TableHead>Vervaldatum</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Bedrag</TableHead>
              <TableHead></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.length === 0 && (
              <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground py-8">Geen facturen gevonden</TableCell></TableRow>
            )}
            {paged.map((inv) => (
              <TableRow key={inv.id}>
                <TableCell className="font-mono font-medium">{inv.invoiceNumber}</TableCell>
                <TableCell>{inv.customer.name}</TableCell>
                <TableCell>{formatDate(inv.issueDate)}</TableCell>
                <TableCell>{formatDate(inv.dueDate)}</TableCell>
                <TableCell>
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <Badge variant={statusVariant[inv.status] as any}>{statusLabel[inv.status]}</Badge>
                    {inv.status === "SENT" && new Date(inv.dueDate) < new Date() && (
                      <Badge variant="destructive">Achterstallig</Badge>
                    )}
                  </div>
                </TableCell>
                <TableCell className="text-right">{formatCurrency(Number(inv.total))}</TableCell>
                <TableCell>
                  <div className="flex gap-1 justify-end">
                    <Button variant="ghost" size="icon" asChild>
                      <Link href={`/invoices/${inv.id}`}><ExternalLink className="h-3.5 w-3.5" /></Link>
                    </Button>
                    <Button variant="ghost" size="icon" onClick={() => deleteInvoice(inv.id)}>
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
