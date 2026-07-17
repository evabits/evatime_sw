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

const schema = z.object({
  name: z.string().min(1, "Verplicht"),
  projectId: z.string().min(1, "Verplicht"),
  activityTypeId: z.string().optional(),
  km: z.coerce.number().positive("Moet groter dan 0 zijn"),
  description: z.string().optional(),
});

type FormData = z.infer<typeof schema>;

interface Props {
  employeeId: string;
  initialTemplates: any[];
  projects: any[];
  activityTypes: any[];
}

export function CommuteTemplateClient({ employeeId, initialTemplates, projects, activityTypes }: Props) {
  const [templates, setTemplates] = useState(initialTemplates);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [apiError, setApiError] = useState("");

  const form = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: { name: "", projectId: "", activityTypeId: "", km: undefined, description: "" },
  });

  function closeDialog() {
    setDialogOpen(false);
    setEditing(null);
    setApiError("");
    form.reset({ name: "", projectId: "", activityTypeId: "", km: undefined, description: "" });
  }

  function openCreate() {
    closeDialog();
    setDialogOpen(true);
  }

  function startEdit(t: any) {
    setEditing(t.id);
    setApiError("");
    form.reset({
      name: t.name,
      projectId: t.project?.id ?? "",
      activityTypeId: t.activityType?.id ?? "",
      km: t.km,
      description: t.description ?? "",
    });
    setDialogOpen(true);
  }

  async function onSubmit(data: FormData) {
    setLoading(true);
    setApiError("");
    try {
      if (editing) {
        const res = await fetch(`/api/km/templates/${editing}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: data.name,
            projectId: data.projectId,
            activityTypeId: data.activityTypeId || null,
            km: data.km,
            description: data.description || null,
          }),
        });
        if (res.status === 409) { setApiError("Naam bestaat al"); return; }
        if (res.ok) {
          const updated = await res.json();
          setTemplates((prev) =>
            prev.map((t) => (t.id === editing ? { ...updated, km: Number(updated.km) } : t))
              .sort((a, b) => a.name.localeCompare(b.name))
          );
          closeDialog();
        }
      } else {
        const res = await fetch("/api/km/templates", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: data.name,
            projectId: data.projectId,
            activityTypeId: data.activityTypeId || null,
            km: data.km,
            description: data.description || null,
            userId: employeeId,
            managedByAdmin: true,
          }),
        });
        if (res.status === 409) { setApiError("Naam bestaat al"); return; }
        if (res.ok) {
          const created = await res.json();
          setTemplates((prev) =>
            [...prev, { ...created, km: Number(created.km) }].sort((a, b) => a.name.localeCompare(b.name))
          );
          closeDialog();
        }
      }
    } finally {
      setLoading(false);
    }
  }

  async function deleteTemplate(id: string) {
    if (!confirm("Weet u zeker dat u dit woon-werk sjabloon wilt verwijderen?")) return;
    const res = await fetch(`/api/km/templates/${id}`, { method: "DELETE" });
    if (res.ok) setTemplates((prev) => prev.filter((t) => t.id !== id));
  }

  return (
    <>
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Woon-werk sjablonen</CardTitle>
              <CardDescription>Beheer het woon-werk km-sjabloon voor deze medewerker</CardDescription>
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
                <TableHead>Project</TableHead>
                <TableHead>Activiteit</TableHead>
                <TableHead className="text-right">Km</TableHead>
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {templates.length === 0 && (
                <TableRow>
                  <TableCell colSpan={5} className="text-center text-muted-foreground py-8">
                    Geen woon-werk sjabloon
                  </TableCell>
                </TableRow>
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
                      <Button variant="ghost" size="icon" onClick={() => startEdit(t)}>
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

      <Dialog open={dialogOpen} onOpenChange={(open) => { if (!open) closeDialog(); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editing ? "Woon-werk sjabloon aanpassen" : "Woon-werk sjabloon toevoegen"}</DialogTitle>
          </DialogHeader>

          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <div className="space-y-2">
              <Label>Naam *</Label>
              <Input {...form.register("name")} placeholder="Bijv. Woon-werk" autoFocus />
              {form.formState.errors.name && <p className="text-xs text-destructive">{form.formState.errors.name.message}</p>}
            </div>

            <div className="space-y-2">
              <Label>Project *</Label>
              <Select
                value={form.watch("projectId")}
                onValueChange={(v) => form.setValue("projectId", v, { shouldValidate: true })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Selecteer project" />
                </SelectTrigger>
                <SelectContent>
                  {projects.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.name}{p.customer?.name ? ` — ${p.customer.name}` : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {form.formState.errors.projectId && <p className="text-xs text-destructive">{form.formState.errors.projectId.message}</p>}
            </div>

            <div className="space-y-2">
              <Label>Activiteit</Label>
              <Select
                value={form.watch("activityTypeId") || "__none__"}
                onValueChange={(v) => form.setValue("activityTypeId", v === "__none__" ? "" : v)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Geen" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">Geen</SelectItem>
                  {activityTypes.map((a) => (
                    <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Km *</Label>
              <Input type="number" step="0.1" min="0.1" placeholder="0.0" {...form.register("km")} />
              {form.formState.errors.km && <p className="text-xs text-destructive">{form.formState.errors.km.message}</p>}
            </div>

            <div className="space-y-2">
              <Label>Omschrijving</Label>
              <Input {...form.register("description")} placeholder="Optioneel" />
            </div>

            {apiError && <p className="text-xs text-destructive">{apiError}</p>}

            <DialogFooter>
              <Button type="button" variant="outline" onClick={closeDialog}>Annuleren</Button>
              <Button type="submit" disabled={loading}>
                {loading ? "Opslaan..." : editing ? "Opslaan" : "Toevoegen"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
