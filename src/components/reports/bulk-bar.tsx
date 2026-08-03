"use client";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { BulkKind, BulkAction } from "@/lib/bulk-entries";

interface Props {
  kind: BulkKind;
  count: number;
  projects: any[];
  users: any[];
  onApply: (action: BulkAction) => void;
  busy: boolean;
}

const NOUN: Record<BulkKind, string> = { time: "uurregels", km: "ritten", expense: "uitgaven" };

export function BulkBar({ kind, count, projects, users, onApply, busy }: Props) {
  // ponytail: Radix Select fights a controlled value reset to "" in the same tick as
  // onValueChange (stale selected-item state). Remounting via `key` after each pick
  // sidesteps that instead of fighting Radix's internal state machine.
  const [projectKey, setProjectKey] = useState(0);
  const [userKey, setUserKey] = useState(0);

  return (
    <div className="flex flex-wrap items-center gap-2 border-b bg-muted/50 px-4 py-2 text-sm">
      <span className="font-medium">{count} {NOUN[kind]} geselecteerd</span>

      <Select
        key={projectKey}
        disabled={busy}
        onValueChange={(v) => {
          const project = projects.find((p) => p.id === v);
          const label = project ? `${project.customer ? `${project.customer.name} — ` : ""}${project.name}` : v;
          if (confirm(`${count} regels verplaatsen naar ${label}?`)) {
            onApply({ type: "project", projectId: v });
          }
          setProjectKey((k) => k + 1);
        }}
      >
        <SelectTrigger className="h-8 w-56"><SelectValue placeholder="Verplaats naar project" /></SelectTrigger>
        <SelectContent>
          {projects.map((p) => (
            <SelectItem key={p.id} value={p.id}>{p.customer ? `${p.customer.name} — ` : ""}{p.name}</SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select
        key={userKey}
        disabled={busy}
        onValueChange={(v) => {
          const user = users.find((u) => u.id === v);
          const name = user?.name ?? v;
          if (confirm(`${count} regels toewijzen aan ${name}?`)) {
            onApply({ type: "user", userId: v });
          }
          setUserKey((k) => k + 1);
        }}
      >
        <SelectTrigger className="h-8 w-48"><SelectValue placeholder="Toewijzen aan" /></SelectTrigger>
        <SelectContent>
          {users.map((u) => <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>)}
        </SelectContent>
      </Select>

      <Button variant="destructive" size="sm" className="h-8" disabled={busy} onClick={() => onApply({ type: "delete" })}>
        Verwijderen
      </Button>
    </div>
  );
}
