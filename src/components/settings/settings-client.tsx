"use client";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

const schema = z.object({
  name: z.string().min(1, "Verplicht"),
  email: z.string().email().optional().or(z.literal("")),
  phone: z.string().optional(),
  address: z.string().optional(),
  city: z.string().optional(),
  postalCode: z.string().optional(),
  country: z.string().optional(),
  vatNumber: z.string().optional(),
  iban: z.string().optional(),
});

type FormData = z.infer<typeof schema>;

interface Props {
  initialSettings: any;
}

export function SettingsClient({ initialSettings }: Props) {
  const [saved, setSaved] = useState(false);
  const [loading, setLoading] = useState(false);

  const form = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: {
      name: initialSettings?.name ?? "",
      email: initialSettings?.email ?? "",
      phone: initialSettings?.phone ?? "",
      address: initialSettings?.address ?? "",
      city: initialSettings?.city ?? "",
      postalCode: initialSettings?.postalCode ?? "",
      country: initialSettings?.country ?? "",
      vatNumber: initialSettings?.vatNumber ?? "",
      iban: initialSettings?.iban ?? "",
    },
  });

  async function onSubmit(data: FormData) {
    setLoading(true);
    const res = await fetch("/api/settings", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    if (res.ok) { setSaved(true); setTimeout(() => setSaved(false), 3000); }
    setLoading(false);
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Instellingen</h1>
        <p className="text-muted-foreground">Bedrijfsgegevens voor facturen</p>
      </div>

      <Card className="max-w-2xl">
        <CardHeader>
          <CardTitle>Bedrijfsgegevens</CardTitle>
          <CardDescription>Deze gegevens verschijnen op uw facturen</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={form.handleSubmit(onSubmit)} className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1 sm:col-span-2">
              <Label>Bedrijfsnaam *</Label>
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
              <Input {...form.register("vatNumber")} placeholder="NL000000000B01" />
            </div>
            <div className="space-y-1 sm:col-span-2">
              <Label>IBAN</Label>
              <Input {...form.register("iban")} placeholder="NL00 BANK 0000 0000 00" />
            </div>
            <div className="sm:col-span-2 flex items-center gap-3">
              <Button type="submit" disabled={loading}>{loading ? "Opslaan..." : "Opslaan"}</Button>
              {saved && <p className="text-sm text-green-600">Opgeslagen!</p>}
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
