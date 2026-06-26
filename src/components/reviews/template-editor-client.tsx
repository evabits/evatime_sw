"use client";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Trash2, Plus } from "lucide-react";
import type { ReviewDefinition, ReviewSection, ReviewQuestion, Respondent } from "@/lib/reviews";

export function TemplateEditorClient({ initialDefinition }: { initialDefinition: ReviewDefinition }) {
  const [sections, setSections] = useState(initialDefinition.sections);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<{ ok: boolean; msg: string } | null>(null);

  function updateSection(si: number, patch: Partial<ReviewSection>) {
    setSections((prev) => prev.map((s, i) => (i === si ? { ...s, ...patch } : s)));
  }

  function removeSection(si: number) {
    setSections((prev) => prev.filter((_, i) => i !== si));
  }

  function updateQuestion(si: number, qi: number, patch: Partial<ReviewQuestion>) {
    setSections((prev) =>
      prev.map((s, i) =>
        i !== si ? s : { ...s, questions: s.questions.map((q, j) => (j === qi ? { ...q, ...patch } : q)) }
      )
    );
  }

  function removeQuestion(si: number, qi: number) {
    setSections((prev) =>
      prev.map((s, i) =>
        i !== si ? s : { ...s, questions: s.questions.filter((_, j) => j !== qi) }
      )
    );
  }

  function addQuestion(si: number) {
    setSections((prev) =>
      prev.map((s, i) =>
        i !== si
          ? s
          : { ...s, questions: [...s.questions, { key: "", label: "", hint: "", respondent: "MANAGER" as Respondent }] }
      )
    );
  }

  function addSection() {
    setSections((prev) => [...prev, { title: "", questions: [] }]);
  }

  async function handleSave() {
    // Validate
    const allQuestions = sections.flatMap((s) => s.questions);
    const empty = allQuestions.find((q) => !q.key.trim() || !q.label.trim());
    if (empty) {
      setStatus({ ok: false, msg: `Elke vraag moet een sleutel en label hebben (probleem bij: "${empty.label || empty.key || "lege vraag"}")` });
      return;
    }
    const keys = allQuestions.map((q) => q.key.trim());
    const dupe = keys.find((k, i) => keys.indexOf(k) !== i);
    if (dupe) {
      setStatus({ ok: false, msg: `Sleutel "${dupe}" komt meerdere keren voor — sleutels moeten uniek zijn` });
      return;
    }

    setSaving(true);
    setStatus(null);
    const res = await fetch("/api/review-template", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sections }),
    });
    setSaving(false);
    if (res.ok) {
      setStatus({ ok: true, msg: "Opgeslagen" });
      setTimeout(() => setStatus(null), 3000);
    } else {
      const err = await res.json().catch(() => ({}));
      setStatus({ ok: false, msg: err.error ?? "Fout bij opslaan" });
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Beoordelingssjabloon</h1>
        <p className="text-muted-foreground">
          Wijzigingen gelden alleen voor nieuwe beoordelingen — lopende beoordelingen behouden hun eigen snapshot.
        </p>
      </div>

      {sections.map((section, si) => (
        <Card key={si} className="max-w-4xl">
          <CardHeader className="pb-3">
            <div className="flex items-center gap-3">
              <Input
                className="text-base font-semibold flex-1"
                placeholder="Sectietitel"
                value={section.title}
                onChange={(e) => updateSection(si, { title: e.target.value })}
              />
              <Button
                variant="ghost"
                size="icon"
                className="text-muted-foreground hover:text-destructive shrink-0"
                onClick={() => removeSection(si)}
                aria-label="Sectie verwijderen"
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            {section.questions.map((q, qi) => (
              <div key={qi} className="flex items-center gap-2 flex-wrap">
                <Input
                  className="flex-1 min-w-40"
                  placeholder="Label"
                  value={q.label}
                  onChange={(e) => updateQuestion(si, qi, { label: e.target.value })}
                />
                <Input
                  className="flex-1 min-w-32"
                  placeholder="Toelichting (optioneel)"
                  value={q.hint ?? ""}
                  onChange={(e) => updateQuestion(si, qi, { hint: e.target.value })}
                />
                <Select
                  value={q.respondent}
                  onValueChange={(v) => updateQuestion(si, qi, { respondent: v as Respondent })}
                >
                  <SelectTrigger className="w-44 shrink-0">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="SELF">Medewerker</SelectItem>
                    <SelectItem value="MANAGER">Leidinggevende</SelectItem>
                  </SelectContent>
                </Select>
                <Input
                  className="w-32 shrink-0 font-mono text-sm"
                  placeholder="sleutel"
                  value={q.key}
                  onChange={(e) => updateQuestion(si, qi, { key: e.target.value })}
                />
                <Button
                  variant="ghost"
                  size="icon"
                  className="text-muted-foreground hover:text-destructive shrink-0"
                  onClick={() => removeQuestion(si, qi)}
                  aria-label="Vraag verwijderen"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            ))}
            <Button variant="outline" size="sm" onClick={() => addQuestion(si)}>
              <Plus className="h-4 w-4 mr-1" /> Vraag toevoegen
            </Button>
          </CardContent>
        </Card>
      ))}

      <div className="max-w-4xl">
        <Button variant="outline" onClick={addSection}>
          <Plus className="h-4 w-4 mr-1" /> Sectie toevoegen
        </Button>
      </div>

      <div className="max-w-4xl flex items-center gap-3 pb-6">
        <Button onClick={handleSave} disabled={saving}>
          {saving ? "Opslaan..." : "Opslaan"}
        </Button>
        {status && (
          <p className={`text-sm ${status.ok ? "text-green-600" : "text-destructive"}`}>{status.msg}</p>
        )}
      </div>
    </div>
  );
}
