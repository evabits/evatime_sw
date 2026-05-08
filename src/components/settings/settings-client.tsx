"use client";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useState, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Upload, X } from "lucide-react";

const schema = z.object({
  name: z.string().min(1, "Verplicht"),
  email: z.string().email().optional().or(z.literal("")),
  phone: z.string().optional(),
  address: z.string().optional(),
  city: z.string().optional(),
  postalCode: z.string().optional(),
  country: z.string().optional(),
  vatNumber: z.string().optional(),
  kvkNumber: z.string().optional(),
  iban: z.string().optional(),
  reminderDays: z.coerce.number().int().min(1).optional(),
});

type FormData = z.infer<typeof schema>;

interface Props {
  initialSettings: any;
}

export function SettingsClient({ initialSettings }: Props) {
  const [saved, setSaved] = useState(false);
  const [loading, setLoading] = useState(false);
  const [serverError, setServerError] = useState("");
  const [logoUrl, setLogoUrl] = useState<string | null>(initialSettings?.logoUrl ?? null);
  const [logoLoading, setLogoLoading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

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
      kvkNumber: initialSettings?.kvkNumber ?? "",
      iban: initialSettings?.iban ?? "",
      reminderDays: initialSettings?.reminderDays ?? 14,
    },
  });

  function handleLogoFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 1024 * 1024) {
      alert("Logo moet kleiner zijn dan 1 MB");
      return;
    }
    setLogoLoading(true);
    const reader = new FileReader();
    reader.onload = (ev) => {
      setLogoUrl(ev.target?.result as string);
      setLogoLoading(false);
    };
    reader.readAsDataURL(file);
  }

  async function onSubmit(data: FormData) {
    setLoading(true);
    setServerError("");
    const res = await fetch("/api/settings", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...data, logoUrl }),
    });
    setLoading(false);
    if (res.ok) {
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } else {
      const err = await res.json().catch(() => ({}));
      setServerError(err.error ?? "Fout bij opslaan");
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Instellingen</h1>
        <p className="text-muted-foreground">Bedrijfsgegevens voor facturen</p>
      </div>

      {/* Logo */}
      <Card className="max-w-2xl">
        <CardHeader>
          <CardTitle>Logo</CardTitle>
          <CardDescription>Wordt weergegeven op facturen (max. 1 MB, PNG/JPG/SVG)</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-start gap-4">
            {logoUrl ? (
              <div className="relative">
                <img src={logoUrl} alt="Logo" className="h-20 max-w-48 object-contain border rounded-md p-2 bg-white" />
                <button
                  onClick={() => { setLogoUrl(null); if (fileRef.current) fileRef.current.value = ""; }}
                  className="absolute -top-2 -right-2 bg-destructive text-destructive-foreground rounded-full w-5 h-5 flex items-center justify-center hover:bg-destructive/90"
                >
                  <X className="h-3 w-3" />
                </button>
              </div>
            ) : (
              <div
                onClick={() => fileRef.current?.click()}
                className="h-20 w-48 border-2 border-dashed rounded-md flex flex-col items-center justify-center gap-1 cursor-pointer hover:border-primary/50 hover:bg-muted/50 transition-colors"
              >
                <Upload className="h-5 w-5 text-muted-foreground" />
                <span className="text-xs text-muted-foreground">Logo uploaden</span>
              </div>
            )}
            <div className="space-y-2">
              <input
                ref={fileRef}
                type="file"
                accept="image/png,image/jpeg,image/svg+xml,image/webp"
                className="hidden"
                onChange={handleLogoFile}
              />
              <Button variant="outline" size="sm" onClick={() => fileRef.current?.click()} disabled={logoLoading}>
                <Upload className="h-4 w-4 mr-2" />
                {logoLoading ? "Laden..." : logoUrl ? "Logo wijzigen" : "Logo uploaden"}
              </Button>
              {logoUrl && (
                <Button variant="ghost" size="sm" className="text-muted-foreground" onClick={() => { setLogoUrl(null); if (fileRef.current) fileRef.current.value = ""; }}>
                  <X className="h-4 w-4 mr-2" /> Verwijderen
                </Button>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Company details */}
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
            <div className="space-y-1">
              <Label>KvK-nummer</Label>
              <Input {...form.register("kvkNumber")} placeholder="12345678" />
            </div>
            <div className="space-y-1 sm:col-span-2">
              <Label>IBAN</Label>
              <Input {...form.register("iban")} placeholder="NL00 BANK 0000 0000 00" />
            </div>
            <div className="space-y-1">
              <Label>Betalingsherinnering na (dagen)</Label>
              <Input type="number" min="1" {...form.register("reminderDays")} placeholder="14" />
            </div>
            {serverError && <p className="sm:col-span-2 text-sm text-destructive">{serverError}</p>}
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
