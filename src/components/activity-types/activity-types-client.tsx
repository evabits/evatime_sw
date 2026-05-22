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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Plus, Pencil, Trash2 } from "lucide-react";
import { formatCurrency } from "@/lib/utils";

const schema = z.object({
  name: z.string().min(1, "Verplicht"),
  defaultRate: z.coerce.number().positive().optional().or(z.literal("")),
  billable: z.boolean(),
  showInAllProjects: z.boolean(),
});

type FormData = z.infer<typeof schema>;

interface Props {
  initialTypes: any[];
  projects: any[];
}

export function ActivityTypesClient({ initialTypes, projects }: Props) {
  const [types, setTypes] = useState(initialTypes);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [selectedProjectIds, setSelectedProjectIds] = useState<string[]>([]);

  const form = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: { billable: true, showInAllProjects: false },
  });

  const showInAllProjects = form.watch("showInAllProjects");

  function toggleProject(projectId: string) {
    setSelectedProjectIds((prev) =>
      prev.includes(projectId) ? prev.filter((id) => id !== projectId) : [...prev, projectId]
    );
  }

  async function onSubmit(data: FormData) {
    setLoading(true);
    const payload = {
      ...data,
      defaultRate: data.defaultRate === "" ? null : data.defaultRate || null,
      projectIds: data.showInAllProjects ? [] : selectedProjectIds,
    };
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
          closeDialog();
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
          closeDialog();
        }
      }
    } finally {
      setLoading(false);
    }
  }

  function closeDialog() {
    setDialogOpen(false);
    setEditing(null);
    setSelectedProjectIds([]);
    form.reset({ billable: true, showInAllProjects: false });
  }

  function openCreate() {
    closeDialog();
    setDialogOpen(true);
  }

  function startEdit(type: any) {
    setEditing(type.id);
    setSelectedProjectIds(type.projects?.map((p: any) => p.projectId) ?? []);
    form.reset({
      name: type.name,
      defaultRate: type.defaultRate ? Number(type.defaultRate) : "",
      billable: type.billable,
      showInAllProjects: type.showInAllProjects,
    });
    setDialogOpen(true);
  }

  async function deleteType(id: string) {
    if (!confirm("Weet u zeker dat u dit activiteittype wilt verwijderen?")) return;
    await fetch(`/api/activity-types/${id}`, { method: "DELETE" });
    setTypes((prev) => prev.filter((t) => t.id !== id));
  }

  // Group projects by customer for the multi-select
  const projectsByCustomer = projects.reduce((acc: Record<string, any[]>, p: any) => {
    const key = p.customer.name;
    if (!acc[key]) acc[key] = [];
    acc[key].push(p);
    return acc;
  }, {});

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
            <Button size="sm" onClick={openCreate}>
              <Plus className="h-4 w-4 mr-2" /> Toevoegen
            </Button>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Naam</TableHead>
                <TableHead>Factureerbaar</TableHead>
                <TableHead>Zichtbaarheid</TableHead>
                <TableHead className="text-right">Standaardtarief</TableHead>
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {types.length === 0 && (
                <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-8">Geen activiteittypes gevonden</TableCell></TableRow>
              )}
              {types.map((t) => {
                const linkedCount = t.projects?.length ?? 0;
                return (
                  <TableRow key={t.id}>
                    <TableCell className="font-medium">{t.name}</TableCell>
                    <TableCell>{t.billable ? "Ja" : "Nee"}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {t.showInAllProjects ? "Alle projecten" : linkedCount === 0 ? "Geen projecten" : `${linkedCount} project${linkedCount !== 1 ? "en" : ""}`}
                    </TableCell>
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
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Dialog open={dialogOpen} onOpenChange={(open) => { if (!open) closeDialog(); }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editing ? "Activiteittype aanpassen" : "Activiteittype toevoegen"}</DialogTitle>
          </DialogHeader>

          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>Naam *</Label>
                <Input {...form.register("name")} placeholder="Bijv. Ontwikkeling" autoFocus />
                {form.formState.errors.name && <p className="text-xs text-destructive">{form.formState.errors.name.message}</p>}
              </div>

              <div className="space-y-2">
                <Label>Standaardtarief (€/u)</Label>
                <Input type="number" step="0.01" min="0" placeholder="95.00" {...form.register("defaultRate")} />
              </div>

              <div className="space-y-2">
                <Label>Factureerbaar</Label>
                <Select
                  value={form.watch("billable") ? "true" : "false"}
                  onValueChange={(v) => form.setValue("billable", v === "true")}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="true">Ja</SelectItem>
                    <SelectItem value="false">Nee</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Tonen in projecten</Label>
                <Select
                  value={form.watch("showInAllProjects") ? "all" : "specific"}
                  onValueChange={(v) => form.setValue("showInAllProjects", v === "all")}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Alle projecten</SelectItem>
                    <SelectItem value="specific">Specifieke projecten</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {!showInAllProjects && (
              <div className="space-y-2">
                <Label>Gekoppelde projecten</Label>
                {projects.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Geen actieve projecten gevonden</p>
                ) : (
                  <div className="border rounded-md max-h-48 overflow-y-auto p-2 space-y-3">
                    {Object.entries(projectsByCustomer).map(([customerName, customerProjects]) => (
                      <div key={customerName}>
                        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide px-1 mb-1">{customerName}</p>
                        <div className="space-y-1">
                          {(customerProjects as any[]).map((p) => (
                            <label key={p.id} className="flex items-center gap-2 px-1 py-0.5 rounded hover:bg-muted cursor-pointer text-sm">
                              <input
                                type="checkbox"
                                checked={selectedProjectIds.includes(p.id)}
                                onChange={() => toggleProject(p.id)}
                                className="h-4 w-4 rounded border-input accent-primary"
                              />
                              {p.name}
                            </label>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            <DialogFooter>
              <Button type="button" variant="outline" onClick={closeDialog}>Annuleren</Button>
              <Button type="submit" disabled={loading}>{loading ? "Opslaan..." : (editing ? "Opslaan" : "Toevoegen")}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
