# Payroll Overview (Loonverwerking) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** An admin-only `/payroll` page showing, per employee for a selected month: worked hours, WBSO hours, overtime, and kilometers — for handing to payroll.

**Architecture:** A small contract concept (4 fields) is added to `User`, edited in the existing `/users` admin page. A new `GET /api/payroll?month=YYYY-MM` aggregates `TimeEntry` (total + WBSO-tagged-project subset), `KmEntry`, and contract data, then a pure `src/lib/payroll.ts` function assembles the rows (overtime = worked − monthly contract hours; blank for zero-hours). A client page renders the table with a month picker.

**Tech Stack:** Next.js 16 (App Router), Prisma 6, NextAuth v5, Zod, react-hook-form, shadcn/ui, date-fns. Tests: standalone `tsx` assert-check (no test framework in this repo).

---

## File Structure

- `prisma/schema.prisma` — add `ContractType` enum + 4 `User` fields (modify).
- `prisma/migrations/...` — new migration (generated).
- `src/lib/payroll.ts` — pure calculation: types + `weeksInMonth` + `buildPayrollRows` (create).
- `src/lib/payroll.test.ts` — `tsx`-runnable assert self-check (create).
- `src/app/api/payroll/route.ts` — aggregation API (create).
- `src/app/(app)/payroll/page.tsx` — admin server page → client (create).
- `src/components/payroll/payroll-client.tsx` — month picker + table, Dutch UI (create).
- `src/components/layout/sidebar.tsx` — add nav item (modify).
- `src/app/api/users/route.ts` — contract fields in create schema + serialization (modify).
- `src/app/api/users/[id]/route.ts` — contract fields in update schema + serialization (modify).
- `src/app/(app)/users/page.tsx` — select + serialize contract fields (modify).
- `src/components/users/users-client.tsx` — contract fields in forms + interface + table (modify).

---

## Task 1: Schema — contract fields on User

**Files:**
- Modify: `prisma/schema.prisma` (User model lines 10-25; add enum after `Role` enum)

- [ ] **Step 1: Add the `ContractType` enum**

In `prisma/schema.prisma`, add this enum directly after the existing `Role` enum (which ends at line 31):

```prisma
enum ContractType {
  PERMANENT
  FIXED_TERM
  ZERO_HOURS
}
```

- [ ] **Step 2: Add four fields to the `User` model**

In the `User` model, immediately after the existing `weeklyHours` line, add:

```prisma
  contractType      ContractType      @default(PERMANENT)
  contractHours     Decimal?          @db.Decimal(5, 2)
  contractStart     DateTime?         @db.Date
  contractEnd       DateTime?         @db.Date
```

Leave `weeklyHours` untouched — it is the registration target and stays separate from `contractHours`.

- [ ] **Step 3: Create and apply the migration**

Run: `npm run db:migrate -- --name add_contract_fields`
Expected: Prisma creates a migration under `prisma/migrations/` and prints "Your database is now in sync with your schema." and regenerates the client.

- [ ] **Step 4: Verify the client picks up the new fields**

Run: `npx tsc --noEmit`
Expected: PASS (no errors). The generated Prisma types now include `contractType`, `contractHours`, `contractStart`, `contractEnd`.

- [ ] **Step 5: Commit**

```bash
git add prisma/schema.prisma prisma/migrations
git commit -m "feat: add contract fields to user for payroll"
```

---

## Task 2: Pure payroll calculation + self-check (TDD)

**Files:**
- Create: `src/lib/payroll.ts`
- Test: `src/lib/payroll.test.ts`

- [ ] **Step 1: Write the failing self-check**

Create `src/lib/payroll.test.ts`:

