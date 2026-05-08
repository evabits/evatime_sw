"use client";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Plus, Pencil, Trash2, Check, X } from "lucide-react";
import { formatCurrency } from "@/lib/utils";

const schema = z.object({
  name: z.string().min(1, "Verplicht"),
  defaultRate: z.coerce.number().positive().optional().or(z.literal("")),
});

type FormData = z.infer<typeof schema>;

interface Props {
  initialTypes: any[];
}

export function ActivityTypesClient({ initialTypes }: Props) {
  const [types, setTypes] = useState(initialTypes);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const form = useForm<FormData>({ resolver: zodResolver(schema) });

  async function onSubmit(data: FormData) {
    setLoading(true);
    const payload = { ...data, defaultRate: data.defaultRate === "" ? null : data.defaultRate || null };
    try {
      if (editing) {
        const res = await fetch(`/api/activity-types/${editing}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        if (res.ok) {
          const updated = await res.json();
          setTypes((prev) => prev.map((t) => (t.id === editing ? updated : t)));
          cancel();
        }
      } else {
        const res = await fetch("/api/activity-types", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        if (res.ok) {
          const created = await res.json();
          setTypes((prev) => [...prev, created].sort((a, b) => a.name.localeCompare(b.name)));
          cancel();
        }
      }
    } finally {
      setLoading(false);
    }
  }

  function cancel() {
    setShowForm(false);
    setEditing(null);
    form.reset();
  }

  function startEdit(type: any) {
    setEditing(type.id);
    form.reset({ name: type.name, defaultRate: type.defaultRate ? Number(type.defaultRate) : "" });
    setShowForm(true);
  }

  async function deleteType(id: string) {
    if (!confirm("Weet u zeker dat u dit activiteittype wilt verwijderen?")) return;
    await fetch(`/api/activity-types/${id}`, { method: "DELETE" });
    setTypes((prev) => prev.filter((t) => t.id !== id));
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Activiteittypes</h1>
        <p className="text-muted-foreground">Beheer de soorten werkzaamheden en hun standaardtarieven</p>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Activiteittypes</CardTitle>
              <CardDescription>Standaardtarieven kunnen per project worden overschreven</CardDescription>
            </div>
            <Button size="sm" onClick={() => { cancel(); setShowForm(true); }}>
              <Plus className="h-4 w-4 mr-2" /> Toevoegen
            </Button>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Naam</TableHead>
                <TableHead className="text-right">Standaardtarief</TableHead>
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {showForm && (
                <TableRow>
                  <TableCell>
                    <Input {...form.register("name")} placeholder="Bijv. Ontwikkeling" autoFocus />
                    {form.formState.errors.name && <p className="text-xs text-destructive mt-1">{form.formState.errors.name.message}</p>}
                  </TableCell>
                  <TableCell>
                    <Input type="number" step="0.01" min="0" placeholder="95.00" {...form.register("defaultRate")} className="text-right" />
                  </TableCell>
                  <TableCell>
                    <div className="flex gap-1 justify-end">
                      <Button size="icon" variant="ghost" onClick={form.handleSubmit(onSubmit)} disabled={loading}>
                        <Check className="h-4 w-4 text-green-600" />
                      </Button>
                      <Button size="icon" variant="ghost" onClick={cancel}>
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              )}
              {types.length === 0 && !showForm && (
                <TableRow><TableCell colSpan={3} className="text-center text-muted-foreground py-8">Geen activiteittypes gevonden</TableCell></TableRow>
              )}
              {types.map((t) => (
                <TableRow key={t.id}>
                  <TableCell className="font-medium">{t.name}</TableCell>
                  <TableCell className="text-right">{t.defaultRate ? formatCurrency(Number(t.defaultRate)) + "/u" : "—"}</TableCell>
                  <TableCell>
                    <div className="flex gap-1 justify-end">
                      <Button variant="ghost" size="icon" onClick={() => startEdit(t)}>
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button variant="ghost" size="icon" onClick={() => deleteType(t.id)}>
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
    </div>
  );
}
