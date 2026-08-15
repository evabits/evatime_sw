"use client";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Plus, Pencil, Trash2, RotateCcw } from "lucide-react";
import { formatDate } from "@/lib/utils";
import {
  vacationOpeningDateField, vacationOpeningHoursField, weeklyHoursField, workLevelField,
} from "@/lib/user-schema";
import { WORK_LEVEL_ORDER, WORK_LEVEL_LABELS } from "@/lib/work-levels";
import { getRoleLabel } from "@/lib/roles";

const createSchema = z.object({
  name: z.string().min(1, "Verplicht"),
  email: z.string().email("Ongeldig e-mailadres"),
  password: z.string().min(8, "Minimaal 8 tekens"),
  role: z.enum(["ADMIN", "FINANCE", "TEAMLEAD", "EMPLOYEE"]),
  weeklyHours: weeklyHoursField,
  workLevel: workLevelField,
});

const editSchema = z.object({
  name: z.string().min(1, "Verplicht"),
  email: z.string().email("Ongeldig e-mailadres"),
  role: z.enum(["ADMIN", "FINANCE", "TEAMLEAD", "EMPLOYEE"]),
  password: z.string().min(8, "Minimaal 8 tekens").optional().or(z.literal("")),
  weeklyHours: weeklyHoursField,
  workLevel: workLevelField,
  vacationOpeningDate: vacationOpeningDateField,
  vacationOpeningHours: vacationOpeningHoursField,
});

type CreateData = z.infer<typeof createSchema>;
type EditData = z.infer<typeof editSchema>;

interface User {
  id: string;
  name: string;
  email: string;
  role: "ADMIN" | "FINANCE" | "TEAMLEAD" | "EMPLOYEE";
  weeklyHours: number | null;
  workLevel: string | null;
  vacationOpeningDate: string | null;
  vacationOpeningHours: number | null;
  createdAt: string;
  archivedAt?: string | null;
}

interface Props {
  initialUsers: User[];
  currentUserId: string;
  isAdmin: boolean;
}