```ts
import assert from "node:assert";
import { buildPayrollRows, weeksInMonth, type PayrollUser } from "./payroll";

// weeksInMonth: June 2026 has 30 days -> 30/7
assert.ok(Math.abs(weeksInMonth(2026, 6) - 30 / 7) < 1e-9, "weeksInMonth June 2026");
// February 2024 (leap) has 29 days
assert.ok(Math.abs(weeksInMonth(2024, 2) - 29 / 7) < 1e-9, "weeksInMonth Feb 2024 leap");

const users: PayrollUser[] = [
  { id: "perm", name: "Permanent", contractType: "PERMANENT", contractHours: 40 },
  { id: "zero", name: "Zero", contractType: "ZERO_HOURS", contractHours: null },
  { id: "under", name: "Under", contractType: "FIXED_TERM", contractHours: 40 },
  { id: "none", name: "NoData", contractType: "PERMANENT", contractHours: 40 },
];

const weeks = 4; // fixed for a deterministic test
const worked = new Map([["perm", 200], ["zero", 50], ["under", 100]]);
const wbso = new Map([["perm", 30], ["zero", 10]]);
const km = new Map([["perm", 120.5], ["under", 60]]);

const rows = buildPayrollRows(users, worked, wbso, km, weeks);
const byId = Object.fromEntries(rows.map((r) => [r.userId, r]));

// Permanent: monthly contract = 40*4 = 160; overtime = 200-160 = 40
assert.strictEqual(byId.perm.workedHours, 200);
assert.strictEqual(byId.perm.wbsoHours, 30);
assert.strictEqual(byId.perm.overtime, 40);
assert.strictEqual(byId.perm.km, 120.5);

// Zero-hours: overtime is null regardless of hours worked
assert.strictEqual(byId.zero.workedHours, 50);
assert.strictEqual(byId.zero.wbsoHours, 10);
assert.strictEqual(byId.zero.overtime, null);
assert.strictEqual(byId.zero.km, 0);

// Under contract: 100 worked < 160 -> overtime clamped to 0
assert.strictEqual(byId.under.overtime, 0);

// No aggregated data -> zeros, overtime 0 (200... no: 0-160 clamps to 0)
assert.strictEqual(byId.none.workedHours, 0);
assert.strictEqual(byId.none.wbsoHours, 0);
assert.strictEqual(byId.none.km, 0);
assert.strictEqual(byId.none.overtime, 0);

console.log("payroll self-check passed");
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx tsx src/lib/payroll.test.ts`
Expected: FAIL — `Cannot find module './payroll'` (file does not exist yet).

- [ ] **Step 3: Write the implementation**

Create `src/lib/payroll.ts`:

```ts
export type ContractType = "PERMANENT" | "FIXED_TERM" | "ZERO_HOURS";

export interface PayrollUser {
  id: string;
  name: string;
  contractType: ContractType;
  contractHours: number | null; // per week
}

export interface PayrollRow {
  userId: string;
  name: string;
  contractType: ContractType;
  contractHours: number | null;
  workedHours: number;
  wbsoHours: number;
  overtime: number | null; // null for ZERO_HOURS (by agreement)
  km: number;
}

const round1 = (n: number) => Math.round(n * 10) / 10;

/** Approximate weeks in a calendar month (daysInMonth / 7), matching /api/hours-overview. */
export function weeksInMonth(year: number, month: number): number {
  // month is 1-12; day 0 of next month = last day of this month
  const daysInMonth = new Date(year, month, 0).getDate();
  return daysInMonth / 7;
}

export function buildPayrollRows(
  users: PayrollUser[],
  workedByUser: Map<string, number>,
  wbsoByUser: Map<string, number>,
  kmByUser: Map<string, number>,
  weeks: number,
): PayrollRow[] {
  return users.map((u) => {
    const workedHours = round1(workedByUser.get(u.id) ?? 0);
    const wbsoHours = round1(wbsoByUser.get(u.id) ?? 0);
    const km = round1(kmByUser.get(u.id) ?? 0);

    let overtime: number | null = null;
    if (u.contractType !== "ZERO_HOURS" && u.contractHours != null) {
      const monthlyContract = u.contractHours * weeks;
      overtime = round1(Math.max(0, workedHours - monthlyContract));
    }

    return {
      userId: u.id,
      name: u.name,
      contractType: u.contractType,
      contractHours: u.contractHours,
      workedHours,
      wbsoHours,
      overtime,
      km,
    };
  });
}
```

