"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { ReviewDefinition } from "@/lib/reviews";

type ReviewStatus = "PLANNED" | "SELF_COMPLETED" | "COMPLETED";

interface Agreement { action: string; result: string; }

interface Review {
  id: string;
  userId: string;
  period: string;
  status: ReviewStatus;
  plannedDate: string | null;
  formSnapshot: ReviewDefinition;
  selfAnswers: Record<string, string> | null;
  managerAnswers: Record<string, string> | null;
  agreements: Agreement[] | null;
  resultingContractId: string | null;
  selfCompletedAt: string | null;
  completedAt: string | null;
}

const STATUS_LABELS: Record<ReviewStatus, string> = {
  PLANNED: "Zelfbeoordeling invullen",
  SELF_COMPLETED: "Ingediend",
  COMPLETED: "Afgerond",
};

const STATUS_VARIANTS: Record<ReviewStatus, "default" | "secondary" | "outline"> = {
  PLANNED: "default",
  SELF_COMPLETED: "secondary",
  COMPLETED: "outline",
};

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("nl-NL", { day: "numeric", month: "long", year: "numeric" });
}

function ReviewCard({ review }: { review: Review }) {
  const router = useRouter();
  const selfQuestions = review.formSnapshot.sections
    .flatMap((s) => s.questions)
    .filter((q) => q.respondent === "SELF");
  const managerQuestions = review.formSnapshot.sections
    .flatMap((s) => s.questions)
    .filter((q) => q.respondent === "MANAGER");

  const [answers, setAnswers] = useState<Record<string, string>>(
    Object.fromEntries(selfQuestions.map((q) => [q.key, review.selfAnswers?.[q.key] ?? ""]))
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function save(submit?: boolean) {
    if (submit && !confirm("Zelfbeoordeling indienen? Je kunt daarna niets meer aanpassen.")) return;
    setSaving(true);
    setError("");
    const res = await fetch(`/api/reviews/${review.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ selfAnswers: answers, ...(submit ? { submit: true } : {}) }),
    });
    setSaving(false);
    if (res.ok) {
      router.refresh();
    } else {
      const err = await res.json().catch(() => ({}));
      setError(err.error ?? "Fout bij opslaan");
    }
  }

  const isEditable = review.status === "PLANNED" || review.status === "SELF_COMPLETED";

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between flex-wrap gap-2">
          <CardTitle className="text-lg">{review.period}</CardTitle>
          <Badge variant={STATUS_VARIANTS[review.status]}>{STATUS_LABELS[review.status]}</Badge>
        </div>
        {review.plannedDate && (
          <p className="text-sm text-muted-foreground">Gepland: {formatDate(review.plannedDate)}</p>
        )}
      </CardHeader>
      <CardContent className="space-y-6">
        {isEditable && (
          <div className="space-y-4">
            <h3 className="font-medium text-sm">Jouw zelfbeoordeling</h3>
            {selfQuestions.map((q) => (
              <div key={q.key} className="space-y-1">
                <Label>{q.label}</Label>
                {q.hint && <p className="text-xs text-muted-foreground">{q.hint}</p>}
                <Textarea
                  value={answers[q.key] ?? ""}
                  onChange={(e) => setAnswers((prev) => ({ ...prev, [q.key]: e.target.value }))}
                  rows={3}
                />
              </div>
            ))}
            {error && <p className="text-sm text-destructive">{error}</p>}
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => save()} disabled={saving}>
                {saving ? "Opslaan..." : "Opslaan"}
              </Button>
              {review.status === "PLANNED" && (
                <Button onClick={() => save(true)} disabled={saving}>
                  Indienen
                </Button>
              )}
            </div>
          </div>
        )}

        {review.status === "COMPLETED" && (
          <>
            {selfQuestions.length > 0 && (
              <div className="space-y-3">
                <h3 className="font-medium text-sm">Jouw zelfbeoordeling</h3>
                {selfQuestions.map((q) => (
                  <div key={q.key} className="space-y-1">
                    <p className="text-sm font-medium">{q.label}</p>
                    <p className="text-sm text-muted-foreground whitespace-pre-wrap">
                      {review.selfAnswers?.[q.key] || <span className="italic">Geen antwoord</span>}
                    </p>
                  </div>
                ))}
              </div>
            )}

            {managerQuestions.length > 0 && (
              <div className="space-y-3">
                <h3 className="font-medium text-sm">Beoordeling leidinggevende</h3>
                {managerQuestions.map((q) => (
                  <div key={q.key} className="space-y-1">
                    <p className="text-sm font-medium">{q.label}</p>
                    <p className="text-sm text-muted-foreground whitespace-pre-wrap">
                      {review.managerAnswers?.[q.key] || <span className="italic">Geen antwoord</span>}
                    </p>
                  </div>
                ))}
              </div>
            )}

            {review.agreements && review.agreements.length > 0 && (
              <div className="space-y-2">
                <h3 className="font-medium text-sm">Afspraken</h3>
                <ul className="space-y-1">
                  {review.agreements.map((a, i) => (
                    <li key={i} className="text-sm">
                      <span className="font-medium">{a.action}</span>
                      {a.result && <span className="text-muted-foreground"> — {a.result}</span>}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {review.resultingContractId && (
              <p className="text-sm text-muted-foreground border-t pt-3">
                Je salaris is aangepast naar aanleiding van deze beoordeling.
              </p>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}

export function MyReviewsClient({ initialReviews }: { initialReviews: Review[] }) {
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Mijn beoordelingen</h1>
      {initialReviews.length === 0 ? (
        <p className="text-muted-foreground">Je hebt nog geen beoordelingen.</p>
      ) : (
        <div className="space-y-4">
          {initialReviews.map((r) => (
            <ReviewCard key={r.id} review={r} />
          ))}
        </div>
      )}
    </div>
  );
}