export function UsersClient({ initialUsers, currentUserId, isAdmin }: Props) {
  const [users, setUsers] = useState(initialUsers);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [serverError, setServerError] = useState("");

  const createForm = useForm<CreateData>({
    resolver: zodResolver(createSchema),
    defaultValues: { role: "EMPLOYEE" },
  });
  const editForm = useForm<EditData>({
    resolver: zodResolver(editSchema),
  });

  function openCreate() {
    setEditingId(null);
    createForm.reset({ role: "EMPLOYEE" });
    setServerError("");
    setDialogOpen(true);
  }

  function openEdit(user: User) {
    setEditingId(user.id);
    editForm.reset({
      name: user.name, email: user.email, role: user.role, password: "",
      weeklyHours: user.weeklyHours ?? undefined,
      workLevel: user.workLevel ?? undefined,
      vacationOpeningDate: user.vacationOpeningDate ?? undefined,
      vacationOpeningHours: user.vacationOpeningHours ?? undefined,
    });
    setServerError("");
    setDialogOpen(true);
  }

  function close() {
    setDialogOpen(false);
    setEditingId(null);
    setServerError("");
  }

  async function onCreate(data: CreateData) {
    setLoading(true);
    setServerError("");
    const res = await fetch("/api/users", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    setLoading(false);
    if (res.ok) {
      const user = await res.json();
      setUsers((prev) => [...prev, user].sort((a, b) => a.name.localeCompare(b.name)));
      close();
    } else {
      const err = await res.json();
      setServerError(err.error ?? "Fout bij aanmaken");
    }
  }

  async function onEdit(data: EditData) {
    if (!editingId) return;
    setLoading(true);
    setServerError("");
    const res = await fetch(`/api/users/${editingId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    setLoading(false);
    if (res.ok) {
      const updated = await res.json();
      setUsers((prev) => prev.map((u) => (u.id === editingId ? updated : u)));
      close();
    } else {
      const err = await res.json();
      setServerError(err.error ?? "Fout bij opslaan");
    }
  }

  const [showArchived, setShowArchived] = useState(false);

  async function loadUsers(withArchived: boolean) {
    const res = await fetch(`/api/users${withArchived ? "?includeArchived=1" : ""}`);
    if (res.ok) setUsers(await res.json());
  }

  async function restoreUser(id: string) {
    const res = await fetch(`/api/users/${id}`, { method: "PATCH" });
    if (res.ok) loadUsers(showArchived);
  }

  async function archiveUser(id: string) {
    if (!confirm("Weet u zeker dat u deze gebruiker wilt archiveren?")) return;
    const res = await fetch(`/api/users/${id}`, { method: "DELETE" });
    if (res.ok) loadUsers(showArchived);
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Gebruikers</h1>
          <p className="text-muted-foreground">Beheer accounts en wachtwoorden</p>
        </div>
        {isAdmin && (
          <div className="flex items-center gap-3">
            <label className="flex items-center gap-2 text-sm text-muted-foreground cursor-pointer">
              <input type="checkbox" className="h-4 w-4 rounded border-input accent-primary"
                checked={showArchived}
                onChange={(e) => { setShowArchived(e.target.checked); loadUsers(e.target.checked); }} />
              Toon gearchiveerd
            </label>
            <Button onClick={openCreate}>
              <Plus className="h-4 w-4 mr-2" /> Gebruiker toevoegen
            </Button>
          </div>
        )}
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Naam</TableHead>
                <TableHead>E-mail</TableHead>
                <TableHead>Rol</TableHead>
                <TableHead className="text-right">Uren/week</TableHead>
                <TableHead>Werkniveau</TableHead>
                <TableHead>Aangemaakt</TableHead>
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {users.map((user) => (
                <TableRow key={user.id} className={user.archivedAt ? "opacity-60" : undefined}>
                  <TableCell className="font-medium">
                    {user.name}
                    {user.id === currentUserId && (
                      <Badge variant="secondary" className="ml-2 text-xs">Uzelf</Badge>
                    )}
                    {user.archivedAt && <span className="ml-2 text-xs text-muted-foreground">(gearchiveerd)</span>}
                  </TableCell>
                  <TableCell>{user.email}</TableCell>
                  <TableCell>
                    <Badge variant={user.role === "ADMIN" ? "default" : "secondary"}>
                      {getRoleLabel(user.role)}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right font-mono">
                    {user.weeklyHours != null ? `${user.weeklyHours}u` : <span className="text-muted-foreground">—</span>}
                  </TableCell>
                  <TableCell>
                    {user.workLevel
                      ? WORK_LEVEL_LABELS[user.workLevel as keyof typeof WORK_LEVEL_LABELS]
                      : <span className="text-muted-foreground">Niet ingesteld</span>}
                  </TableCell>
                  <TableCell>{formatDate(user.createdAt)}</TableCell>
                  <TableCell>
                    <div className="flex gap-1 justify-end">
                      {user.archivedAt ? (
                        isAdmin && (
                          <Button variant="ghost" size="icon" onClick={() => restoreUser(user.id)} title="Herstellen">
                            <RotateCcw className="h-3.5 w-3.5" />
                          </Button>
                        )
                      ) : (
                        <>
                          {(isAdmin || user.id === currentUserId) && (
                            <Button variant="ghost" size="icon" onClick={() => openEdit(user)}>
                              <Pencil className="h-3.5 w-3.5" />
                            </Button>
                          )}
                          {isAdmin && user.id !== currentUserId && (
                            <Button variant="ghost" size="icon" onClick={() => archiveUser(user.id)} title="Archiveren">
                              <Trash2 className="h-3.5 w-3.5 text-destructive" />
                            </Button>
                          )}
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

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editingId ? "Gebruiker bewerken" : "Gebruiker toevoegen"}</DialogTitle>
          </DialogHeader>

          {editingId ? (
            <form onSubmit={editForm.handleSubmit(onEdit)} className="space-y-3">
              <div className="space-y-1">
                <Label>Naam *</Label>
                <Input {...editForm.register("name")} />
                {editForm.formState.errors.name && <p className="text-xs text-destructive">{editForm.formState.errors.name.message}</p>}
              </div>
              <div className="space-y-1">
                <Label>E-mail *</Label>
                <Input type="email" {...editForm.register("email")} />
                {editForm.formState.errors.email && <p className="text-xs text-destructive">{editForm.formState.errors.email.message}</p>}
              </div>
              {isAdmin && (
                <>
                  <div className="space-y-1">
                    <Label>Rol</Label>
                    <Select value={editForm.watch("role")} onValueChange={(v) => editForm.setValue("role", v as any)}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="EMPLOYEE">Medewerker</SelectItem>
                        <SelectItem value="TEAMLEAD">Teamleider</SelectItem>
                        <SelectItem value="FINANCE">Financieel</SelectItem>
                        <SelectItem value="ADMIN">Beheerder</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1">
                    <Label>Uren per week <span className="text-muted-foreground font-normal">(leeg = geen target)</span></Label>
                    <Input type="number" step="0.5" min="1" max="80" placeholder="bijv. 40" {...editForm.register("weeklyHours")} />
                    {editForm.formState.errors.weeklyHours && <p className="text-xs text-destructive">{editForm.formState.errors.weeklyHours.message}</p>}
                  </div>
                  <div className="space-y-2">
                    <Label>Werkniveau</Label>
                    <Select
                      onValueChange={(v) => editForm.setValue("workLevel", v === "_none" ? "" : v)}
                      value={editForm.watch("workLevel") || "_none"}
                    >
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="_none">Niet ingesteld</SelectItem>
                        {WORK_LEVEL_ORDER.map((l) => (
                          <SelectItem key={l} value={l}>{WORK_LEVEL_LABELS[l]}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <Label>Vakantiesaldo op</Label>
                      <Input type="date" {...editForm.register("vacationOpeningDate")} />
                      {editForm.formState.errors.vacationOpeningDate && <p className="text-xs text-destructive">{editForm.formState.errors.vacationOpeningDate.message}</p>}
                    </div>
                    <div className="space-y-1">
                      <Label>Saldo (uren)</Label>
                      <Input type="number" step="0.5" placeholder="bijv. 120" {...editForm.register("vacationOpeningHours")} />
                      {editForm.formState.errors.vacationOpeningHours && <p className="text-xs text-destructive">{editForm.formState.errors.vacationOpeningHours.message}</p>}
                    </div>
                  </div>
                  <p className="text-xs text-muted-foreground">Het saldo dat op die datum nog openstond. Vanaf dan telt EVAtime er het recht uit de contracten bij op en trekt de goedgekeurde vakantie eraf. Leeg = alleen het recht van het lopende jaar.</p>
                  {editingId && <p className="text-xs text-muted-foreground">Contracten beheren via <a className="underline" href={`/personeel/${editingId}`}>Personeel</a>.</p>}
                </>
              )}
              <div className="space-y-1">
                <Label>Nieuw wachtwoord <span className="text-muted-foreground font-normal">(leeg = niet wijzigen)</span></Label>
                <Input type="password" placeholder="Minimaal 8 tekens" {...editForm.register("password")} />
                {editForm.formState.errors.password && <p className="text-xs text-destructive">{editForm.formState.errors.password.message}</p>}
              </div>
              {serverError && <p className="text-sm text-destructive">{serverError}</p>}
              <DialogFooter>
                <Button type="button" variant="outline" onClick={close}>Annuleren</Button>
                <Button type="submit" disabled={loading}>{loading ? "Opslaan..." : "Opslaan"}</Button>
              </DialogFooter>
            </form>
          ) : (
            <form onSubmit={createForm.handleSubmit(onCreate)} className="space-y-3">
              <div className="space-y-1">
                <Label>Naam *</Label>
                <Input {...createForm.register("name")} />
                {createForm.formState.errors.name && <p className="text-xs text-destructive">{createForm.formState.errors.name.message}</p>}
              </div>
              <div className="space-y-1">
                <Label>E-mail *</Label>
                <Input type="email" {...createForm.register("email")} />
                {createForm.formState.errors.email && <p className="text-xs text-destructive">{createForm.formState.errors.email.message}</p>}
              </div>
              <div className="space-y-1">
                <Label>Wachtwoord *</Label>
                <Input type="password" placeholder="Minimaal 8 tekens" {...createForm.register("password")} />
                {createForm.formState.errors.password && <p className="text-xs text-destructive">{createForm.formState.errors.password.message}</p>}
              </div>
              <div className="space-y-1">
                <Label>Rol</Label>
                <Select value={createForm.watch("role")} onValueChange={(v) => createForm.setValue("role", v as any)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="EMPLOYEE">Medewerker</SelectItem>
                    <SelectItem value="TEAMLEAD">Teamleider</SelectItem>
                    <SelectItem value="ADMIN">Beheerder</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label>Uren per week <span className="text-muted-foreground font-normal">(leeg = geen target)</span></Label>
                <Input type="number" step="0.5" min="1" max="80" placeholder="bijv. 40" {...createForm.register("weeklyHours")} />
                {createForm.formState.errors.weeklyHours && <p className="text-xs text-destructive">{createForm.formState.errors.weeklyHours.message}</p>}
              </div>
              <div className="space-y-2">
                <Label>Werkniveau</Label>
                <Select
                  onValueChange={(v) => createForm.setValue("workLevel", v === "_none" ? "" : v)}
                  value={createForm.watch("workLevel") || "_none"}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="_none">Niet ingesteld</SelectItem>
                    {WORK_LEVEL_ORDER.map((l) => (
                      <SelectItem key={l} value={l}>{WORK_LEVEL_LABELS[l]}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {serverError && <p className="text-sm text-destructive">{serverError}</p>}
              <DialogFooter>
                <Button type="button" variant="outline" onClick={close}>Annuleren</Button>
                <Button type="submit" disabled={loading}>{loading ? "Aanmaken..." : "Aanmaken"}</Button>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
