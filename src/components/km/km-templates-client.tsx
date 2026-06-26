"use client";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Pencil, Trash2 } from "lucide-react";

interface Props {
  initialTemplates: any[];
}

export function KmTemplatesClient({ initialTemplates }: Props) {
  const [templates, setTemplates] = useState(initialTemplates);
  const [renaming, setRenaming] = useState<any>(null);
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  function startRename(t: any) {
    setRenaming(t);
    setName(t.name);
    setError("");
  }

  async function saveRename() {
    if (!name.trim() || !renaming) return;
    setSaving(true);
    setError("");
    try {
      const res = await fetch(`/api/km/templates/${renaming.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim() }),
      });
      if (res.ok) {
        const updated = await res.json();
        setTemplates((prev) =>
          prev.map((t) => (t.id === updated.id ? updated : t)).sort((a, b) => a.name.localeCompare(b.name))
        );
        setRenaming(null);
      } else if (res.status === 409) {
        setError("Naam bestaat al");
      } else {
        setError("Opslaan mislukt");
      }
    } finally {
      setSaving(false);
    }
  }

  async function deleteTemplate(id: string) {
    if (!confirm("Weet u zeker dat u dit sjabloon wilt verwijderen?")) return;
    await fetch(`/api/km/templates/${id}`, { method: "DELETE" });
    setTemplates((prev) => prev.filter((t) => t.id !== id));
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Km-sjablonen</h1>
        <p className="text-muted-foreground">Beheer uw opgeslagen ritten</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Sjablonen</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Naam</TableHead>
                <TableHead>Project</TableHead>
                <TableHead>Activiteit</TableHead>
                <TableHead className="text-right">Km</TableHead>
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {templates.length === 0 && (
                <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-8">Geen sjablonen</TableCell></TableRow>
              )}
              {templates.map((t) => (
                <TableRow key={t.id}>
                  <TableCell className="font-medium">{t.name}</TableCell>
                  <TableCell>
                    <div>{t.project?.name}</div>
                    <div className="text-xs text-muted-foreground">{t.project?.customer?.name}</div>
                  </TableCell>
                  <TableCell>{t.activityType?.name ?? "—"}</TableCell>
                  <TableCell className="text-right font-mono">{Number(t.km).toFixed(1)}</TableCell>
                  <TableCell>
                    <div className="flex gap-1 justify-end">
                      <Button variant="ghost" size="icon" onClick={() => startRename(t)}>
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button variant="ghost" size="icon" onClick={() => deleteTemplate(t.id)}>
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

      <Dialog open={!!renaming} onOpenChange={(o) => { if (!o) setRenaming(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Sjabloon hernoemen</DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            <Label>Naam</Label>
            <Input
              value={name}
              onChange={(e) => { setName(e.target.value); setError(""); }}
              onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); saveRename(); } }}
              autoFocus
            />
            {error && <p className="text-xs text-destructive">{error}</p>}
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setRenaming(null)}>Annuleren</Button>
            <Button type="button" onClick={saveRename} disabled={saving || !name.trim()}>
              {saving ? "Opslaan..." : "Opslaan"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
