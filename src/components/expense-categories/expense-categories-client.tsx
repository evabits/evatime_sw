"use client";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Plus, Pencil, Trash2, Check, X } from "lucide-react";

interface Category { id: string; name: string; }

export function ExpenseCategoriesClient({ initialCategories }: { initialCategories: Category[] }) {
  const [categories, setCategories] = useState(initialCategories);
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");

  async function create() {
    if (!newName.trim()) return;
    const res = await fetch("/api/expense-categories", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: newName.trim() }),
    });
    if (res.ok) {
      const cat = await res.json();
      setCategories((prev) => [...prev, cat].sort((a, b) => a.name.localeCompare(b.name)));
      setNewName("");
      setAdding(false);
    }
  }

  async function update(id: string) {
    if (!editName.trim()) return;
    const res = await fetch(`/api/expense-categories/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: editName.trim() }),
    });
    if (res.ok) {
      const updated = await res.json();
      setCategories((prev) => prev.map((c) => (c.id === id ? updated : c)));
      setEditingId(null);
    }
  }

  async function remove(id: string) {
    if (!confirm("Categorie verwijderen?")) return;
    const res = await fetch(`/api/expense-categories/${id}`, { method: "DELETE" });
    if (res.ok) setCategories((prev) => prev.filter((c) => c.id !== id));
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Uitgavencategorieën</h1>
          <p className="text-muted-foreground">Beheer categorieën voor uitgavenregistraties</p>
        </div>
        <Button onClick={() => { setAdding(true); setNewName(""); }}>
          <Plus className="h-4 w-4 mr-2" /> Categorie toevoegen
        </Button>
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Naam</TableHead>
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {adding && (
                <TableRow>
                  <TableCell>
                    <Input
                      autoFocus
                      value={newName}
                      onChange={(e) => setNewName(e.target.value)}
                      onKeyDown={(e) => { if (e.key === "Enter") create(); if (e.key === "Escape") setAdding(false); }}
                      placeholder="Naam categorie"
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
              {categories.length === 0 && !adding && (
                <TableRow><TableCell colSpan={2} className="text-center text-muted-foreground py-8">Geen categorieën gevonden</TableCell></TableRow>
              )}
              {categories.map((cat) => (
                <TableRow key={cat.id}>
                  <TableCell>
                    {editingId === cat.id ? (
                      <Input
                        autoFocus
                        value={editName}
                        onChange={(e) => setEditName(e.target.value)}
                        onKeyDown={(e) => { if (e.key === "Enter") update(cat.id); if (e.key === "Escape") setEditingId(null); }}
                        className="h-7"
                      />
                    ) : cat.name}
                  </TableCell>
                  <TableCell>
                    <div className="flex gap-1 justify-end">
                      {editingId === cat.id ? (
                        <>
                          <Button variant="ghost" size="icon" onClick={() => update(cat.id)}><Check className="h-3.5 w-3.5 text-primary" /></Button>
                          <Button variant="ghost" size="icon" onClick={() => setEditingId(null)}><X className="h-3.5 w-3.5" /></Button>
                        </>
                      ) : (
                        <>
                          <Button variant="ghost" size="icon" onClick={() => { setEditingId(cat.id); setEditName(cat.name); }}><Pencil className="h-3.5 w-3.5" /></Button>
                          <Button variant="ghost" size="icon" onClick={() => remove(cat.id)}><Trash2 className="h-3.5 w-3.5 text-destructive" /></Button>
                        </>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
