"use client";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Plus, Pencil, Trash2 } from "lucide-react";
import { formatCurrency } from "@/lib/utils";

const schema = z.object({
  customerId: z.string().min(1, "Verplicht"),
  name: z.string().min(1, "Verplicht"),
  description: z.string().optional(),
  status: z.enum(["ACTIVE", "INACTIVE", "COMPLETED"]),
  defaultHourlyRate: z.coerce.number().positive().optional().or(z.literal("")),
  defaultKmRate: z.coerce.number().positive().optional().or(z.literal("")),
});

type FormData = z.infer<typeof schema>;

const statusLabel: Record<string, string> = { ACTIVE: "Actief", INACTIVE: "Inactief", COMPLETED: "Afgerond" };
const statusVariant: Record<string, "default" | "secondary" | "success"> = {
  ACTIVE: "success",
  INACTIVE: "secondary",
  COMPLETED: "default",
};

interface Props {
  initialProjects: any[];
  customers: any[];
  allTags: { id: string; name: string }[];
}

export function ProjectsClient({ initialProjects, customers, allTags }: Props) {
  const [projects, setProjects] = useState(initialProjects);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [selectedTags, setSelectedTags] = useState<{ name: string }[]>([]);
  const [tagInput, setTagInput] = useState("");

  const form = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: { status: "ACTIVE" },
  });

  function addTag(name: string) {
    const trimmed = name.trim();
    if (trimmed && !selectedTags.some((t) => t.name === trimmed)) {
      setSelectedTags((prev) => [...prev, { name: trimmed }]);
    }
    setTagInput("");
  }

  async function onSubmit(data: FormData) {
    setLoading(true);
    const payload = {
      ...data,
      defaultHourlyRate: data.defaultHourlyRate === "" ? null : data.defaultHourlyRate || null,
      defaultKmRate: data.defaultKmRate === "" ? null : data.defaultKmRate || null,
      tags: selectedTags.map((t) => t.name),
    };
    try {
      if (editing) {
        const res = await fetch(`/api/projects/${editing}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        if (res.ok) {
          const updated = await res.json();
          setProjects((prev) => prev.map((p) => p.id === editing ? { ...p, ...updated, customer: customers.find(c => c.id === updated.customerId) } : p));
          close();
        }
      } else {
        const res = await fetch("/api/projects", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        if (res.ok) {
          const created = await res.json();
          const customer = customers.find((c) => c.id === created.customerId);
          setProjects((prev) => [...prev, { ...created, customer, _count: { timeEntries: 0, kmEntries: 0 } }].sort((a, b) => a.name.localeCompare(b.name)));
          close();
        }
      }
    } finally {
      setLoading(false);
    }
  }

  function close() {
    setDialogOpen(false);
    setEditing(null);
    setSelectedTags([]);
    setTagInput("");
    form.reset({ status: "ACTIVE" });
  }

  function startEdit(project: any) {
    setEditing(project.id);
    setSelectedTags(project.tags ?? []);
    form.reset({
      customerId: project.customerId,
      name: project.name,
      description: project.description ?? "",
      status: project.status,
      defaultHourlyRate: project.defaultHourlyRate ? Number(project.defaultHourlyRate) : "",
      defaultKmRate: project.defaultKmRate ? Number(project.defaultKmRate) : "",
    });
    setDialogOpen(true);
  }

  async function deleteProject(id: string) {
    if (!confirm("Weet u zeker dat u dit project wilt verwijderen?")) return;
    await fetch(`/api/projects/${id}`, { method: "DELETE" });
    setProjects((prev) => prev.filter((p) => p.id !== id));
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Projecten</h1>
          <p className="text-muted-foreground">Beheer uw projecten en tarieven</p>
        </div>
        <Button onClick={() => { form.reset({ status: "ACTIVE" }); setEditing(null); setSelectedTags([]); setDialogOpen(true); }}>
          <Plus className="h-4 w-4 mr-2" /> Project toevoegen
        </Button>
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Project</TableHead>
                <TableHead>Klant</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Tags</TableHead>
                <TableHead className="text-right">Uurtarief</TableHead>
                <TableHead className="text-right">Km-tarief</TableHead>
                <TableHead className="text-right">Uren</TableHead>
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {projects.length === 0 && (
                <TableRow><TableCell colSpan={8} className="text-center text-muted-foreground py-8">Geen projecten gevonden</TableCell></TableRow>
              )}
              {projects.map((p) => (
                <TableRow key={p.id}>
                  <TableCell className="font-medium">{p.name}</TableCell>
                  <TableCell>{p.customer?.name}</TableCell>
                  <TableCell>
                    <Badge variant={statusVariant[p.status] as any}>{statusLabel[p.status]}</Badge>
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-wrap gap-1">
                      {(p.tags ?? []).map((tag: any) => (
                        <Badge key={tag.id} variant="outline" className="text-xs">{tag.name}</Badge>
                      ))}
                    </div>
                  </TableCell>
                  <TableCell className="text-right">{p.defaultHourlyRate ? formatCurrency(Number(p.defaultHourlyRate)) : "—"}</TableCell>
                  <TableCell className="text-right">{p.defaultKmRate ? `€${Number(p.defaultKmRate).toFixed(2)}` : "—"}</TableCell>
                  <TableCell className="text-right">{p._count.timeEntries}</TableCell>
                  <TableCell>
                    <div className="flex gap-1 justify-end">
                      <Button variant="ghost" size="icon" onClick={() => startEdit(p)}>
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button variant="ghost" size="icon" onClick={() => deleteProject(p.id)}>
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

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editing ? "Project aanpassen" : "Project toevoegen"}</DialogTitle>
          </DialogHeader>
          <form onSubmit={form.handleSubmit(onSubmit)} className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1 sm:col-span-2">
              <Label>Klant *</Label>
              <Select onValueChange={(v) => form.setValue("customerId", v)} value={form.watch("customerId")}>
                <SelectTrigger><SelectValue placeholder="Selecteer klant" /></SelectTrigger>
                <SelectContent>{customers.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent>
              </Select>
              {form.formState.errors.customerId && <p className="text-xs text-destructive">{form.formState.errors.customerId.message}</p>}
            </div>
            <div className="space-y-1 sm:col-span-2">
              <Label>Projectnaam *</Label>
              <Input {...form.register("name")} />
              {form.formState.errors.name && <p className="text-xs text-destructive">{form.formState.errors.name.message}</p>}
            </div>
            <div className="space-y-1 sm:col-span-2">
              <Label>Omschrijving</Label>
              <Textarea {...form.register("description")} rows={2} />
            </div>
            <div className="space-y-1 sm:col-span-2">
              <Label>Tags</Label>
              {allTags.filter((t) => !selectedTags.some((s) => s.name === t.name)).length > 0 && (
                <Select
                  value=""
                  onValueChange={(name) => { if (name) addTag(name); }}
                >
                  <SelectTrigger><SelectValue placeholder="Selecteer bestaande tag…" /></SelectTrigger>
                  <SelectContent>
                    {allTags
                      .filter((t) => !selectedTags.some((s) => s.name === t.name))
                      .map((t) => <SelectItem key={t.id} value={t.name}>{t.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              )}
              <div className="flex gap-2">
                <Input
                  value={tagInput}
                  onChange={(e) => setTagInput(e.target.value)}
                  onKeyDown={(e) => {
                    if ((e.key === "Enter" || e.key === ",") && tagInput.trim()) {
                      e.preventDefault();
                      addTag(tagInput.replace(/,\s*$/, ""));
                    }
                  }}
                  onBlur={() => { if (tagInput.trim()) addTag(tagInput); }}
                  placeholder="Nieuwe tag…"
                />
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => { if (tagInput.trim()) addTag(tagInput); }}
                  disabled={!tagInput.trim()}
                >
                  Toevoegen
                </Button>
              </div>
              {selectedTags.length > 0 && (
                <div className="flex flex-wrap gap-1 mt-1">
                  {selectedTags.map((tag) => (
                    <Badge
                      key={tag.name}
                      variant="secondary"
                      className="cursor-pointer text-xs gap-1"
                      onClick={() => setSelectedTags((prev) => prev.filter((t) => t.name !== tag.name))}
                    >
                      {tag.name} ×
                    </Badge>
                  ))}
                </div>
              )}
            </div>
            <div className="space-y-1">
              <Label>Status</Label>
              <Select onValueChange={(v) => form.setValue("status", v as any)} value={form.watch("status")}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="ACTIVE">Actief</SelectItem>
                  <SelectItem value="INACTIVE">Inactief</SelectItem>
                  <SelectItem value="COMPLETED">Afgerond</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div />
            <div className="space-y-1">
              <Label>Standaard uurtarief (€)</Label>
              <Input type="number" step="0.01" min="0" placeholder="95.00" {...form.register("defaultHourlyRate")} />
            </div>
            <div className="space-y-1">
              <Label>Standaard km-tarief (€/km)</Label>
              <Input type="number" step="0.01" min="0" placeholder="0.23" {...form.register("defaultKmRate")} />
            </div>
            <DialogFooter className="sm:col-span-2">
              <Button type="button" variant="outline" onClick={close}>Annuleren</Button>
              <Button type="submit" disabled={loading}>{loading ? "Opslaan..." : "Opslaan"}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