- [ ] **Step 4: Run the self-check to verify it passes**

Run: `npx tsx src/lib/payroll.test.ts`
Expected: prints `payroll self-check passed`, exit code 0.

- [ ] **Step 5: Commit**

```bash
git add src/lib/payroll.ts src/lib/payroll.test.ts
git commit -m "feat: add payroll row calculation with self-check"
```

---

## Task 3: Payroll aggregation API

**Files:**
- Create: `src/app/api/payroll/route.ts`

- [ ] **Step 1: Write the route**

Create `src/app/api/payroll/route.ts`:

```ts
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { handleError } from "@/lib/api";
import { buildPayrollRows, weeksInMonth, type PayrollUser } from "@/lib/payroll";

export async function GET(req: Request) {
  try {
    const session = await auth();
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if ((session.user as any)?.role !== "ADMIN") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { searchParams } = new URL(req.url);
    const monthParam = searchParams.get("month"); // "YYYY-MM"
    const now = new Date();
    const [year, month] = monthParam
      ? monthParam.split("-").map(Number)
      : [now.getFullYear(), now.getMonth() + 1];

    if (!year || !month || month < 1 || month > 12) {
      return NextResponse.json({ error: "invalid month" }, { status: 400 });
    }

    // [from, to) — first day of month to first day of next month (date columns, UTC)
    const from = new Date(Date.UTC(year, month - 1, 1));
    const to = new Date(Date.UTC(year, month, 1));
    const date = { gte: from, lt: to };

    const [users, worked, wbso, km] = await Promise.all([
      prisma.user.findMany({
        orderBy: { name: "asc" },
        select: { id: true, name: true, contractType: true, contractHours: true },
      }),
      prisma.timeEntry.groupBy({ by: ["userId"], where: { date }, _sum: { hours: true } }),
      prisma.timeEntry.groupBy({
        by: ["userId"],
        where: {
          date,
          project: { tags: { some: { name: { equals: "wbso", mode: "insensitive" } } } },
        },
        _sum: { hours: true },
      }),
      prisma.kmEntry.groupBy({ by: ["userId"], where: { date }, _sum: { km: true } }),
    ]);

    const workedMap = new Map(worked.map((a) => [a.userId, Number(a._sum.hours ?? 0)]));
    const wbsoMap = new Map(wbso.map((a) => [a.userId, Number(a._sum.hours ?? 0)]));
    const kmMap = new Map(km.map((a) => [a.userId, Number(a._sum.km ?? 0)]));

    const payrollUsers: PayrollUser[] = users.map((u) => ({
      id: u.id,
      name: u.name,
      contractType: u.contractType,
      contractHours: u.contractHours != null ? Number(u.contractHours) : null,
    }));

    const rows = buildPayrollRows(payrollUsers, workedMap, wbsoMap, kmMap, weeksInMonth(year, month));
    return NextResponse.json(rows);
  } catch (e) {
    return handleError(e);
  }
}
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: PASS. (Confirms the Prisma relation filter `project.tags.some` and `contractType` field exist.)

- [ ] **Step 3: Manual smoke test (optional but recommended)**

Run: `npm run dev`, then while logged in as an admin open
`http://localhost:3000/api/payroll?month=2026-06`
Expected: JSON array of rows, one per user, with `workedHours`, `wbsoHours`, `overtime`, `km`. Non-admin session returns 403.

- [ ] **Step 4: Commit**

```bash
git add src/app/api/payroll/route.ts
git commit -m "feat: add payroll aggregation api"
```

---

## Task 4: Payroll page + client component

**Files:**
- Create: `src/app/(app)/payroll/page.tsx`
- Create: `src/components/payroll/payroll-client.tsx`

