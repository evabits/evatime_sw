"use client";

import { useState } from "react";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CalendarDays, Copy, Check, Plus, Trash2, ThumbsUp, ThumbsDown, Pencil } from "lucide-react";
import { formatDate } from "@/lib/utils";

type AbsenceType = "VACATION" | "SICK" | "SPECIAL_LEAVE" | "UNPAID_LEAVE";
type AbsenceStatus = "PENDING" | "APPROVED" | "REJECTED";

const ABSENCE_TYPE_LABELS: Record<AbsenceType, string> = {
  VACATION: "Vakantie",
  SICK: "Ziekteverlof",
  SPECIAL_LEAVE: "Bijzonder verlof",
  UNPAID_LEAVE: "Onbetaald verlof",
};

const ABSENCE_TYPES = Object.entries(ABSENCE_TYPE_LABELS) as [AbsenceType, string][];

interface AbsenceRequest {
  id: string;
  userId: string;
  type: AbsenceType;
  startDate: string;
  endDate: string;
  hours: number;
  description?: string | null;
  status: AbsenceStatus;
  user: { id: string; name: string };
  reviewer?: { id: string; name: string } | null;
  reviewedAt?: string | null;
}

interface VacationBudget {
  id: string;
  userId: string;
  year: number;
  hours: number;
  user: { id: string; name: string };
}

interface User {
  id: string;
  name: string;
}

interface Props {
  initialRequests: AbsenceRequest[];
  initialBudgets: VacationBudget[];
  users: User[];
  currentUserId: string;
  isAdmin: boolean;
  year: number;
  calendarToken: string;
}

const requestSchema = z.object({
  type: z.enum(["VACATION", "SICK", "SPECIAL_LEAVE", "UNPAID_LEAVE"]),
  startDate: z.string().min(1, "Verplicht"),
  endDate: z.string().min(1, "Verplicht"),
  hours: z.coerce.number({ invalid_type_error: "Verplicht" }).positive("Moet positief zijn"),
  description: z.string().optional(),
});

const budgetSchema = z.object({
  userId: z.string().min(1, "Verplicht"),
  year: z.coerce.number().int(),
  hours: z.coerce.number({ invalid_type_error: "Verplicht" }).positive("Moet positief zijn"),
});

type RequestForm = z.infer<typeof requestSchema>;
type BudgetForm = z.infer<typeof budgetSchema>;

type Tab = "requests" | "budgets" | "calendar";

function statusBadge(status: AbsenceStatus) {
  if (status === "APPROVED") return <Badge className="bg-green-100 text-green-800 hover:bg-green-100">Goedgekeurd</Badge>;
  if (status === "REJECTED") return <Badge className="bg-red-100 text-red-800 hover:bg-red-100">Afgewezen</Badge>;
  return <Badge className="bg-yellow-100 text-yellow-800 hover:bg-yellow-100">In afwachting</Badge>;
}

function typeBadge(type: AbsenceType) {
  const label = ABSENCE_TYPE_LABELS[type];
  const colors: Record<AbsenceType, string> = {
    VACATION: "bg-blue-100 text-blue-800 hover:bg-blue-100",
    SICK: "bg-orange-100 text-orange-800 hover:bg-orange-100",
    SPECIAL_LEAVE: "bg-purple-100 text-purple-800 hover:bg-purple-100",
    UNPAID_LEAVE: "bg-gray-100 text-gray-800 hover:bg-gray-100",
  };
  return <Badge className={colors[type]}>{label}</Badge>;
}

