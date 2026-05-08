"use client";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Plus, Pencil, Trash2, ExternalLink } from "lucide-react";
import Link from "next/link";

const schema = z.object({
  name: z.string().min(1, "Verplicht"),
  email: z.string().email("Ongeldig e-mailadres").optional().or(z.literal("")),
  phone: z.string().optional(),
  address: z.string().optional(),
  city: z.string().optional(),
  postalCode: z.string().optional(),
  country: z.string().optional(),
  vatNumber: z.string().optional(),
  notes: z.string().optional(),
});

type FormData = z.infer<typeof schema>;

interface Props {
  initialCustomers: any[];
}

export function CustomersClient({ initialCustomers }: Props) {
  const [customers, setCustomers] = useState(initialCustomers);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const form = useForm<FormData>({ resolver: zodResolver(schema) });

  async function onSubmit(data: FormData) {
    setLoading(true);
    const payload = { ...data, email: data.email || null };
    try {
      if (editing) {
        const res = await fetch(`/api/customers/${editing}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        if (res.ok) {
          const updated = await res.json();
          setCustomers((prev) => prev.map((c) => (c.id === editing ? { ...c, ...updated } : c)));
          close();
        }
      } else {
        const res = await fetch("/api/customers", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        if (res.ok) {
          const created = await res.json();
          setCustomers((prev) => [...prev, { ...created, _count: { projects: 0, invoices: 0 } }].sort((a, b) => a.name.localeCompare(b.name)));
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
    form.reset();
  }

  function startEdit(customer: any) {
    setEditing(customer.id);
    form.reset({
      name: customer.name,
      email: customer.email ?? "",
      phone: customer.phone ?? "",
      address: customer.address ?? "",
      city: customer.city ?? "",
      postalCode: customer.postalCode ?? "",
      country: customer.country ?? "",
      vatNumber: customer.vatNumber ?? "",
      notes: customer.notes ?? "",
    });
    setDialogOpen(true);
  }

  async function deleteCustomer(id: string) {
    if (!confirm("Weet u zeker dat u deze klant wilt verwijderen?")) return;
    await fetch(`/api/customers/${id}`, { method: "DELETE" });
    setCustomers((prev) => prev.filter((c) => c.id !== id));
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Klanten</h1>
          <p className="text-muted-foreground">Beheer uw klanten</p>
        </div>
        <Button onClick={() => { form.reset(); setEditing(null); setDialogOpen(true); }}>
          <Plus className="h-4 w-4 mr-2" /> Klant toevoegen
        </Button>
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Naam</TableHead>
                <TableHead>E-mail</TableHead>
                <TableHead>Telefoon</TableHead>
                <TableHead>Stad</TableHead>
                <TableHead className="text-right">Projecten</TableHead>
                <TableHead className="text-right">Facturen</TableHead>
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {customers.length === 0 && (
                <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground py-8">Geen klanten gevonden</TableCell></TableRow>
              )}
              {customers.map((c) => (
                <TableRow key={c.id}>
                  <TableCell className="font-medium">{c.name}</TableCell>
                  <TableCell>{c.email ?? "—"}</TableCell>
                  <TableCell>{c.phone ?? "—"}</TableCell>
                  <TableCell>{c.city ?? "—"}</TableCell>
                  <TableCell className="text-right">{c._count.projects}</TableCell>
                  <TableCell className="text-right">{c._count.invoices}</TableCell>
                  <TableCell>
                    <div className="flex gap-1 justify-end">
                      <Button variant="ghost" size="icon" asChild>
                        <Link href={`/customers/${c.id}`}><ExternalLink className="h-3.5 w-3.5" /></Link>
                      </Button>
                      <Button variant="ghost" size="icon" onClick={() => startEdit(c)}>
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button variant="ghost" size="icon" onClick={() => deleteCustomer(c.id)}>
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
            <DialogTitle>{editing ? "Klant aanpassen" : "Klant toevoegen"}</DialogTitle>
          </DialogHeader>
          <form onSubmit={form.handleSubmit(onSubmit)} className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1 sm:col-span-2">
              <Label>Naam *</Label>
              <Input {...form.register("name")} />
              {form.formState.errors.name && <p className="text-xs text-destructive">{form.formState.errors.name.message}</p>}
            </div>
            <div className="space-y-1">
              <Label>E-mail</Label>
              <Input type="email" {...form.register("email")} />
            </div>
            <div className="space-y-1">
              <Label>Telefoon</Label>
              <Input {...form.register("phone")} />
            </div>
            <div className="space-y-1 sm:col-span-2">
              <Label>Adres</Label>
              <Input {...form.register("address")} />
            </div>
            <div className="space-y-1">
              <Label>Postcode</Label>
              <Input {...form.register("postalCode")} />
            </div>
            <div className="space-y-1">
              <Label>Stad</Label>
              <Input {...form.register("city")} />
            </div>
            <div className="space-y-1">
              <Label>Land</Label>
              <Input {...form.register("country")} placeholder="Nederland" />
            </div>
            <div className="space-y-1">
              <Label>BTW-nummer</Label>
              <Input {...form.register("vatNumber")} />
            </div>
            <div className="space-y-1 sm:col-span-2">
              <Label>Notities</Label>
              <Textarea {...form.register("notes")} rows={2} />
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
