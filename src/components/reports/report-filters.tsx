"use client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Search } from "lucide-react";
import { resolvePeriod, PERIOD_LABELS, PERIOD_ORDER, type PeriodPreset } from "@/lib/periods";
import { formatDate } from "@/lib/utils";

export type FilterState = {
  period: PeriodPreset;
  from: string;
  to: string;
  customerId: string;
  projectId: string;
  userId: string;
  billable: string;
  tagIds: string[];
  groupByEmployee: boolean;
};

interface Props {
  customers: any[];
  projects: any[];
  users: any[];
  tags: any[];
  value: FilterState;
  onChange: (next: FilterState) => void;
  onSubmit: () => void;
  loading: boolean;
}

export function ReportFilters({ customers, projects, users, tags, value, onChange, onSubmit, loading }: Props) {
  const set = <K extends keyof FilterState>(key: K, v: FilterState[K]) => onChange({ ...value, [key]: v });
  const filteredProjects = value.customerId ? projects.filter((p) => p.customerId === value.customerId) : projects;

  function handlePeriodChange(preset: PeriodPreset) {
    const range = resolvePeriod(preset, new Date());
    onChange(range ? { ...value, period: preset, ...range } : { ...value, period: preset });
  }

  function toggleTag(id: string) {
    set("tagIds", value.tagIds.includes(id) ? value.tagIds.filter((t) => t !== id) : [...value.tagIds, id]);
  }

  return (
    <Card>
      <CardHeader><CardTitle>Filters</CardTitle></CardHeader>
      <CardContent>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <div className="space-y-1">
            <Label>Periode</Label>
            <Select value={value.period} onValueChange={(v) => handlePeriodChange(v as PeriodPreset)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {PERIOD_ORDER.map((p) => (
                  <SelectItem key={p} value={p}>{PERIOD_LABELS[p]}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {value.period !== "custom" && (
              <p className="text-xs text-muted-foreground">
                {formatDate(value.from)} t/m {formatDate(value.to)}
              </p>
            )}
          </div>

          {value.period === "custom" && (
            <>
              <div className="space-y-1">
                <Label>Van</Label>
                <Input type="date" value={value.from} onChange={(e) => set("from", e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label>Tot</Label>
                <Input type="date" value={value.to} onChange={(e) => set("to", e.target.value)} />
              </div>
            </>
          )}
          <div className="space-y-1">
            <Label>Klant</Label>
            <Select value={value.customerId} onValueChange={(v) => onChange({ ...value, customerId: v === "_all" ? "" : v, projectId: "" })}>
              <SelectTrigger><SelectValue placeholder="Alle klanten" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="_all">Alle klanten</SelectItem>
                {customers.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label>Project</Label>
            <Select value={value.projectId} onValueChange={(v) => set("projectId", v === "_all" ? "" : v)}>
              <SelectTrigger><SelectValue placeholder="Alle projecten" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="_all">Alle projecten</SelectItem>
                {filteredProjects.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label>Medewerker</Label>
            <Select value={value.userId} onValueChange={(v) => set("userId", v === "_all" ? "" : v)}>
              <SelectTrigger><SelectValue placeholder="Alle medewerkers" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="_all">Alle medewerkers</SelectItem>
                {users.map((u) => <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label>Factureerbaar</Label>
            <Select value={value.billable} onValueChange={(v) => set("billable", v === "_all" ? "" : v)}>
              <SelectTrigger><SelectValue placeholder="Alles" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="_all">Alles</SelectItem>
                <SelectItem value="true">Factureerbaar</SelectItem>
                <SelectItem value="false">Niet factureerbaar</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        {tags.length > 0 && (
          <div className="mt-4 space-y-1">
            <Label>Tags</Label>
            <div className="flex flex-wrap gap-2 mt-1">
              {tags.map((tag) => (
                <Badge
                  key={tag.id}
                  variant={value.tagIds.includes(tag.id) ? "default" : "outline"}
                  className="cursor-pointer select-none"
                  onClick={() => toggleTag(tag.id)}
                >
                  {tag.name}
                </Badge>
              ))}
            </div>
          </div>
        )}

        <div className="mt-4 flex items-center gap-2">
          <input
            type="checkbox"
            id="group-by-employee"
            checked={value.groupByEmployee}
            onChange={(e) => set("groupByEmployee", e.target.checked)}
            className="h-4 w-4 rounded border-input accent-primary"
          />
          <Label htmlFor="group-by-employee">Groepeer per medewerker</Label>
        </div>

        <Button className="mt-4" onClick={onSubmit} disabled={loading}>
          <Search className="h-4 w-4 mr-2" />
          {loading ? "Laden..." : "Rapport ophalen"}
        </Button>
      </CardContent>
    </Card>
  );
}
