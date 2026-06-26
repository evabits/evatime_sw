"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Plus, Trash2, ChevronDown, ChevronUp } from "lucide-react";

interface Question {
  key: string;
  label: string;
  hint?: string;
  respondent: "SELF" | "MANAGER";
}

interface Section {
  title: string;
  questions: Question[];
}

interface Agreement {
  action: string;
  result: string;
}

interface Review {
  id: string;
  userId: string;
  period: string;
  status: "PLANNED" | "SELF_COMPLETED" | "COMPLETED";
  plannedDate: string | null;
  formSnapshot: { sections: Section[] };
  selfAnswers: Record<string, string> | null;
  managerAnswers: Record<string, string> | null;
  agreements: Agreement[] | null;
  resultingContractId: string | null;
  reviewer: { id: string; name: string | null } | null;
  createdAt: string;
}

const STATUS_LABELS: Record<string, string> = {
  PLANNED: "Gepland",
  SELF_COMPLETED: "Zelfbeoordeling ingediend",
  COMPLETED: "Afgerond",
};

const STATUS_VARIANTS: Record<string, "default" | "secondary" | "outline"> = {
  PLANNED: "outline",
  SELF_COMPLETED: "secondary",
  COMPLETED: "default",
};

function allQuestions(snapshot: { sections: Section[] }) {
  return snapshot.sections.flatMap((s) => s.questions);
}

