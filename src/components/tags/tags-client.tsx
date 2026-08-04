"use client";
import { Fragment, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Plus, Pencil, Check, X, ChevronRight, ChevronDown } from "lucide-react";
import { isReservedTagName } from "@/lib/tags";

interface TagProject {
  id: string;
  name: string;
  archived: boolean;
  customer: { name: string } | null;
}
interface TagRow {
  id: string;
  name: string;
  projects: TagProject[];
}
interface Conflict {
  bronId: string;
  bronNaam: string;
  doelId: string;
  doelNaam: string;
  projectCount: number;
  aantalTeVerhuizen: number;
}

export function TagsClient({ initialTags }: { initialTags: TagRow[] }) {
  const router = useRouter();
  const [tags, setTags] = useState(initialTags);
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [open, setOpen] = useState<string[]>([]);
  const [serverError, setServerError] = useState("");
  const [conflict, setConflict] = useState<Conflict | null>(null);

  function toggle(id: string) {
    setOpen((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }

  async function create() {
    if (!newName.trim()) return;
    setServerError("");
    const res = await fetch("/api/tags", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: newName.trim() }),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      setServerError(body.error ?? `Fout ${res.status}`);
      return;
    }
    setTags((prev) => [...prev, { id: body.id, name: body.name, projects: [] }].sort((a, b) => a.name.localeCompare(b.name)));
    setNewName("");
    setAdding(false);
  }

  async function rename(id: string) {
    if (!editName.trim()) return;
    setServerError("");
    const res = await fetch(`/api/tags/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: editName.trim() }),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      setServerError(body.error ?? `Fout ${res.status}`);
      return;
    }
    if (body.conflict) {
      const bron = tags.find((t) => t.id === id);
      setConflict({
        bronId: id,
        bronNaam: bron?.name ?? "",
        doelId: body.conflict.id,
        doelNaam: body.conflict.name,
        projectCount: body.conflict.projectCount,
        aantalTeVerhuizen: bron?.projects.length ?? 0,
      });
      return;
    }
    setTags((prev) =>
      prev.map((t) => (t.id === id ? { ...t, name: body.name } : t)).sort((a, b) => a.name.localeCompare(b.name)),
    );
    setEditingId(null);
  }

  async function merge() {
    if (!conflict) return;
    setServerError("");
    const res = await fetch(`/api/tags/${conflict.bronId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: conflict.doelNaam, mergeInto: conflict.doelId }),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      setServerError(body.error ?? `Fout ${res.status}`);
      return;
    }
    setConflict(null);
    setEditingId(null);
    // De projectlijsten van twee tags samenvoegen in clienttoestand is precies
    // het soort handwerk dat stil misgaat. De servercomponent weet het exact.
    router.refresh();
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Tags</h1>
          <p className="text-muted-foreground">Beheer de tags waarmee u projecten groepeert</p>
        </div>
        <Button onClick={() => { setAdding(true); setNewName(""); setServerError(""); }}>
          <Plus className="h-4 w-4 mr-2" /> Tag toevoegen
        </Button>
      </div>

      {serverError && <p className="text-sm text-destructive">{serverError}</p>}

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-10"></TableHead>
                <TableHead>Tag</TableHead>
                <TableHead className="text-right">Projecten</TableHead>
                <TableHead className="text-right">Gearchiveerd</TableHead>
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {adding && (
                <TableRow>
                  <TableCell></TableCell>
                  <TableCell colSpan={3}>
                    <Input
                      autoFocus
                      value={newName}
                      onChange={(e) => setNewName(e.target.value)}
                      onKeyDown={(e) => { if (e.key === "Enter") create(); if (e.key === "Escape") setAdding(false); }}
                      placeholder="Naam van de tag"
                      className="h-7"
                    />
                  </TableCell>
                  <TableCell>
                    <div className="flex gap-1 justify-end">
                      <Button variant="ghost" size="icon" onClick={create}><Check className="h-3.5 w-3.5 text-primary" /></Button>
                      <Button variant="ghost" size="icon" onClick={() => setAdding(false)}><X className="h-3.5 w-3.5" /></Button>
                    </div>
                  </TableCell>
                </TableRow>
              )}
              {tags.length === 0 && !adding && (
                <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-8">Geen tags gevonden</TableCell></TableRow>
              )}
              {tags.map((t) => {
                const actief = t.projects.filter((p) => !p.archived);
                const gearchiveerd = t.projects.length - actief.length;
                const uitgeklapt = open.includes(t.id);
                const gereserveerd = isReservedTagName(t.name);
                return (
                  <Fragment key={t.id}>
                    <TableRow>
                      <TableCell>
                        {t.projects.length > 0 && (
                          <Button variant="ghost" size="icon" onClick={() => toggle(t.id)} title="Projecten tonen">
                            {uitgeklapt ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
                          </Button>
                        )}
                      </TableCell>
                      <TableCell className="font-medium">
                        {editingId === t.id ? (
                          <Input
                            autoFocus
                            value={editName}
                            onChange={(e) => setEditName(e.target.value)}
                            onKeyDown={(e) => { if (e.key === "Enter") rename(t.id); if (e.key === "Escape") setEditingId(null); }}
                            className="h-7"
                          />
                        ) : (
                          <span className="flex items-center gap-2">
                            {t.name}
                            {gereserveerd && (
                              <Badge variant="secondary" className="text-xs">gebruikt door de loonverwerking</Badge>
                            )}
                            {t.projects.length === 0 && (
                              <Badge variant="outline" className="text-xs">niet in gebruik</Badge>
                            )}
                          </span>
                        )}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">{actief.length}</TableCell>
                      <TableCell className="text-right tabular-nums">{gearchiveerd || "—"}</TableCell>
                      <TableCell>
                        <div className="flex gap-1 justify-end">
                          {editingId === t.id ? (
                            <>
                              <Button variant="ghost" size="icon" onClick={() => rename(t.id)}><Check className="h-3.5 w-3.5 text-primary" /></Button>
                              <Button variant="ghost" size="icon" onClick={() => setEditingId(null)}><X className="h-3.5 w-3.5" /></Button>
                            </>
                          ) : (
                            <Button
                              variant="ghost"
                              size="icon"
                              disabled={gereserveerd}
                              title={gereserveerd ? "Deze tag wordt gebruikt door de loonverwerking" : "Hernoemen"}
                              onClick={() => { setEditingId(t.id); setEditName(t.name); setServerError(""); }}
                            >
                              <Pencil className="h-3.5 w-3.5" />
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                    {uitgeklapt && (
                      <TableRow>
                        <TableCell></TableCell>
                        <TableCell colSpan={4} className="text-sm text-muted-foreground">
                          <div className="space-y-0.5 py-1">
                            {t.projects.map((p) => (
                              <div key={p.id}>
                                {p.customer?.name ?? "— geen klant —"} / {p.name}
                                {p.archived && <span className="ml-2 text-xs">(gearchiveerd)</span>}
                              </div>
                            ))}
                          </div>
                        </TableCell>
                      </TableRow>
                    )}
                  </Fragment>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Dialog open={conflict !== null} onOpenChange={(o) => { if (!o) setConflict(null); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Tags samenvoegen?</DialogTitle>
          </DialogHeader>
          {conflict && (
            <p className="text-sm">
              <span className="font-medium">{conflict.doelNaam}</span> bestaat al met {conflict.projectCount} project(en).
              De {conflict.aantalTeVerhuizen} project(en) van <span className="font-medium">{conflict.bronNaam}</span> worden
              aan <span className="font-medium">{conflict.doelNaam}</span> gekoppeld en{" "}
              <span className="font-medium">{conflict.bronNaam}</span> verdwijnt.
            </p>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setConflict(null)}>Annuleren</Button>
            <Button onClick={merge}>Samenvoegen</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
