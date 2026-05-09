"use client";
import { useState, useRef } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { format } from "date-fns";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { formatDate, formatCurrency } from "@/lib/utils";
import { Pencil, Trash2, Paperclip, Download } from "lucide-react";

const schema = z.object({
  categoryId: z.string().min(1, "Verplicht"),
  projectId: z.string().optional(),
  date: z.string().min(1, "Verplicht"),
  description: z.string().optional(),
  amount: z.coerce.number().positive("Moet positief zijn"),
  vatRate: z.coerce.number().min(0).max(100),
  billable: z.boolean(),
  reimbursable: z.boolean(),
});

type FormData = z.infer<typeof schema>;

function currentMonth() { return format(new Date(), "yyyy-MM"); }

function monthBounds(ym: string) {
  const [y, m] = ym.split("-").map(Number);
  return { from: `${ym}-01`, to: `${ym}-${String(new Date(y, m, 0).getDate()).padStart(2, "0")}` };
}

interface Props {
  categories: any[];
  projects: any[];
  initialExpenses: any[];
  role: string;
  canViewReimbursements: boolean;
}

export function ExpensesClient({ categories, projects, initialExpenses, role, canViewReimbursements }: Props) {
  const [expenses, setExpenses] = useState(initialExpenses);
  const [editing, setEditing] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [filterMonth, setFilterMonth] = useState(currentMonth());
  const [filterProject, setFilterProject] = useState("all");
  const [fetching, setFetching] = useState(false);
  const [showReimbursements, setShowReimbursements] = useState(false);
  const [uploadingId, setUploadingId] = useState<string | null>(null);
  const receiptRef = useRef<HTMLInputElement>(null);
  const [pendingReceiptExpenseId, setPendingReceiptExpenseId] = useState<string | null>(null);

  const form = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: { date: format(new Date(), "yyyy-MM-dd"), billable: true, reimbursable: false, vatRate: 21 },
  });

  async function fetchExpenses(month: string, projectId: string, reimbursable: boolean) {
    setFetching(true);
    const { from, to } = monthBounds(month);
    const params = new URLSearchParams({ from, to });
    if (projectId !== "all") params.set("projectId", projectId);
    if (reimbursable) params.set("reimbursable", "1");
    const res = await fetch(`/api/expenses?${params}`);
    if (res.ok) setExpenses(await res.json());
    setFetching(false);
  }

  function handleMonthChange(month: string) {
    setFilterMonth(month);
    fetchExpenses(month, filterProject, showReimbursements);
  }

  function handleProjectChange(projectId: string) {
    setFilterProject(projectId);
    fetchExpenses(filterMonth, projectId, showReimbursements);
  }

  function toggleReimbursements(val: boolean) {
    setShowReimbursements(val);
    fetchExpenses(filterMonth, filterProject, val);
  }

  async function onSubmit(data: FormData) {
    setLoading(true);
    const payload = { ...data, projectId: data.projectId || null };
    try {
      if (editing) {
        const res = await fetch(`/api/expenses/${editing}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        if (res.ok) {
          const updated = await res.json();
          setExpenses((prev) => prev.map((e) => (e.id === editing ? updated : e)));
          setEditing(null);
          form.reset({ date: format(new Date(), "yyyy-MM-dd"), billable: true, reimbursable: false, vatRate: 21 });
        }
      } else {
        const res = await fetch("/api/expenses", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        if (res.ok) {
          const created = await res.json();
          const { from, to } = monthBounds(filterMonth);
          if (data.date >= from && data.date <= to && (filterProject === "all" || data.projectId === filterProject)) {
            setExpenses((prev) => [created, ...prev]);
          }
          form.reset({ date: format(new Date(), "yyyy-MM-dd"), billable: true, reimbursable: false, vatRate: 21 });
        }
      }
    } finally { setLoading(false); }
  }

  async function deleteExpense(id: string) {
    if (!confirm("Weet u zeker dat u deze uitgaven wilt verwijderen?")) return;
    const res = await fetch(`/api/expenses/${id}`, { method: "DELETE" });
    if (res.ok) setExpenses((prev) => prev.filter((e) => e.id !== id));
  }

  function startEdit(expense: any) {
    setEditing(expense.id);
    form.reset({
      categoryId: expense.categoryId,
      projectId: expense.projectId ?? undefined,
      date: format(new Date(expense.date), "yyyy-MM-dd"),
      description: expense.description ?? "",
      amount: Number(expense.amount),
      vatRate: Number(expense.vatRate),
      billable: expense.billable,
      reimbursable: expense.reimbursable,
    });
  }

  async function uploadReceipt(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !pendingReceiptExpenseId) return;
    setUploadingId(pendingReceiptExpenseId);
    const fd = new FormData();
    fd.append("file", file);
    const res = await fetch(`/api/expenses/${pendingReceiptExpenseId}/receipt`, { method: "POST", body: fd });
    if (res.ok) {
      const { receiptUrl } = await res.json();
      setExpenses((prev) => prev.map((e) => e.id === pendingReceiptExpenseId ? { ...e, receiptUrl } : e));
    }
    setUploadingId(null);
    setPendingReceiptExpenseId(null);
    if (receiptRef.current) receiptRef.current.value = "";
  }

  const isReadOnly = (expense: any) => showReimbursements && expense.userId !== (expenses[0]?.userId);
  const totalAmount = expenses.reduce((s, e) => s + Number(e.amount), 0);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Uitgaven registreren</h1>
        <p className="text-muted-foreground">Beheer uw uitgavenregistraties</p>
      </div>

      {!showReimbursements && (
        <Card>
          <CardHeader><CardTitle>{editing ? "Uitgaven aanpassen" : "Uitgaven toevoegen"}</CardTitle></CardHeader>
          <CardContent>
            <form onSubmit={form.handleSubmit(onSubmit)} className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>Categorie *</Label>
                <Select onValueChange={(v) => form.setValue("categoryId", v)} value={form.watch("categoryId")}>
                  <SelectTrigger><SelectValue placeholder="Selecteer categorie" /></SelectTrigger>
                  <SelectContent>
                    {categories.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                  </SelectContent>
                </Select>
                {form.formState.errors.categoryId && <p className="text-xs text-destructive">{form.formState.errors.categoryId.message}</p>}
              </div>

              <div className="space-y-2">
                <Label>Project</Label>
                <Select onValueChange={(v) => form.setValue("projectId", v === "_none" ? undefined : v)} value={form.watch("projectId") || "_none"}>
                  <SelectTrigger><SelectValue placeholder="Geen project" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="_none">Geen project</SelectItem>
                    {projects.map((p) => <SelectItem key={p.id} value={p.id}>{p.customer.name} — {p.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Datum *</Label>
                <Input type="date" {...form.register("date")} />
              </div>

              <div className="space-y-2">
                <Label>Bedrag (€) *</Label>
                <Input type="number" step="0.01" min="0.01" placeholder="0.00" {...form.register("amount")} />
                {form.formState.errors.amount && <p className="text-xs text-destructive">{form.formState.errors.amount.message}</p>}
              </div>

              <div className="space-y-2">
                <Label>BTW %</Label>
                <Input type="number" step="1" min="0" max="100" {...form.register("vatRate")} />
              </div>

              <div className="space-y-2">
                <Label>Factureerbaar</Label>
                <Select onValueChange={(v) => form.setValue("billable", v === "true")} value={form.watch("billable") ? "true" : "false"}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="true">Ja</SelectItem>
                    <SelectItem value="false">Nee</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Declaratie (terugbetaling)</Label>
                <Select onValueChange={(v) => form.setValue("reimbursable", v === "true")} value={form.watch("reimbursable") ? "true" : "false"}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="false">Nee</SelectItem>
                    <SelectItem value="true">Ja</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2 sm:col-span-2">
                <Label>Omschrijving</Label>
                <Textarea placeholder="Bijv. lunch klantbezoek" {...form.register("description")} rows={2} />
              </div>

              <div className="sm:col-span-2 flex gap-2">
                <Button type="submit" disabled={loading}>{loading ? (editing ? "Opslaan..." : "Toevoegen...") : (editing ? "Opslaan" : "Toevoegen")}</Button>
                {editing && (
                  <Button type="button" variant="outline" onClick={() => { setEditing(null); form.reset({ date: format(new Date(), "yyyy-MM-dd"), billable: true, reimbursable: false, vatRate: 21 }); }}>Annuleren</Button>
                )}
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <CardTitle>Registraties</CardTitle>
              {expenses.length > 0 && !fetching && (
                <span className="text-sm text-muted-foreground">{formatCurrency(totalAmount)}</span>
              )}
            </div>
            <div className="flex flex-wrap gap-2">
              {canViewReimbursements && (
                <div className="flex rounded-md border text-sm overflow-hidden">
                  <button
                    className={`px-3 py-1.5 ${!showReimbursements ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted"}`}
                    onClick={() => toggleReimbursements(false)}
                  >Project uitgaven</button>
                  <button
                    className={`px-3 py-1.5 ${showReimbursements ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted"}`}
                    onClick={() => toggleReimbursements(true)}
                  >Declaraties</button>
                </div>
              )}
              {!showReimbursements && (
                <>
                  <Input type="month" value={filterMonth} onChange={(e) => handleMonthChange(e.target.value)} className="w-40 h-8 text-sm" />
                  <Select value={filterProject} onValueChange={handleProjectChange}>
                    <SelectTrigger className="w-48 h-8 text-sm"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Alle projecten</SelectItem>
                      {projects.map((p) => <SelectItem key={p.id} value={p.id}>{p.customer.name} — {p.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </>
              )}
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <input ref={receiptRef} type="file" className="hidden" accept=".pdf,.png,.jpg,.jpeg" onChange={uploadReceipt} />
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Datum</TableHead>
                {showReimbursements && <TableHead>Medewerker</TableHead>}
                <TableHead>Categorie</TableHead>
                <TableHead>Project</TableHead>
                <TableHead>Omschrijving</TableHead>
                <TableHead className="text-right">Bedrag</TableHead>
                <TableHead>Tags</TableHead>
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {fetching && <TableRow><TableCell colSpan={8} className="text-center text-muted-foreground py-8">Laden...</TableCell></TableRow>}
              {!fetching && expenses.length === 0 && <TableRow><TableCell colSpan={8} className="text-center text-muted-foreground py-8">Geen uitgaven gevonden</TableCell></TableRow>}
              {!fetching && expenses.map((expense) => {
                const readOnly = showReimbursements;
                return (
                  <TableRow key={expense.id}>
                    <TableCell className="whitespace-nowrap">{formatDate(expense.date)}</TableCell>
                    {showReimbursements && <TableCell>{expense.user?.name}</TableCell>}
                    <TableCell>{expense.category?.name}</TableCell>
                    <TableCell>
                      {expense.project ? (
                        <div>
                          <div className="font-medium text-sm">{expense.project.name}</div>
                          <div className="text-xs text-muted-foreground">{expense.project.customer?.name}</div>
                        </div>
                      ) : "—"}
                    </TableCell>
                    <TableCell className="max-w-40 truncate">{expense.description || "—"}</TableCell>
                    <TableCell className="text-right font-mono">{formatCurrency(Number(expense.amount))}</TableCell>
                    <TableCell>
                      <div className="flex gap-1 flex-wrap">
                        {expense.billable && <Badge variant="secondary" className="text-xs">Factureerbaar</Badge>}
                        {expense.reimbursable && <Badge variant="outline" className="text-xs">Declaratie</Badge>}
                        {expense.invoiced && <Badge variant="default" className="text-xs">Gefactureerd</Badge>}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-1 justify-end">
                        {expense.receiptUrl ? (
                          <Button variant="ghost" size="icon" asChild title="Bon downloaden">
                            <a href={`/api/expenses/${expense.id}/receipt/download`} download>
                              <Download className="h-3.5 w-3.5" />
                            </a>
                          </Button>
                        ) : !readOnly && !expense.invoiced ? (
                          <Button variant="ghost" size="icon" title="Bon uploaden" onClick={() => { setPendingReceiptExpenseId(expense.id); receiptRef.current?.click(); }} disabled={uploadingId === expense.id}>
                            <Paperclip className="h-3.5 w-3.5 text-muted-foreground" />
                          </Button>
                        ) : null}
                        {!readOnly && (
                          <>
                            <Button variant="ghost" size="icon" onClick={() => startEdit(expense)} disabled={expense.invoiced}>
                              <Pencil className="h-3.5 w-3.5" />
                            </Button>
                            <Button variant="ghost" size="icon" onClick={() => deleteExpense(expense.id)} disabled={expense.invoiced}>
                              <Trash2 className="h-3.5 w-3.5 text-destructive" />
                            </Button>
                          </>
                        )}
                      </div>
                    </TableCell>
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
