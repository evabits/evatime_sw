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
import { Plus, Pencil, Trash2 } from "lucide-react";
import { formatDate } from "@/lib/utils";

const createSchema = z.object({
  name: z.string().min(1, "Verplicht"),
  email: z.string().email("Ongeldig e-mailadres"),
  password: z.string().min(8, "Minimaal 8 tekens"),
  role: z.enum(["ADMIN", "FINANCE", "EMPLOYEE"]),
  weeklyHours: z.coerce.number().positive("Moet groter zijn dan 0").optional().nullable(),
  contractType: z.enum(["PERMANENT", "FIXED_TERM", "ZERO_HOURS"]),
  contractHours: z.coerce.number().positive("Moet groter zijn dan 0").optional().nullable(),
  contractStart: z.string().optional(),
  contractEnd: z.string().optional(),
});

const editSchema = z.object({
  name: z.string().min(1, "Verplicht"),
  email: z.string().email("Ongeldig e-mailadres"),
  role: z.enum(["ADMIN", "FINANCE", "EMPLOYEE"]),
  password: z.string().min(8, "Minimaal 8 tekens").optional().or(z.literal("")),
  weeklyHours: z.coerce.number().positive("Moet groter zijn dan 0").optional().nullable(),
  contractType: z.enum(["PERMANENT", "FIXED_TERM", "ZERO_HOURS"]),
  contractHours: z.coerce.number().positive("Moet groter zijn dan 0").optional().nullable(),
  contractStart: z.string().optional(),
  contractEnd: z.string().optional(),
});

type CreateData = z.infer<typeof createSchema>;
type EditData = z.infer<typeof editSchema>;

interface User {
  id: string;
  name: string;
  email: string;
  role: "ADMIN" | "FINANCE" | "EMPLOYEE";
  weeklyHours: number | null;
  contractType: "PERMANENT" | "FIXED_TERM" | "ZERO_HOURS";
  contractHours: number | null;
  contractStart: string | null;
  contractEnd: string | null;
  createdAt: string;
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
    createForm.reset({ role: "EMPLOYEE", contractType: "PERMANENT" });
    setServerError("");
    setDialogOpen(true);
  }

  function openEdit(user: User) {
    setEditingId(user.id);
    editForm.reset({
      name: user.name, email: user.email, role: user.role, password: "",
      weeklyHours: user.weeklyHours ?? undefined,
      contractType: user.contractType,
      contractHours: user.contractHours ?? undefined,
      contractStart: user.contractStart ?? undefined,
      contractEnd: user.contractEnd ?? undefined,
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

  async function deleteUser(id: string) {
    if (!confirm("Weet u zeker dat u deze gebruiker wilt verwijderen?")) return;
    const res = await fetch(`/api/users/${id}`, { method: "DELETE" });
    if (res.ok) {
      setUsers((prev) => prev.filter((u) => u.id !== id));
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Gebruikers</h1>
          <p className="text-muted-foreground">Beheer accounts en wachtwoorden</p>
        </div>
        {isAdmin && (
          <Button onClick={openCreate}>
            <Plus className="h-4 w-4 mr-2" /> Gebruiker toevoegen
          </Button>
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
                <TableHead>Aangemaakt</TableHead>
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {users.map((user) => (
                <TableRow key={user.id}>
                  <TableCell className="font-medium">
                    {user.name}
                    {user.id === currentUserId && (
                      <Badge variant="secondary" className="ml-2 text-xs">Uzelf</Badge>
                    )}
                  </TableCell>
                  <TableCell>{user.email}</TableCell>
                  <TableCell>
                    <Badge variant={user.role === "ADMIN" ? "default" : "secondary"}>
                      {user.role === "ADMIN" ? "Beheerder" : user.role === "FINANCE" ? "Financieel" : "Medewerker"}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right font-mono">
                    {user.weeklyHours != null ? `${user.weeklyHours}u` : <span className="text-muted-foreground">—</span>}
                  </TableCell>
                  <TableCell>{formatDate(user.createdAt)}</TableCell>
                  <TableCell>
                    <div className="flex gap-1 justify-end">
                      {(isAdmin || user.id === currentUserId) && (
                        <Button variant="ghost" size="icon" onClick={() => openEdit(user)}>
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                      )}
                      {isAdmin && user.id !== currentUserId && (
                        <Button variant="ghost" size="icon" onClick={() => deleteUser(user.id)}>
                          <Trash2 className="h-3.5 w-3.5 text-destructive" />
                        </Button>
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
                  <div className="space-y-1">
                    <Label>Contracttype</Label>
                    <Select value={editForm.watch("contractType")} onValueChange={(v) => editForm.setValue("contractType", v as any)}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="PERMANENT">Vast</SelectItem>
                        <SelectItem value="FIXED_TERM">Bepaalde tijd</SelectItem>
                        <SelectItem value="ZERO_HOURS">0-uren</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1">
                    <Label>Contracturen per week <span className="text-muted-foreground font-normal">(leeg = niet van toepassing)</span></Label>
                    <Input type="number" step="0.5" min="1" max="80" placeholder="bijv. 40" {...editForm.register("contractHours")} />
                    {editForm.formState.errors.contractHours && <p className="text-xs text-destructive">{editForm.formState.errors.contractHours.message}</p>}
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div className="space-y-1">
                      <Label>Startdatum</Label>
                      <Input type="date" {...editForm.register("contractStart")} />
                    </div>
                    <div className="space-y-1">
                      <Label>Einddatum</Label>
                      <Input type="date" {...editForm.register("contractEnd")} />
                    </div>
                  </div>
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
                    <SelectItem value="ADMIN">Beheerder</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label>Uren per week <span className="text-muted-foreground font-normal">(leeg = geen target)</span></Label>
                <Input type="number" step="0.5" min="1" max="80" placeholder="bijv. 40" {...createForm.register("weeklyHours")} />
                {createForm.formState.errors.weeklyHours && <p className="text-xs text-destructive">{createForm.formState.errors.weeklyHours.message}</p>}
              </div>
              <div className="space-y-1">
                <Label>Contracttype</Label>
                <Select value={createForm.watch("contractType")} onValueChange={(v) => createForm.setValue("contractType", v as any)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="PERMANENT">Vast</SelectItem>
                    <SelectItem value="FIXED_TERM">Bepaalde tijd</SelectItem>
                    <SelectItem value="ZERO_HOURS">0-uren</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label>Contracturen per week <span className="text-muted-foreground font-normal">(leeg = niet van toepassing)</span></Label>
                <Input type="number" step="0.5" min="1" max="80" placeholder="bijv. 40" {...createForm.register("contractHours")} />
                {createForm.formState.errors.contractHours && <p className="text-xs text-destructive">{createForm.formState.errors.contractHours.message}</p>}
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <Label>Startdatum</Label>
                  <Input type="date" {...createForm.register("contractStart")} />
                </div>
                <div className="space-y-1">
                  <Label>Einddatum</Label>
                  <Input type="date" {...createForm.register("contractEnd")} />
                </div>
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