- [ ] **Step 1: Create the server page**

Create `src/app/(app)/payroll/page.tsx`:

```tsx
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { PayrollClient } from "@/components/payroll/payroll-client";

export default async function PayrollPage() {
  const session = await auth();
  const isAdmin = (session?.user as any)?.role === "ADMIN";
  if (!isAdmin) redirect("/");

  return <PayrollClient />;
}
```

- [ ] **Step 2: Create the client component**

Create `src/components/payroll/payroll-client.tsx`:

```tsx
"use client";
import { useState, useEffect } from "react";
import { format } from "date-fns";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatHours } from "@/lib/utils";

type ContractType = "PERMANENT" | "FIXED_TERM" | "ZERO_HOURS";

interface PayrollRow {
  userId: string;
  name: string;
  contractType: ContractType;
  contractHours: number | null;
  workedHours: number;
  wbsoHours: number;
  overtime: number | null;
  km: number;
}

const contractLabel: Record<ContractType, string> = {
  PERMANENT: "Vast",
  FIXED_TERM: "Bepaalde tijd",
  ZERO_HOURS: "0-uren",
};

export function PayrollClient() {
  const [month, setMonth] = useState(() => format(new Date(), "yyyy-MM"));
  const [data, setData] = useState<PayrollRow[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetch(`/api/payroll?month=${month}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!cancelled) {
          if (d) setData(d);
          setLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [month]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Loonverwerking</h1>
        <p className="text-muted-foreground">Maandoverzicht per medewerker voor de salarisadministratie</p>
      </div>

      <Card>
        <CardHeader>
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <CardTitle>Overzicht</CardTitle>
            <div className="flex items-center gap-2">
              <Label htmlFor="month" className="text-sm text-muted-foreground">Maand</Label>
              <Input
                id="month"
                type="month"
                value={month}
                onChange={(e) => setMonth(e.target.value)}
                className="w-40"
              />
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Medewerker</TableHead>
                <TableHead>Contract</TableHead>
                <TableHead className="text-right">Gewerkte uren</TableHead>
                <TableHead className="text-right">WBSO-uren</TableHead>
                <TableHead className="text-right">Overuren</TableHead>
                <TableHead className="text-right">Kilometers</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading && (
                <TableRow>
                  <TableCell colSpan={6} className="text-center text-muted-foreground py-8">Laden...</TableCell>
                </TableRow>
              )}
              {!loading && data.length === 0 && (
                <TableRow>
                  <TableCell colSpan={6} className="text-center text-muted-foreground py-8">Geen medewerkers gevonden</TableCell>
                </TableRow>
              )}
              {!loading && data.map((row) => (
                <TableRow key={row.userId}>
                  <TableCell className="font-medium">{row.name}</TableCell>
                  <TableCell>
                    {contractLabel[row.contractType]}
                    {row.contractHours != null && (
                      <span className="text-muted-foreground"> · {row.contractHours}u/wk</span>
                    )}
                  </TableCell>
                  <TableCell className="text-right font-mono">{formatHours(row.workedHours)}</TableCell>
                  <TableCell className="text-right font-mono">{formatHours(row.wbsoHours)}</TableCell>
                  <TableCell className="text-right font-mono">
                    {row.overtime != null ? formatHours(row.overtime) : <span className="text-muted-foreground">—</span>}
                  </TableCell>
                  <TableCell className="text-right font-mono">{row.km.toLocaleString("nl-NL")} km</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
```

- [ ] **Step 3: Type-check**

Run: `npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 4: Manual smoke test**

Run: `npm run dev`, log in as admin, open `http://localhost:3000/payroll`.
Expected: page renders with a month picker (defaults to current month) and a populated table. Changing the month refetches.

- [ ] **Step 5: Commit**

```bash
git add src/app/\(app\)/payroll/page.tsx src/components/payroll/payroll-client.tsx
git commit -m "feat: add payroll overview page"
```

---

## Task 5: Sidebar navigation entry

**Files:**
- Modify: `src/components/layout/sidebar.tsx` (import list lines 7-26; admin group items lines 60-67)

- [ ] **Step 1: Add the icon import**

In `src/components/layout/sidebar.tsx`, add `Wallet` to the `lucide-react` import block (the import that currently ends with `Menu, X,` around lines 24-25):

```tsx
  Menu,
  X,
  Wallet,
```

- [ ] **Step 2: Add the nav item to the admin "Beheer" group**

In the `navGroups` admin group (`label: "Beheer"`), add this item immediately after the `/users` entry (line 65):

```tsx
      { href: "/payroll", label: "Loonverwerking", icon: Wallet },
```

- [ ] **Step 3: Type-check**

Run: `npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 4: Verify in browser**

Run: `npm run dev`, log in as admin.
Expected: "Loonverwerking" appears under the "Beheer" group in the sidebar and links to `/payroll`. Log in as a non-admin: the item is absent.

- [ ] **Step 5: Commit**

```bash
git add src/components/layout/sidebar.tsx
git commit -m "feat: add payroll link to admin sidebar"
```

---

## Task 6: Contract fields in users API

**Files:**
- Modify: `src/app/api/users/route.ts`
- Modify: `src/app/api/users/[id]/route.ts`

- [ ] **Step 1: Extend the create route (`src/app/api/users/route.ts`)**

Replace `createSchema` (lines 8-14) with:

```ts
const createSchema = z.object({
  name: z.string().min(1),
  email: z.string().email(),
  password: z.string().min(8, "Minimaal 8 tekens"),
  role: z.enum(["ADMIN", "FINANCE", "EMPLOYEE"]).default("EMPLOYEE"),
  weeklyHours: z.coerce.number().positive().optional().nullable(),
  contractType: z.enum(["PERMANENT", "FIXED_TERM", "ZERO_HOURS"]).default("PERMANENT"),
  contractHours: z.coerce.number().positive().optional().nullable(),
  contractStart: z.string().optional(),
  contractEnd: z.string().optional(),
});
```

Replace `userSelect` (line 16) with:

```ts
const userSelect = {
  id: true, name: true, email: true, role: true, weeklyHours: true,
  contractType: true, contractHours: true, contractStart: true, contractEnd: true,
  createdAt: true,
} as const;
```

Add this serializer just below `userSelect`:

```ts
function serializeUser(u: {
  weeklyHours: any; contractHours: any; contractStart: Date | null; contractEnd: Date | null;
} & Record<string, any>) {
  return {
    ...u,
    weeklyHours: u.weeklyHours != null ? Number(u.weeklyHours) : null,
    contractHours: u.contractHours != null ? Number(u.contractHours) : null,
    contractStart: u.contractStart ? u.contractStart.toISOString().slice(0, 10) : null,
    contractEnd: u.contractEnd ? u.contractEnd.toISOString().slice(0, 10) : null,
  };
}
```

Replace the `GET` body's return mapping (line 24) with:

```ts
    return NextResponse.json(users.map(serializeUser));
```

Replace the `POST` body (lines 35-43) with:

```ts
    const { weeklyHours, contractHours, contractStart, contractEnd, ...rest } =
      createSchema.parse(await req.json());
    const existing = await prisma.user.findUnique({ where: { email: rest.email } });
    if (existing) return NextResponse.json({ error: "E-mailadres al in gebruik" }, { status: 409 });

    const user = await prisma.user.create({
      data: {
        ...rest,
        password: await hash(rest.password, 12),
        weeklyHours: weeklyHours ?? null,
        contractHours: contractHours ?? null,
        contractStart: contractStart ? new Date(contractStart) : null,
        contractEnd: contractEnd ? new Date(contractEnd) : null,
      },
      select: userSelect,
    });
    return NextResponse.json(serializeUser(user), { status: 201 });
```

- [ ] **Step 2: Extend the update route (`src/app/api/users/[id]/route.ts`)**

Replace `updateSchema` (lines 8-14) with:

```ts
const updateSchema = z.object({
  name: z.string().min(1),
  email: z.string().email(),
  role: z.enum(["ADMIN", "FINANCE", "EMPLOYEE"]),
  password: z.string().min(8).optional().or(z.literal("")),
  weeklyHours: z.coerce.number().positive().optional().nullable(),
  contractType: z.enum(["PERMANENT", "FIXED_TERM", "ZERO_HOURS"]).optional(),
  contractHours: z.coerce.number().positive().optional().nullable(),
  contractStart: z.string().optional(),
  contractEnd: z.string().optional(),
});
```

Replace `userSelect` (line 16) with the same expanded select and add the same `serializeUser` helper as in Step 1:

```ts
const userSelect = {
  id: true, name: true, email: true, role: true, weeklyHours: true,
  contractType: true, contractHours: true, contractStart: true, contractEnd: true,
  createdAt: true,
} as const;

function serializeUser(u: {
  weeklyHours: any; contractHours: any; contractStart: Date | null; contractEnd: Date | null;
} & Record<string, any>) {
  return {
    ...u,
    weeklyHours: u.weeklyHours != null ? Number(u.weeklyHours) : null,
    contractHours: u.contractHours != null ? Number(u.contractHours) : null,
    contractStart: u.contractStart ? u.contractStart.toISOString().slice(0, 10) : null,
    contractEnd: u.contractEnd ? u.contractEnd.toISOString().slice(0, 10) : null,
  };
}
```

In `PUT`, replace the admin-only assignment block (currently lines 32-35, `if (isAdmin) { updateData.role = ...; updateData.weeklyHours = ...; }`) with:

```ts
    if (isAdmin) {
      updateData.role = data.role;
      updateData.weeklyHours = data.weeklyHours ?? null;
      if (data.contractType) updateData.contractType = data.contractType;
      updateData.contractHours = data.contractHours ?? null;
      updateData.contractStart = data.contractStart ? new Date(data.contractStart) : null;
      updateData.contractEnd = data.contractEnd ? new Date(data.contractEnd) : null;
    }
```

Replace the `PUT` return (line 44, `return NextResponse.json({ ...user, weeklyHours: ... })`) with:

```ts
    return NextResponse.json(serializeUser(user));
```

- [ ] **Step 3: Type-check**

Run: `npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 4: Manual smoke test**

Run: `npm run dev`, log in as admin, `PUT /api/users/<id>` (via the form in Task 7, or curl) with a `contractType`/`contractHours`/`contractStart`/`contractEnd` and confirm the GET returns them serialized (hours as number, dates as `YYYY-MM-DD`).

- [ ] **Step 5: Commit**

```bash
git add src/app/api/users/route.ts src/app/api/users/\[id\]/route.ts
git commit -m "feat: accept contract fields in users api"
```

---

## Task 7: Contract fields in users page + form

**Files:**
- Modify: `src/app/(app)/users/page.tsx`
- Modify: `src/components/users/users-client.tsx`

- [ ] **Step 1: Select + serialize contract fields in the page (`src/app/(app)/users/page.tsx`)**

Replace the `findMany` + mapping (lines 10-14) with:

```tsx
  const rawUsers = await prisma.user.findMany({
    orderBy: { name: "asc" },
    select: {
      id: true, name: true, email: true, role: true, weeklyHours: true,
      contractType: true, contractHours: true, contractStart: true, contractEnd: true,
      createdAt: true,
    },
  });
  const users = rawUsers.map((u) => ({
    ...u,
    weeklyHours: u.weeklyHours ? Number(u.weeklyHours) : null,
    contractHours: u.contractHours ? Number(u.contractHours) : null,
    contractStart: u.contractStart ? u.contractStart.toISOString().slice(0, 10) : null,
    contractEnd: u.contractEnd ? u.contractEnd.toISOString().slice(0, 10) : null,
    createdAt: u.createdAt.toISOString(),
  }));
```

- [ ] **Step 2: Extend schemas + `User` interface in the client (`src/components/users/users-client.tsx`)**

Add these fields to BOTH `createSchema` (after line 22) and `editSchema` (after line 30):

```ts
  contractType: z.enum(["PERMANENT", "FIXED_TERM", "ZERO_HOURS"]).default("PERMANENT"),
  contractHours: z.coerce.number().positive("Moet groter zijn dan 0").optional().nullable(),
  contractStart: z.string().optional(),
  contractEnd: z.string().optional(),
```

Add these fields to the `User` interface (after line 41, `weeklyHours: number | null;`):

```ts
  contractType: "PERMANENT" | "FIXED_TERM" | "ZERO_HOURS";
  contractHours: number | null;
  contractStart: string | null;
  contractEnd: string | null;
```

- [ ] **Step 3: Default contract type on create, prefill on edit**

In `openCreate` (line 68), change the reset to include the contract default:

```tsx
    createForm.reset({ role: "EMPLOYEE", contractType: "PERMANENT" });
```

In `openEdit` (line 75), change the reset to prefill contract fields:

```tsx
    editForm.reset({
      name: user.name, email: user.email, role: user.role, password: "",
      weeklyHours: user.weeklyHours ?? undefined,
      contractType: user.contractType,
      contractHours: user.contractHours ?? undefined,
      contractStart: user.contractStart ?? undefined,
      contractEnd: user.contractEnd ?? undefined,
    });
```

- [ ] **Step 4: Add the contract form fields to the EDIT form**

In the edit form, inside the `{isAdmin && ( <> ... </> )}` block, immediately after the existing "Uren per week" `weeklyHours` field (the `</div>` closing line 235), insert:

```tsx
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
```

- [ ] **Step 5: Add the same contract fields to the CREATE form**

In the create form, immediately after the existing "Uren per week" `weeklyHours` field (the `</div>` closing line 280), insert the same block but with `createForm` instead of `editForm`:

```tsx
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
```

- [ ] **Step 6: Type-check**

Run: `npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 7: Manual end-to-end test**

Run: `npm run dev`, log in as admin.
1. Open `/users`, edit a user, set Contracttype = "Vast", Contracturen = 40, save.
2. Tag a project "wbso" (in `/projects`/`/settings` tag UI) and log some hours on it for that user this month.
3. Open `/payroll` for the current month and confirm the user shows worked hours, WBSO hours = the WBSO-project hours, overtime = worked − (40 × weeks), and km.
4. Set a user to Contracttype = "0-uren" and confirm the Overuren column shows "—" for them.

- [ ] **Step 8: Commit**

```bash
git add src/app/\(app\)/users/page.tsx src/components/users/users-client.tsx
git commit -m "feat: edit contract fields in users form"
```

---

## Self-Review notes (verified before handoff)

- **Spec coverage:** kilometers (Task 3 km aggregation + Task 4 column) ✓; hours / 0-uren contract setting (Task 1 fields, Task 6/7 editing, Task 4 column) ✓; WBSO-labelled hours via project "wbso" tag (Task 3 relation filter) ✓; overtime auto-calc + blank for zero-hours (Task 2 `buildPayrollRows`) ✓; admin-only (Task 3 403, Task 4 redirect, Task 5 role-gated nav) ✓; English routes / Dutch UI ✓; all users included (Task 3 `findMany` no role filter) ✓; `weeklyHours` kept separate (Task 1 leaves it, Task 6/7 keep both fields) ✓.
- **Type consistency:** `PayrollRow`/`PayrollUser`/`ContractType` shared from `src/lib/payroll.ts`; client redeclares the same row shape; `buildPayrollRows`/`weeksInMonth` names consistent across Tasks 2-3; `serializeUser` identical in both user routes.
- **No placeholders:** every code step contains full code; commands have expected output.