export function AbsenceClient({
  initialRequests,
  initialBudgets,
  users,
  currentUserId,
  isAdmin,
  year,
  calendarToken,
}: Props) {
  const [requests, setRequests] = useState<AbsenceRequest[]>(initialRequests);
  const [budgets, setBudgets] = useState<VacationBudget[]>(initialBudgets);
  const [activeTab, setActiveTab] = useState<Tab>("requests");
  const [requestDialogOpen, setRequestDialogOpen] = useState(false);
  const [budgetDialogOpen, setBudgetDialogOpen] = useState(false);
  const [editingRequest, setEditingRequest] = useState<AbsenceRequest | null>(null);
  const [editingBudget, setEditingBudget] = useState<VacationBudget | null>(null);
  const [serverError, setServerError] = useState("");
  const [copied, setCopied] = useState(false);

  // My vacation balance (only VACATION type counts against budget)
  const myBudget = budgets.find((b) => b.userId === currentUserId);
  const myApprovedVacation = requests
    .filter((r) => r.userId === currentUserId && r.status === "APPROVED" && r.type === "VACATION")
    .reduce((s, r) => s + r.hours, 0);
  const myPendingVacation = requests
    .filter((r) => r.userId === currentUserId && r.status === "PENDING" && r.type === "VACATION")
    .reduce((s, r) => s + r.hours, 0);
  const myBudgetHours = myBudget?.hours ?? 0;
  const myRemaining = myBudgetHours - myApprovedVacation;
  const pendingCount = requests.filter((r) => r.status === "PENDING").length;

  const calendarUrl =
    typeof window !== "undefined"
      ? `${window.location.origin}/api/vacation/calendar?token=${calendarToken}`
      : "";

  const requestForm = useForm<RequestForm>({
    resolver: zodResolver(requestSchema),
    defaultValues: { type: "VACATION", startDate: "", endDate: "", hours: "" as any, description: "" },
  });

  const budgetForm = useForm<BudgetForm>({
    resolver: zodResolver(budgetSchema),
    defaultValues: { userId: "", year, hours: "" as any },
  });

  function openRequestDialog(req?: AbsenceRequest) {
    setServerError("");
    if (req) {
      setEditingRequest(req);
      requestForm.reset({
        type: req.type,
        startDate: req.startDate.slice(0, 10),
        endDate: req.endDate.slice(0, 10),
        hours: req.hours,
        description: req.description ?? "",
      });
    } else {
      setEditingRequest(null);
      requestForm.reset({ type: "VACATION", startDate: "", endDate: "", hours: "" as any, description: "" });
    }
    setRequestDialogOpen(true);
  }

  function openBudgetDialog(budget?: VacationBudget) {
    setServerError("");
    if (budget) {
      setEditingBudget(budget);
      budgetForm.reset({ userId: budget.userId, year: budget.year, hours: budget.hours });
    } else {
      setEditingBudget(null);
      budgetForm.reset({ userId: "", year, hours: "" as any });
    }
    setBudgetDialogOpen(true);
  }

  async function submitRequest(values: RequestForm) {
    setServerError("");
    const url = editingRequest ? `/api/absence-requests/${editingRequest.id}` : "/api/absence-requests";
    const method = editingRequest ? "PUT" : "POST";
    const res = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(values) });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      setServerError(err.error ?? "Er is een fout opgetreden");
      return;
    }
    const saved: AbsenceRequest = await res.json();
    setRequests((prev) =>
      editingRequest ? prev.map((r) => (r.id === saved.id ? saved : r)) : [saved, ...prev]
    );
    setRequestDialogOpen(false);
  }

  async function deleteRequest(id: string) {
    const res = await fetch(`/api/absence-requests/${id}`, { method: "DELETE" });
    if (res.ok) setRequests((prev) => prev.filter((r) => r.id !== id));
  }

  async function reviewRequest(id: string, status: "APPROVED" | "REJECTED") {
    const res = await fetch(`/api/absence-requests/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    if (res.ok) {
      const updated: AbsenceRequest = await res.json();
      setRequests((prev) => prev.map((r) => (r.id === updated.id ? updated : r)));
    }
  }

  async function submitBudget(values: BudgetForm) {
    setServerError("");
    if (editingBudget) {
      const res = await fetch(`/api/vacation-budgets/${editingBudget.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ hours: values.hours }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        setServerError(err.error ?? "Er is een fout opgetreden");
        return;
      }
      const saved: VacationBudget = await res.json();
      setBudgets((prev) => prev.map((b) => (b.id === saved.id ? saved : b)));
    } else {
      const res = await fetch("/api/vacation-budgets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(values),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        setServerError(err.error ?? "Er is een fout opgetreden");
        return;
      }
      const saved: VacationBudget = await res.json();
      setBudgets((prev) => {
        const existing = prev.findIndex((b) => b.id === saved.id);
        return existing >= 0
          ? prev.map((b) => (b.id === saved.id ? saved : b))
          : [...prev, saved].sort((a, b) => a.user.name.localeCompare(b.user.name));
      });
    }
    setBudgetDialogOpen(false);
  }

  async function deleteBudget(id: string) {
    const res = await fetch(`/api/vacation-budgets/${id}`, { method: "DELETE" });
    if (res.ok) setBudgets((prev) => prev.filter((b) => b.id !== id));
  }

  function copyCalendarUrl() {
    navigator.clipboard.writeText(calendarUrl).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Afwezigheid</h1>
          <p className="text-muted-foreground">Afwezigheid beheren voor {year}</p>
        </div>
        <Button onClick={() => openRequestDialog()}>
          <Plus className="h-4 w-4 mr-2" />
          Aanvraag indienen
        </Button>
      </div>

      {/* Vacation balance cards */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Vakantiebudget {year}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{myBudgetHours}u</div>
            <p className="text-xs text-muted-foreground">toegekende vakantie-uren</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Vakantie opgenomen</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{myApprovedVacation}u</div>
            <p className="text-xs text-muted-foreground">goedgekeurde vakantie</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">In behandeling</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{myPendingVacation}u</div>
            <p className="text-xs text-muted-foreground">vakantie in afwachting</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Vakantie resterend</CardTitle>
          </CardHeader>
          <CardContent>
            <div className={`text-2xl font-bold ${myRemaining < 0 ? "text-red-600" : ""}`}>
              {myRemaining}u
            </div>
            <p className="text-xs text-muted-foreground">beschikbaar</p>
          </CardContent>
        </Card>
      </div>

      {isAdmin ? (
        <div>
          {/* Tab bar */}
          <div className="border-b mb-4">
            <div className="flex gap-1">
              {(["requests", "budgets", "calendar"] as Tab[]).map((tab) => (
                <button
                  key={tab}
                  onClick={() => setActiveTab(tab)}
                  className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
                    activeTab === tab
                      ? "border-primary text-primary"
                      : "border-transparent text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {tab === "requests" && (
                    <>
                      Aanvragen
                      {pendingCount > 0 && (
                        <span className="ml-1.5 rounded-full bg-yellow-500 text-white text-xs px-1.5 py-0.5">
                          {pendingCount}
                        </span>
                      )}
                    </>
                  )}
                  {tab === "budgets" && "Vakantiebudgetten"}
                  {tab === "calendar" && "Kalender"}
                </button>
              ))}
            </div>
          </div>

          {activeTab === "requests" && (
            <RequestsTable
              requests={requests}
              isAdmin={isAdmin}
              currentUserId={currentUserId}
              onEdit={openRequestDialog}
              onDelete={deleteRequest}
              onReview={reviewRequest}
            />
          )}

          {activeTab === "budgets" && (
            <div className="space-y-4">
              <div className="flex justify-end">
                <Button onClick={() => openBudgetDialog()}>
                  <Plus className="h-4 w-4 mr-2" />
                  Budget toevoegen
                </Button>
              </div>
              <div className="rounded-md border overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-muted/50">
                    <tr>
                      <th className="px-4 py-3 text-left font-medium">Medewerker</th>
                      <th className="px-4 py-3 text-left font-medium">Jaar</th>
                      <th className="px-4 py-3 text-right font-medium">Budget (u)</th>
                      <th className="px-4 py-3 text-right font-medium">Opgenomen (u)</th>
                      <th className="px-4 py-3 text-right font-medium">Resterend (u)</th>
                      <th className="px-4 py-3" />
                    </tr>
                  </thead>
                  <tbody>
                    {budgets.length === 0 && (
                      <tr>
                        <td colSpan={6} className="px-4 py-8 text-center text-muted-foreground">
                          Nog geen vakantiebudgetten ingesteld
                        </td>
                      </tr>
                    )}
                    {budgets.map((b) => {
                      const used = requests
                        .filter((r) => r.userId === b.userId && r.status === "APPROVED" && r.type === "VACATION")
                        .reduce((s, r) => s + r.hours, 0);
                      const remaining = b.hours - used;
                      return (
                        <tr key={b.id} className="border-t hover:bg-muted/30">
                          <td className="px-4 py-3">{b.user.name}</td>
                          <td className="px-4 py-3">{b.year}</td>
                          <td className="px-4 py-3 text-right">{b.hours}</td>
                          <td className="px-4 py-3 text-right">{used}</td>
                          <td className={`px-4 py-3 text-right font-medium ${remaining < 0 ? "text-red-600" : ""}`}>
                            {remaining}
                          </td>
                          <td className="px-4 py-3 text-right">
                            <div className="flex justify-end gap-1">
                              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openBudgetDialog(b)}>
                                <Pencil className="h-3.5 w-3.5" />
                              </Button>
                              <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => deleteBudget(b.id)}>
                                <Trash2 className="h-3.5 w-3.5" />
                              </Button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {activeTab === "calendar" && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <CalendarDays className="h-5 w-5" />
                  Google Kalender abonnement
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <p className="text-sm text-muted-foreground">
                  Abonneer op de afwezigheidskalender om alle goedgekeurde afwezigheid in Google Agenda te zien.
                  De kalender wordt automatisch bijgewerkt wanneer aanvragen worden goedgekeurd.
                </p>
                <p className="text-sm text-muted-foreground">
                  Ga in Google Agenda naar{" "}
                  <strong>Andere agenda&apos;s &rarr; Via URL</strong> en plak de onderstaande URL.
                  Google Agenda vernieuwt externe kalenders ongeveer elke 24 uur.
                </p>
                <div className="flex gap-2">
                  <Input
                    readOnly
                    value={
                      calendarToken
                        ? calendarUrl
                        : "(geen token ingesteld — voeg VACATION_CALENDAR_TOKEN toe als omgevingsvariabele)"
                    }
                    className="font-mono text-xs"
                  />
                  <Button variant="outline" size="icon" onClick={copyCalendarUrl} disabled={!calendarToken}>
                    {copied ? <Check className="h-4 w-4 text-green-600" /> : <Copy className="h-4 w-4" />}
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      ) : (
        <RequestsTable
          requests={requests}
          isAdmin={false}
          currentUserId={currentUserId}
          onEdit={openRequestDialog}
          onDelete={deleteRequest}
          onReview={reviewRequest}
        />
      )}

      {/* Request dialog */}
      <Dialog open={requestDialogOpen} onOpenChange={setRequestDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingRequest ? "Aanvraag bewerken" : "Afwezigheid aanvragen"}</DialogTitle>
          </DialogHeader>
          <form onSubmit={requestForm.handleSubmit(submitRequest)} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="absenceType">Type afwezigheid</Label>
              <Controller
                control={requestForm.control}
                name="type"
                render={({ field }) => (
                  <Select onValueChange={field.onChange} value={field.value}>
                    <SelectTrigger id="absenceType">
                      <SelectValue placeholder="Selecteer type" />
                    </SelectTrigger>
                    <SelectContent>
                      {ABSENCE_TYPES.map(([value, label]) => (
                        <SelectItem key={value} value={value}>{label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
              {requestForm.formState.errors.type && (
                <p className="text-xs text-destructive">{requestForm.formState.errors.type.message}</p>
              )}
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="startDate">Startdatum</Label>
                <Input id="startDate" type="date" {...requestForm.register("startDate")} />
                {requestForm.formState.errors.startDate && (
                  <p className="text-xs text-destructive">{requestForm.formState.errors.startDate.message}</p>
                )}
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="endDate">Einddatum</Label>
                <Input id="endDate" type="date" {...requestForm.register("endDate")} />
                {requestForm.formState.errors.endDate && (
                  <p className="text-xs text-destructive">{requestForm.formState.errors.endDate.message}</p>
                )}
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="hours">Uren</Label>
              <Input id="hours" type="number" step="0.5" min="0.5" {...requestForm.register("hours")} />
              {requestForm.formState.errors.hours && (
                <p className="text-xs text-destructive">{requestForm.formState.errors.hours.message}</p>
              )}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="description">Omschrijving (optioneel)</Label>
              <Textarea id="description" rows={2} {...requestForm.register("description")} />
            </div>
            {serverError && <p className="text-sm text-destructive">{serverError}</p>}
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setRequestDialogOpen(false)}>Annuleren</Button>
              <Button type="submit" disabled={requestForm.formState.isSubmitting}>
                {editingRequest ? "Opslaan" : "Indienen"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Budget dialog (admin only) */}
      {isAdmin && (
        <Dialog open={budgetDialogOpen} onOpenChange={setBudgetDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{editingBudget ? "Vakantiebudget bewerken" : "Vakantiebudget toevoegen"}</DialogTitle>
            </DialogHeader>
            <form onSubmit={budgetForm.handleSubmit(submitBudget)} className="space-y-4">
              {!editingBudget && (
                <div className="space-y-1.5">
                  <Label htmlFor="budgetUser">Medewerker</Label>
                  <Controller
                    control={budgetForm.control}
                    name="userId"
                    render={({ field }) => (
                      <Select onValueChange={field.onChange} value={field.value}>
                        <SelectTrigger id="budgetUser">
                          <SelectValue placeholder="Selecteer medewerker" />
                        </SelectTrigger>
                        <SelectContent>
                          {users.map((u) => (
                            <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}
                  />
                  {budgetForm.formState.errors.userId && (
                    <p className="text-xs text-destructive">{budgetForm.formState.errors.userId.message}</p>
                  )}
                </div>
              )}
              {!editingBudget && (
                <div className="space-y-1.5">
                  <Label htmlFor="budgetYear">Jaar</Label>
                  <Input id="budgetYear" type="number" {...budgetForm.register("year")} />
                  {budgetForm.formState.errors.year && (
                    <p className="text-xs text-destructive">{budgetForm.formState.errors.year.message}</p>
                  )}
                </div>
              )}
              <div className="space-y-1.5">
                <Label htmlFor="budgetHours">Vakantie-uren</Label>
                <Input id="budgetHours" type="number" step="0.5" min="0" {...budgetForm.register("hours")} />
                {budgetForm.formState.errors.hours && (
                  <p className="text-xs text-destructive">{budgetForm.formState.errors.hours.message}</p>
                )}
              </div>
              {serverError && <p className="text-sm text-destructive">{serverError}</p>}
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setBudgetDialogOpen(false)}>Annuleren</Button>
                <Button type="submit" disabled={budgetForm.formState.isSubmitting}>Opslaan</Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}

function RequestsTable({
  requests,
  isAdmin,
  currentUserId,
  onEdit,
  onDelete,
  onReview,
}: {
  requests: AbsenceRequest[];
  isAdmin: boolean;
  currentUserId: string;
  onEdit: (r: AbsenceRequest) => void;
  onDelete: (id: string) => void;
  onReview: (id: string, status: "APPROVED" | "REJECTED") => void;
}) {
  if (requests.length === 0) {
    return (
      <div className="rounded-md border p-8 text-center text-muted-foreground">
        Nog geen afwezigheidsaanvragen voor dit jaar
      </div>
    );
  }

  return (
    <div className="rounded-md border overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="bg-muted/50">
          <tr>
            {isAdmin && <th className="px-4 py-3 text-left font-medium">Medewerker</th>}
            <th className="px-4 py-3 text-left font-medium">Type</th>
            <th className="px-4 py-3 text-left font-medium">Periode</th>
            <th className="px-4 py-3 text-right font-medium">Uren</th>
            <th className="px-4 py-3 text-left font-medium">Omschrijving</th>
            <th className="px-4 py-3 text-left font-medium">Status</th>
            <th className="px-4 py-3" />
          </tr>
        </thead>
        <tbody>
          {requests.map((r) => (
            <tr key={r.id} className="border-t hover:bg-muted/30">
              {isAdmin && <td className="px-4 py-3">{r.user.name}</td>}
              <td className="px-4 py-3">{typeBadge(r.type)}</td>
              <td className="px-4 py-3 whitespace-nowrap">
                {formatDate(r.startDate)} – {formatDate(r.endDate)}
              </td>
              <td className="px-4 py-3 text-right">{r.hours}u</td>
              <td className="px-4 py-3 text-muted-foreground max-w-xs truncate">{r.description ?? "—"}</td>
              <td className="px-4 py-3">{statusBadge(r.status)}</td>
              <td className="px-4 py-3">
                <div className="flex justify-end gap-1">
                  {isAdmin && r.status === "PENDING" && (
                    <>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 text-green-600"
                        title="Goedkeuren"
                        onClick={() => onReview(r.id, "APPROVED")}
                      >
                        <ThumbsUp className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 text-red-600"
                        title="Afwijzen"
                        onClick={() => onReview(r.id, "REJECTED")}
                      >
                        <ThumbsDown className="h-3.5 w-3.5" />
                      </Button>
                    </>
                  )}
                  {r.userId === currentUserId && r.status === "PENDING" && (
                    <>
                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => onEdit(r)}>
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 text-destructive"
                        onClick={() => onDelete(r.id)}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </>
                  )}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