function ReviewEditor({ review, onClose }: { review: Review; onClose: () => void }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [showFinalize, setShowFinalize] = useState(false);
  const [salaryMonthly, setSalaryMonthly] = useState("");
  const [effectiveDate, setEffectiveDate] = useState("");

  const managerQuestions = allQuestions(review.formSnapshot).filter((q) => q.respondent === "MANAGER");
  const selfQuestions = allQuestions(review.formSnapshot).filter((q) => q.respondent === "SELF");

  const [managerAnswers, setManagerAnswers] = useState<Record<string, string>>(
    () => Object.fromEntries(managerQuestions.map((q) => [q.key, review.managerAnswers?.[q.key] ?? ""])),
  );

  const [agreements, setAgreements] = useState<Agreement[]>(
    () => review.agreements ?? [],
  );

  const completed = review.status === "COMPLETED";

  async function save(extra?: object) {
    setLoading(true);
    setError("");
    const res = await fetch(`/api/reviews/${review.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ managerAnswers, agreements, ...extra }),
    });
    setLoading(false);
    if (res.ok) {
      onClose();
      router.refresh();
    } else {
      const err = await res.json().catch(() => ({}));
      setError(err.error ?? "Fout bij opslaan");
    }
  }

  function handleFinalize() {
    const extra: Record<string, unknown> = { finalize: true };
    if (salaryMonthly) extra.salaryMonthly = Number(salaryMonthly);
    if (effectiveDate) extra.effectiveDate = effectiveDate;
    save(extra);
  }

  return (
    <div className="space-y-6 max-h-[70vh] overflow-y-auto pr-1">
      {/* Self eval (read-only) */}
      {selfQuestions.length > 0 && (
        <div className="space-y-3">
          <h3 className="font-semibold text-sm">Zelfbeoordeling medewerker</h3>
          {selfQuestions.map((q) => (
            <div key={q.key} className="space-y-1">
              <p className="text-sm font-medium">{q.label}</p>
              {q.hint && <p className="text-xs text-muted-foreground">{q.hint}</p>}
              <p className="text-sm bg-muted/40 rounded px-3 py-2 whitespace-pre-wrap">
                {review.selfAnswers?.[q.key] || <span className="text-muted-foreground">—</span>}
              </p>
            </div>
          ))}
        </div>
      )}

      {/* Manager eval */}
      {managerQuestions.length > 0 && (
        <div className="space-y-3">
          <h3 className="font-semibold text-sm">Beoordeling manager</h3>
          {managerQuestions.map((q) => (
            <div key={q.key} className="space-y-1">
              <Label className="text-sm">{q.label}</Label>
              {q.hint && <p className="text-xs text-muted-foreground">{q.hint}</p>}
              {completed ? (
                <p className="text-sm bg-muted/40 rounded px-3 py-2 whitespace-pre-wrap">
                  {review.managerAnswers?.[q.key] || <span className="text-muted-foreground">—</span>}
                </p>
              ) : (
                <Textarea
                  value={managerAnswers[q.key] ?? ""}
                  onChange={(e) => setManagerAnswers((prev) => ({ ...prev, [q.key]: e.target.value }))}
                  rows={3}
                />
              )}
            </div>
          ))}
        </div>
      )}

      {/* Agreements */}
      <div className="space-y-3">
        <h3 className="font-semibold text-sm">Afspraken</h3>
        {(completed ? review.agreements ?? [] : agreements).map((ag, i) => (
          <div key={i} className="grid grid-cols-[1fr_1fr_auto] gap-2 items-start">
            {completed ? (
              <>
                <p className="text-sm bg-muted/40 rounded px-3 py-2">{ag.action || <span className="text-muted-foreground">—</span>}</p>
                <p className="text-sm bg-muted/40 rounded px-3 py-2">{ag.result || <span className="text-muted-foreground">—</span>}</p>
                <div />
              </>
            ) : (
              <>
                <Input
                  placeholder="Actie"
                  value={ag.action}
                  onChange={(e) => setAgreements((prev) => prev.map((a, j) => j === i ? { ...a, action: e.target.value } : a))}
                />
                <Input
                  placeholder="Resultaat"
                  value={ag.result}
                  onChange={(e) => setAgreements((prev) => prev.map((a, j) => j === i ? { ...a, result: e.target.value } : a))}
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={() => setAgreements((prev) => prev.filter((_, j) => j !== i))}
                >
                  <Trash2 className="h-4 w-4 text-destructive" />
                </Button>
              </>
            )}
          </div>
        ))}
        {!completed && agreements.length < 3 && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setAgreements((prev) => [...prev, { action: "", result: "" }])}
          >
            <Plus className="h-4 w-4 mr-1" /> Afspraak toevoegen
          </Button>
        )}
      </div>

      {completed && review.resultingContractId && (
        <p className="text-sm text-green-700 bg-green-50 border border-green-200 rounded px-3 py-2">
          Salaris aangepast (nieuw contract aangemaakt)
        </p>
      )}

      {error && <p className="text-sm text-destructive">{error}</p>}

      {!completed && (
        <div className="flex flex-wrap gap-2 pt-2">
          <Button type="button" disabled={loading} onClick={() => save()}>
            {loading ? "Opslaan..." : "Opslaan"}
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={() => setShowFinalize((v) => !v)}
          >
            Afronden {showFinalize ? <ChevronUp className="h-4 w-4 ml-1" /> : <ChevronDown className="h-4 w-4 ml-1" />}
          </Button>
        </div>
      )}

      {!completed && showFinalize && (
        <div className="border rounded p-4 space-y-3 bg-muted/20">
          <p className="text-sm text-muted-foreground">Optioneel: salariswijziging bij afronden</p>
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <Label>Nieuw maandsalaris</Label>
              <Input
                type="number"
                step="0.01"
                min="0"
                placeholder="bijv. 3800"
                value={salaryMonthly}
                onChange={(e) => setSalaryMonthly(e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <Label>Ingangsdatum</Label>
              <input
                type="date"
                className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm"
                value={effectiveDate}
                onChange={(e) => setEffectiveDate(e.target.value)}
              />
            </div>
          </div>
          <Button
            type="button"
            disabled={loading}
            onClick={() => {
              if (confirm("Beoordeling afronden? Dit kan niet ongedaan worden gemaakt.")) handleFinalize();
            }}
          >
            {loading ? "Afronden..." : "Bevestig afronden"}
          </Button>
        </div>
      )}
    </div>
  );
}

export function ReviewsAdminClient({ userId, initialReviews }: { userId: string; initialReviews: Review[] }) {
  const router = useRouter();
  const [planOpen, setPlanOpen] = useState(false);
  const [period, setPeriod] = useState("");
  const [plannedDate, setPlannedDate] = useState("");
  const [planLoading, setPlanLoading] = useState(false);
  const [planError, setPlanError] = useState("");
  const [editorReviewId, setEditorReviewId] = useState<string | null>(null);

  async function planReview() {
    setPlanLoading(true);
    setPlanError("");
    const res = await fetch("/api/reviews", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId, period: period || "", plannedDate: plannedDate || "" }),
    });
    setPlanLoading(false);
    if (res.ok) {
      setPlanOpen(false);
      setPeriod("");
      setPlannedDate("");
      router.refresh();
    } else {
      const err = await res.json().catch(() => ({}));
      setPlanError(err.error ?? "Fout bij plannen");
    }
  }

  async function deleteReview(id: string) {
    if (!confirm("Beoordeling verwijderen?")) return;
    const res = await fetch(`/api/reviews/${id}`, { method: "DELETE" });
    if (res.ok) router.refresh();
  }

  const editorReview = initialReviews.find((r) => r.id === editorReviewId) ?? null;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold">Beoordelingen</h2>
        <Button onClick={() => { setPlanOpen(true); setPlanError(""); }}>
          <Plus className="h-4 w-4 mr-2" /> Nieuwe beoordeling plannen
        </Button>
      </div>

      {initialReviews.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-center text-muted-foreground text-sm">
            Nog geen beoordelingen
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Periode</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Gepland op</TableHead>
                  <TableHead>Beoordelaar</TableHead>
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {initialReviews.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell className="font-mono text-sm">{r.period}</TableCell>
                    <TableCell>
                      <Badge variant={STATUS_VARIANTS[r.status] ?? "outline"}>
                        {STATUS_LABELS[r.status] ?? r.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-sm">{r.plannedDate ?? <span className="text-muted-foreground">—</span>}</TableCell>
                    <TableCell className="text-sm">{r.reviewer?.name ?? <span className="text-muted-foreground">—</span>}</TableCell>
                    <TableCell>
                      <div className="flex gap-1 justify-end">
                        <Button variant="ghost" size="sm" onClick={() => setEditorReviewId(r.id)}>
                          Openen
                        </Button>
                        <Button variant="ghost" size="icon" onClick={() => deleteReview(r.id)}>
                          <Trash2 className="h-3.5 w-3.5 text-destructive" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {/* Plan dialog */}
      <Dialog open={planOpen} onOpenChange={setPlanOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Nieuwe beoordeling plannen</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <Label>Periode</Label>
              <Input
                placeholder="bijv. 2026-Q3"
                value={period}
                onChange={(e) => setPeriod(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">Leeg = huidig kwartaal</p>
            </div>
            <div className="space-y-1">
              <Label>Geplande datum</Label>
              <input
                type="date"
                className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm"
                value={plannedDate}
                onChange={(e) => setPlannedDate(e.target.value)}
              />
            </div>
            {planError && <p className="text-sm text-destructive">{planError}</p>}
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setPlanOpen(false)}>Annuleren</Button>
            <Button type="button" disabled={planLoading} onClick={planReview}>
              {planLoading ? "Plannen..." : "Plannen"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Editor dialog */}
      <Dialog open={!!editorReview} onOpenChange={(open) => { if (!open) setEditorReviewId(null); }}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>
              Beoordeling {editorReview?.period}
              {editorReview && (
                <Badge variant={STATUS_VARIANTS[editorReview.status] ?? "outline"} className="ml-2">
                  {STATUS_LABELS[editorReview.status] ?? editorReview.status}
                </Badge>
              )}
            </DialogTitle>
          </DialogHeader>
          {editorReview && (
            <ReviewEditor review={editorReview} onClose={() => setEditorReviewId(null)} />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
