# Contracts + History Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the flat contract fields on `User` with versioned `Contract` records (history, salary, job title, FTE, notes), a Personeel management section, contract document attachments, and admin expiry-reminder emails.

**Architecture:** A new `Contract` model becomes the single source of truth; a pure, unit-tested helper resolves the contract effective on any date (used by the UI for "current" and by payroll per month). New ADMIN-only `/personeel` pages and `/api/contracts*` routes mirror existing CRUD/attachment/cron patterns. Existing `User` contract columns are backfilled into contracts, then dropped.

**Tech Stack:** Next.js App Router, Prisma (Neon, `prisma db push`), Zod, react-hook-form, `@vercel/blob`, nodemailer/Mailtrap. Tests are standalone `node:assert` self-checks run with `npx tsx` (NO vitest). **Node 22 for all commands:** prefix with `export NVM_DIR="$HOME/.nvm" && source "$NVM_DIR/nvm.sh" && nvm use 22 &&`.

**DB sync & manual steps are controller-handled, not subagent-run:** Implementers run `npx prisma generate` (offline, builds client types for typecheck) but must NOT run `npx prisma db push` (mutates the remote Neon DB), the backfill `curl`, or dev-server/Mailtrap checks. The controller runs those against Neon between/after the relevant tasks and coordinates the destructive column-drop (Task 9) with the user.

**Spec:** `docs/superpowers/specs/2026-06-26-contracts-history-design.md`

**Branch:** Work on `feat/contracts-history`, based on `feat/menu-restructure` (this plan edits `sidebar.tsx`, which that branch also changed). The PR base is `feat/menu-restructure`.

**Repo conventions (must follow — from memory/patterns):**
- Every API handler wraps its body in `try { … } catch (e) { return handleError(e); }` (`@/lib/api`).
- Server pages serialize Decimal→Number and Date→string before passing to client components.
- Forms send `""` (not `null`) for empty optionals; the API converts `""`/absent → `null`.
- Don't use Zod `.default()` with `zodResolver`; put defaults in `useForm({ defaultValues })`.

---

### Task 1: Add Contract + ContractAttachment models

**Files:**
- Modify: `prisma/schema.prisma` (add two models + `User.contracts` relation; KEEP the existing `User` contract columns for now — they are dropped in Task 9)

- [ ] **Step 1: Add the models**

In `prisma/schema.prisma`, add the `contracts` relation to `User` (leave `contractType`/`contractHours`/`contractStart`/`contractEnd`/`weeklyHours` untouched):

```prisma
  contracts         Contract[]
```

Then add at the end of the file (the `ContractType` enum already exists — reuse it):

```prisma
model Contract {
  id                   String               @id @default(cuid())
  userId               String
  user                 User                 @relation(fields: [userId], references: [id], onDelete: Cascade)
  contractType         ContractType         @default(PERMANENT)
  contractHours        Decimal?             @db.Decimal(5, 2)
  startDate            DateTime?            @db.Date
  endDate              DateTime?            @db.Date
  salaryMonthly        Decimal?             @db.Decimal(10, 2)
  salaryHourly         Decimal?             @db.Decimal(10, 2)
  jobTitle             String?
  ftePercentage        Decimal?             @db.Decimal(5, 2)
  notes                String?
  expiryReminderSentAt DateTime?
  createdAt            DateTime             @default(now())
  updatedAt            DateTime             @updatedAt
  attachments          ContractAttachment[]

  @@index([userId])
}

model ContractAttachment {
  id         String   @id @default(cuid())
  contractId String
  contract   Contract @relation(fields: [contractId], references: [id], onDelete: Cascade)
  filename   String
  url        String
  size       Int
  createdAt  DateTime @default(now())
}
```

- [ ] **Step 2: Push schema + regenerate client**

Run:

```bash
export NVM_DIR="$HOME/.nvm" && source "$NVM_DIR/nvm.sh" && nvm use 22 && npx prisma db push
```

Expected: "Your database is now in sync with your Prisma schema." and the client regenerates. `prisma.contract` and `prisma.contractAttachment` are now available.

- [ ] **Step 3: Commit**

```bash
git add prisma/schema.prisma
git commit -m "feat: add Contract and ContractAttachment models"
```

---

### Task 2: Pure contract helpers (TDD)

**Files:**
- Create: `src/lib/contracts.ts`
- Test: `src/lib/contracts.test.ts`

These are string-date helpers (`"YYYY-MM-DD"`, lexicographic = chronological) so both the client (string dates) and payroll (convert Dates) share one implementation.

**Testing convention (IMPORTANT):** This repo does NOT use vitest. Its `src/lib/*.test.ts` files are standalone `node:assert` self-check scripts run with `npx tsx <file>` that print a "passed" line on success (see `src/lib/payroll.test.ts`). Match that exact convention.

- [ ] **Step 1: Write the failing self-check**

Create `src/lib/contracts.test.ts`, mirroring `src/lib/payroll.test.ts`:

```ts
import assert from "node:assert";
import { getEffectiveContract, fillSalary, rangeOverlaps, WEEKS_PER_MONTH } from "./contracts";

const a = { id: "a", startDate: "2024-01-01", endDate: "2024-12-31" };
const b = { id: "b", startDate: "2025-01-01", endDate: null };

// getEffectiveContract
assert.strictEqual(getEffectiveContract([], "2025-06-01"), null, "empty -> null");
assert.strictEqual(getEffectiveContract([a, b], "2024-06-01")?.id, "a", "covers a");
assert.strictEqual(getEffectiveContract([a, b], "2025-06-01")?.id, "b", "covers b");
assert.strictEqual(getEffectiveContract([a, b], "2023-06-01"), null, "before any -> null");
const c = { id: "c", startDate: "2025-06-01", endDate: null };
assert.strictEqual(getEffectiveContract([a, c], "2025-03-01"), null, "gap -> null");
const open = { id: "o", startDate: null, endDate: null };
assert.strictEqual(getEffectiveContract([open], "1999-01-01")?.id, "o", "null start = from beginning");
assert.strictEqual(getEffectiveContract([open, b], "2025-06-01")?.id, "b", "latest start wins");

// fillSalary
const fromMonthly = fillSalary({ salaryMonthly: 4000, salaryHourly: null, contractHours: 40 });
assert.ok(Math.abs(fromMonthly.salaryHourly! - 4000 / (40 * WEEKS_PER_MONTH)) < 0.01, "hourly from monthly");
assert.strictEqual(fromMonthly.salaryMonthly, 4000, "monthly kept");
const fromHourly = fillSalary({ salaryMonthly: null, salaryHourly: 25, contractHours: 40 });
assert.ok(Math.abs(fromHourly.salaryMonthly! - 25 * 40 * WEEKS_PER_MONTH) < 0.01, "monthly from hourly");
assert.deepStrictEqual(
  fillSalary({ salaryMonthly: 4000, salaryHourly: 30, contractHours: 40 }),
  { salaryMonthly: 4000, salaryHourly: 30 },
  "both kept (manual override)",
);
assert.strictEqual(
  fillSalary({ salaryMonthly: 4000, salaryHourly: null, contractHours: null }).salaryHourly,
  null,
  "no derive without hours",
);

// rangeOverlaps
assert.strictEqual(rangeOverlaps("2024-01-01", null, "2025-06-01", null), true, "open ranges overlap");
assert.strictEqual(rangeOverlaps("2024-01-01", "2024-12-31", "2025-01-01", null), false, "adjacent no overlap");

console.log("contracts self-check passed");
```

- [ ] **Step 2: Run the self-check, verify it fails**

```bash
export NVM_DIR="$HOME/.nvm" && source "$NVM_DIR/nvm.sh" && nvm use 22 && npx tsx src/lib/contracts.test.ts
```

Expected: FAIL — cannot import from `./contracts` (module/exports missing).

- [ ] **Step 3: Implement the helpers**

Create `src/lib/contracts.ts`:

```ts
export const WEEKS_PER_MONTH = 52 / 12;

export interface ContractDates {
  startDate: string | null; // "YYYY-MM-DD"
  endDate: string | null;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

/** Contract effective on refDate ("YYYY-MM-DD"): latest start that covers the date, else null. */
export function getEffectiveContract<T extends ContractDates>(contracts: T[], refDate: string): T | null {
  const matching = contracts.filter(
    (c) => (c.startDate == null || c.startDate <= refDate) && (c.endDate == null || c.endDate >= refDate)
  );
  if (matching.length === 0) return null;
  matching.sort((a, b) => (a.startDate ?? "").localeCompare(b.startDate ?? ""));
  return matching[matching.length - 1];
}

/** Fill the blank one of monthly/hourly from the other when contractHours is set. */
export function fillSalary(input: {
  salaryMonthly: number | null;
  salaryHourly: number | null;
  contractHours: number | null;
}): { salaryMonthly: number | null; salaryHourly: number | null } {
  let { salaryMonthly, salaryHourly } = input;
  const h = input.contractHours;
  if (h != null && h > 0) {
    if (salaryMonthly != null && salaryHourly == null) {
      salaryHourly = round2(salaryMonthly / (h * WEEKS_PER_MONTH));
    } else if (salaryHourly != null && salaryMonthly == null) {
      salaryMonthly = round2(salaryHourly * h * WEEKS_PER_MONTH);
    }
  }
  return { salaryMonthly, salaryHourly };
}

/** True if two date ranges overlap; null start = -inf, null end = +inf. */
export function rangeOverlaps(
  aStart: string | null, aEnd: string | null,
  bStart: string | null, bEnd: string | null,
): boolean {
  const aS = aStart ?? "0000-01-01", aE = aEnd ?? "9999-12-31";
  const bS = bStart ?? "0000-01-01", bE = bEnd ?? "9999-12-31";
  return aS <= bE && bS <= aE;
}
```

- [ ] **Step 4: Run the self-check, verify it passes**

```bash
export NVM_DIR="$HOME/.nvm" && source "$NVM_DIR/nvm.sh" && nvm use 22 && npx tsx src/lib/contracts.test.ts
```

Expected: prints `contracts self-check passed` and exits 0.

- [ ] **Step 5: Commit**

```bash
git add src/lib/contracts.ts src/lib/contracts.test.ts
git commit -m "feat: add contract resolution and salary helpers"
```

---

### Task 3: Contract CRUD API

**Files:**
- Create: `src/app/api/contracts/route.ts` (POST create)
- Create: `src/app/api/contracts/[id]/route.ts` (PUT update, DELETE)
- Create: `src/app/api/users/[id]/contracts/route.ts` (GET list for a user)

All ADMIN-only. Mirror the existing user-API serialization style.

- [ ] **Step 1: Shared serializer + create route**

Create `src/app/api/contracts/route.ts`:

```ts
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { z } from "zod";
import { handleError } from "@/lib/api";
import { fillSalary } from "@/lib/contracts";

export const contractSelect = {
  id: true, userId: true, contractType: true, contractHours: true,
  startDate: true, endDate: true, salaryMonthly: true, salaryHourly: true,
  jobTitle: true, ftePercentage: true, notes: true, expiryReminderSentAt: true,
  createdAt: true,
  attachments: { select: { id: true, filename: true, url: true, size: true, createdAt: true } },
} as const;

export function serializeContract(c: any) {
  const d = (v: Date | null) => (v ? v.toISOString().slice(0, 10) : null);
  return {
    ...c,
    contractHours: c.contractHours != null ? Number(c.contractHours) : null,
    salaryMonthly: c.salaryMonthly != null ? Number(c.salaryMonthly) : null,
    salaryHourly: c.salaryHourly != null ? Number(c.salaryHourly) : null,
    ftePercentage: c.ftePercentage != null ? Number(c.ftePercentage) : null,
    startDate: d(c.startDate),
    endDate: d(c.endDate),
    expiryReminderSentAt: c.expiryReminderSentAt ? c.expiryReminderSentAt.toISOString() : null,
    createdAt: c.createdAt.toISOString(),
  };
}

const num = z.coerce.number().positive().optional().nullable();
const dateStr = z.string().optional().or(z.literal(""));

export const contractBodySchema = z.object({
  contractType: z.enum(["PERMANENT", "FIXED_TERM", "ZERO_HOURS"]).default("PERMANENT"),
  contractHours: num,
  startDate: dateStr,
  endDate: dateStr,
  salaryMonthly: num,
  salaryHourly: num,
  jobTitle: z.string().optional().or(z.literal("")),
  ftePercentage: num,
  notes: z.string().optional().or(z.literal("")),
});

const createSchema = contractBodySchema.extend({ userId: z.string().min(1) });

/** Map a parsed body to Prisma data, running salary auto-calc and "" → null. */
export function toContractData(b: z.infer<typeof contractBodySchema>) {
  const contractHours = b.contractHours ?? null;
  const { salaryMonthly, salaryHourly } = fillSalary({
    salaryMonthly: b.salaryMonthly ?? null,
    salaryHourly: b.salaryHourly ?? null,
    contractHours,
  });
  return {
    contractType: b.contractType,
    contractHours,
    startDate: b.startDate ? new Date(b.startDate) : null,
    endDate: b.endDate ? new Date(b.endDate) : null,
    salaryMonthly,
    salaryHourly,
    jobTitle: b.jobTitle || null,
    ftePercentage: b.ftePercentage ?? null,
    notes: b.notes || null,
  };
}

async function requireAdmin() {
  const session = await auth();
  if (!session) return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  if ((session.user as any)?.role !== "ADMIN")
    return { error: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
  return { error: null };
}

export async function POST(req: Request) {
  try {
    const { error } = await requireAdmin();
    if (error) return error;
    const { userId, ...body } = createSchema.parse(await req.json());
    const contract = await prisma.contract.create({
      data: { userId, ...toContractData(body) },
      select: contractSelect,
    });
    return NextResponse.json(serializeContract(contract), { status: 201 });
  } catch (e) { return handleError(e); }
}
```

- [ ] **Step 2: Update + delete route**

Create `src/app/api/contracts/[id]/route.ts`:

```ts
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { handleError } from "@/lib/api";
import { contractBodySchema, contractSelect, serializeContract, toContractData } from "../route";

async function requireAdmin() {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if ((session.user as any)?.role !== "ADMIN")
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  return null;
}

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const denied = await requireAdmin();
    if (denied) return denied;
    const { id } = await params;
    const body = contractBodySchema.parse(await req.json());
    const contract = await prisma.contract.update({
      where: { id },
      data: toContractData(body),
      select: contractSelect,
    });
    return NextResponse.json(serializeContract(contract));
  } catch (e) { return handleError(e); }
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const denied = await requireAdmin();
    if (denied) return denied;
    const { id } = await params;
    await prisma.contract.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (e) { return handleError(e); }
}
```

- [ ] **Step 3: List route**

Create `src/app/api/users/[id]/contracts/route.ts`:

```ts
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { handleError } from "@/lib/api";
import { contractSelect, serializeContract } from "@/app/api/contracts/route";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await auth();
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if ((session.user as any)?.role !== "ADMIN")
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    const { id } = await params;
    const contracts = await prisma.contract.findMany({
      where: { userId: id },
      orderBy: [{ startDate: "desc" }, { createdAt: "desc" }],
      select: contractSelect,
    });
    return NextResponse.json(contracts.map(serializeContract));
  } catch (e) { return handleError(e); }
}
```

- [ ] **Step 4: Typecheck**

```bash
export NVM_DIR="$HOME/.nvm" && source "$NVM_DIR/nvm.sh" && nvm use 22 && npx tsc --noEmit
```

Expected: exit 0.

- [ ] **Step 5: Commit**

```bash
git add src/app/api/contracts src/app/api/users/[id]/contracts
git commit -m "feat: contract CRUD API with salary auto-calc"
```

---

### Task 4: Backfill endpoint + run

**Files:**
- Create: `src/app/api/migrate-contracts/route.ts`

Idempotent, secret-guarded (mirrors `/api/seed`). Creates one contract per user that has none, from the existing flat columns. (The flat columns still exist until Task 9, so this reads them via a raw-typed select.)

- [ ] **Step 1: Write the endpoint**

Create `src/app/api/migrate-contracts/route.ts`:

```ts
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";

export async function POST(req: Request) {
  const { searchParams } = new URL(req.url);
  if (searchParams.get("key") !== process.env.SEED_KEY) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const users = await prisma.user.findMany({
    select: {
      id: true, contractType: true, contractHours: true, contractStart: true, contractEnd: true,
      _count: { select: { contracts: true } },
    },
  });

  let created = 0;
  for (const u of users) {
    if (u._count.contracts > 0) continue;
    await prisma.contract.create({
      data: {
        userId: u.id,
        contractType: u.contractType,
        contractHours: u.contractHours,
        startDate: u.contractStart,
        endDate: u.contractEnd,
      },
    });
    created++;
  }
  return NextResponse.json({ created, skipped: users.length - created });
}
```

- [ ] **Step 2: Typecheck**

```bash
export NVM_DIR="$HOME/.nvm" && source "$NVM_DIR/nvm.sh" && nvm use 22 && npx tsc --noEmit
```

Expected: exit 0.

- [ ] **Step 3: Commit**

```bash
git add src/app/api/migrate-contracts
git commit -m "feat: idempotent contract backfill endpoint"
```

- [ ] **Step 4: Run the backfill (manual, after deploy or against the dev DB)**

The DB is remote Neon. Run against whichever environment holds the data. Locally with the dev server running:

```bash
curl -X POST "http://localhost:3000/api/migrate-contracts?key=$SEED_KEY"
```

Expected JSON: `{ "created": N, "skipped": M }` where N = users without a contract. Re-running returns `created: 0`. **Record that this was run** in the task notes; the endpoint is removed in Task 10.

---

### Task 5: Personeel pages (list + employee detail)

**Files:**
- Create: `src/app/(app)/personeel/page.tsx` (server — employee list)
- Create: `src/components/personeel/personeel-list-client.tsx` (client table)
- Create: `src/app/(app)/personeel/[id]/page.tsx` (server — one employee)
- Create: `src/components/personeel/contracts-client.tsx` (client — history table + add/edit/delete form)

ADMIN-only. **Mirror the structure of `src/components/users/users-client.tsx`** (react-hook-form + zod, dialog/inline forms, fetch to the API, `router.refresh()` after writes). Use existing `@/components/ui/*` primitives.

- [ ] **Step 1: Employee-list server page**

Create `src/app/(app)/personeel/page.tsx`:

```tsx
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { getEffectiveContract } from "@/lib/contracts";
import { serializeContract, contractSelect } from "@/app/api/contracts/route";
import { PersoneelListClient } from "@/components/personeel/personeel-list-client";

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

export default async function PersoneelPage() {
  const session = await auth();
  if ((session?.user as any)?.role !== "ADMIN") redirect("/");

  const users = await prisma.user.findMany({
    orderBy: { name: "asc" },
    select: { id: true, name: true, email: true, role: true, contracts: { select: contractSelect } },
  });

  const rows = users.map((u) => {
    const contracts = u.contracts.map(serializeContract);
    const current = getEffectiveContract(contracts, todayStr());
    return {
      id: u.id, name: u.name, email: u.email, role: u.role,
      jobTitle: current?.jobTitle ?? null,
      salaryMonthly: current?.salaryMonthly ?? null,
      contractType: current?.contractType ?? null,
      endDate: current?.endDate ?? null,
    };
  });

  return <PersoneelListClient rows={rows} />;
}
```

- [ ] **Step 2: Employee-list client**

Create `src/components/personeel/personeel-list-client.tsx` — a `"use client"` table component. Props:

```ts
interface Row {
  id: string; name: string; email: string; role: string;
  jobTitle: string | null; salaryMonthly: number | null;
  contractType: "PERMANENT" | "FIXED_TERM" | "ZERO_HOURS" | null;
  endDate: string | null;
}
export function PersoneelListClient({ rows }: { rows: Row[] }) { /* ... */ }
```

Render a table: Naam (link to `/personeel/${id}`), Functie (`jobTitle ?? "—"`), Salaris (`salaryMonthly != null ? formatCurrency(salaryMonthly) : "—"` using `@/lib/utils` `formatCurrency`), and a warning chip "Loopt af" when `contractType === "FIXED_TERM"` and `endDate` is within 30 days of today (compute with date-fns or string compare against `today + 30d`). Mirror the table markup of `users-client.tsx`.

- [ ] **Step 3: Employee-detail server page**

Create `src/app/(app)/personeel/[id]/page.tsx`:

```tsx
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { redirect, notFound } from "next/navigation";
import { serializeContract, contractSelect } from "@/app/api/contracts/route";
import { ContractsClient } from "@/components/personeel/contracts-client";

export default async function EmployeePage({ params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if ((session?.user as any)?.role !== "ADMIN") redirect("/");
  const { id } = await params;

  const user = await prisma.user.findUnique({
    where: { id },
    select: {
      id: true, name: true, email: true, role: true,
      contracts: { orderBy: [{ startDate: "desc" }, { createdAt: "desc" }], select: contractSelect },
    },
  });
  if (!user) notFound();

  return (
    <ContractsClient
      user={{ id: user.id, name: user.name, email: user.email, role: user.role }}
      initialContracts={user.contracts.map(serializeContract)}
    />
  );
}
```

- [ ] **Step 4: Contracts client (history + form)**

Create `src/components/personeel/contracts-client.tsx` — `"use client"`. Props:

```ts
interface Contract {
  id: string; userId: string;
  contractType: "PERMANENT" | "FIXED_TERM" | "ZERO_HOURS";
  contractHours: number | null; startDate: string | null; endDate: string | null;
  salaryMonthly: number | null; salaryHourly: number | null;
  jobTitle: string | null; ftePercentage: number | null; notes: string | null;
  attachments: { id: string; filename: string; url: string; size: number; createdAt: string }[];
}
export function ContractsClient({
  user, initialContracts,
}: { user: { id: string; name: string; email: string; role: string }; initialContracts: Contract[] }) { /* ... */ }
```

Requirements, mirroring `users-client.tsx` patterns:
- Header with employee name/email + a "back to /personeel" link.
- Empty state when `initialContracts.length === 0`: text "Nog geen contract" + a "Contract toevoegen" button that opens the add form.
- History table: one row per contract (newest first), columns Periode (`startDate ?? "—"` → `endDate ?? "heden"`), Functie, Type, Uren, Maand/Uur salaris (`formatCurrency`), FTE. Highlight the row that is the effective contract today (`getEffectiveContract(contracts, today)`).
- Add/Edit form (react-hook-form + zod, NO `.default()` in the resolver schema — use `defaultValues`). Fields: contractType (Select), contractHours, startDate (`<input type=date>`), endDate, salaryMonthly, salaryHourly, jobTitle, ftePercentage, notes. Send `""` for empty optionals.
  - POST to `/api/contracts` with `{ userId: user.id, ...values }` on add; PUT to `/api/contracts/${id}` on edit.
  - After success: `router.refresh()`.
- **Overlap warning (non-blocking):** before submit, compute `rangeOverlaps` (from `@/lib/contracts`) of the entered start/end against every OTHER contract; if any overlaps, show a visible warning near the submit button but still allow submitting.
- Delete button per row → DELETE `/api/contracts/${id}` (with a confirm), then `router.refresh()`.
- Attachment UI is added in Task 6 — leave a placeholder area in each row (or wire it now if convenient).

- [ ] **Step 5: Typecheck + manual check**

```bash
export NVM_DIR="$HOME/.nvm" && source "$NVM_DIR/nvm.sh" && nvm use 22 && npx tsc --noEmit
```

Expected: exit 0. Then with `npm run dev`, as ADMIN: `/personeel` lists employees; clicking one shows history; adding a contract with only `salaryMonthly` + `contractHours` set fills `salaryHourly` after refresh; overlapping dates show the warning but still save; delete removes a version.

- [ ] **Step 6: Commit**

```bash
git add "src/app/(app)/personeel" src/components/personeel
git commit -m "feat: Personeel section with contract history management"
```

---

### Task 6: Contract attachments (API + UI)

**Files:**
- Create: `src/app/api/contracts/[id]/attachments/route.ts` (POST upload)
- Create: `src/app/api/contracts/[id]/attachments/[attachmentId]/route.ts` (DELETE)
- Create: `src/app/api/contracts/[id]/attachments/[attachmentId]/download/route.ts` (GET stream)
- Modify: `src/components/personeel/contracts-client.tsx` (upload/download/delete UI per contract row)

Mirror `src/app/api/invoices/[id]/attachments/*`.

- [ ] **Step 1: Upload route**

Create `src/app/api/contracts/[id]/attachments/route.ts`:

```ts
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { put } from "@vercel/blob";
import { handleError } from "@/lib/api";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await auth();
    if ((session?.user as any)?.role !== "ADMIN")
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    const { id } = await params;

    const contract = await prisma.contract.findUnique({ where: { id }, select: { id: true } });
    if (!contract) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const formData = await req.formData();
    const file = formData.get("file") as File | null;
    if (!file) return NextResponse.json({ error: "Geen bestand" }, { status: 400 });

    const blob = await put(`contracts/${id}/${file.name}`, file, { access: "private" });
    const attachment = await prisma.contractAttachment.create({
      data: { contractId: id, filename: file.name, url: blob.url, size: file.size },
    });
    return NextResponse.json(attachment, { status: 201 });
  } catch (e) { return handleError(e); }
}
```

- [ ] **Step 2: Delete route**

Create `src/app/api/contracts/[id]/attachments/[attachmentId]/route.ts`:

```ts
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { del } from "@vercel/blob";
import { handleError } from "@/lib/api";

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string; attachmentId: string }> }
) {
  try {
    const session = await auth();
    if ((session?.user as any)?.role !== "ADMIN")
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    const { attachmentId } = await params;

    const attachment = await prisma.contractAttachment.findUnique({ where: { id: attachmentId } });
    if (!attachment) return NextResponse.json({ error: "Not found" }, { status: 404 });

    await del(attachment.url);
    await prisma.contractAttachment.delete({ where: { id: attachmentId } });
    return NextResponse.json({ success: true });
  } catch (e) { return handleError(e); }
}
```

- [ ] **Step 3: Download route**

First read `src/app/api/invoices/[id]/attachments/[attachmentId]/download/route.ts` (or `src/app/api/expenses/[id]/receipt/download/route.ts`) to copy the exact streaming pattern this repo uses for private blobs. Create `src/app/api/contracts/[id]/attachments/[attachmentId]/download/route.ts` with the same approach, looking up the attachment via `prisma.contractAttachment.findUnique`, ADMIN-guarded. (The implementer mirrors whatever fetch/redirect/stream mechanism the invoice download uses — keep it identical.)

- [ ] **Step 4: Wire UI**

In `contracts-client.tsx`, per contract row: list `attachments` (filename → link to the download route), an upload `<input type="file">` that POSTs `FormData` to `/api/contracts/${id}/attachments` then `router.refresh()`, and a delete button hitting the DELETE route then `router.refresh()`.

- [ ] **Step 5: Typecheck + manual check**

```bash
export NVM_DIR="$HOME/.nvm" && source "$NVM_DIR/nvm.sh" && nvm use 22 && npx tsc --noEmit
```

Expected: exit 0. Manually: upload a PDF to a contract, download it back, delete it.

- [ ] **Step 6: Commit**

```bash
git add "src/app/api/contracts/[id]/attachments" src/components/personeel/contracts-client.tsx
git commit -m "feat: contract document attachments"
```

---

### Task 7: Switch payroll to the effective contract

**Files:**
- Modify: `src/app/api/payroll/route.ts` (data sourcing only; `src/lib/payroll.ts` is unchanged)

- [ ] **Step 1: Source contract data from contracts**

In `src/app/api/payroll/route.ts`, replace the `prisma.user.findMany` select and the `payrollUsers` mapping. Add the import and a month-end helper, then resolve per user.

Add to imports:

```ts
import { getEffectiveContract } from "@/lib/contracts";
import { serializeContract, contractSelect } from "@/app/api/contracts/route";
```

Change the users query (inside the `Promise.all`) from selecting flat fields to:

```ts
      prisma.user.findMany({
        orderBy: { name: "asc" },
        select: { id: true, name: true, contracts: { select: contractSelect } },
      }),
```

Replace the `payrollUsers` mapping with (compute the month-end date string and resolve):

```ts
    const monthEnd = new Date(Date.UTC(year, month, 0)).toISOString().slice(0, 10); // last day of month
    const payrollUsers: PayrollUser[] = users.map((u) => {
      const current = getEffectiveContract(u.contracts.map(serializeContract), monthEnd);
      return {
        id: u.id,
        name: u.name,
        contractType: (current?.contractType ?? "PERMANENT") as PayrollUser["contractType"],
        contractHours: current?.contractHours ?? null,
      };
    });
```

(`PayrollUser` already requires a non-null `contractType`; defaulting to `"PERMANENT"` with a null `contractHours` yields `overtime: null`, exactly the no-contract empty-state behavior.)

- [ ] **Step 2: Typecheck**

```bash
export NVM_DIR="$HOME/.nvm" && source "$NVM_DIR/nvm.sh" && nvm use 22 && npx tsc --noEmit
```

Expected: exit 0.

- [ ] **Step 3: Manual check**

With `npm run dev`, open `/payroll` for a month: rows match each user's effective contract; a user with no contract shows contractType handling with `overtime` blank and no error.

- [ ] **Step 4: Commit**

```bash
git add src/app/api/payroll/route.ts
git commit -m "feat: payroll resolves the contract effective per month"
```

---

### Task 8: Remove contract fields from the /users form

**Files:**
- Modify: `src/components/users/users-client.tsx` (drop contractType/Hours/Start/End from both schemas, forms, table, and payloads — keep `weeklyHours`)
- Modify: `src/app/api/users/route.ts` (drop the 4 fields from `createSchema`, `userSelect`, `serializeUser`, and the create data — keep `weeklyHours`)
- Modify: `src/app/api/users/[id]/route.ts` (same removals in `updateSchema`, `userSelect`, `serializeUser`, update data)
- Modify: `src/app/(app)/users/page.tsx` (drop the 4 fields from the select + mapping)

This decouples reads from the soon-to-be-dropped columns. **Do not** remove `weeklyHours` anywhere.

- [ ] **Step 1: Edit the API routes**

In `src/app/api/users/route.ts` and `src/app/api/users/[id]/route.ts`: remove `contractType`, `contractHours`, `contractStart`, `contractEnd` from the zod schema, from `userSelect`, from `serializeUser`, and from the create/update data construction. Leave `weeklyHours` intact.

- [ ] **Step 2: Edit the users page select**

In `src/app/(app)/users/page.tsx`, remove the 4 contract fields from the `select` and from the `.map(...)` projection. Keep `weeklyHours`.

- [ ] **Step 3: Edit the users client**

In `src/components/users/users-client.tsx`: remove the 4 contract fields from `createSchema`, `editSchema`, the `User` type, both `reset(...)` calls, the table cells, and the create/edit form JSX (lines around 22-26, 34-38, 49-53, 80-93, 252-278, 323-349 per current file — verify by reading). Keep all `weeklyHours` usage. Add a hint linking to `/personeel/[id]` for managing contracts (optional, a single line of JSX).

- [ ] **Step 4: Typecheck**

```bash
export NVM_DIR="$HOME/.nvm" && source "$NVM_DIR/nvm.sh" && nvm use 22 && npx tsc --noEmit
```

Expected: exit 0 (no remaining references to the removed fields).

- [ ] **Step 5: Manual check**

`/users` create + edit still works (name, email, role, password, weeklyHours); no contract inputs remain.

- [ ] **Step 6: Commit**

```bash
git add "src/app/(app)/users/page.tsx" src/app/api/users src/components/users/users-client.tsx
git commit -m "refactor: move contract fields out of user management into Personeel"
```

---

### Task 9: Drop the flat contract columns from User

**Files:**
- Modify: `prisma/schema.prisma` (remove `contractType`, `contractHours`, `contractStart`, `contractEnd` from `User`; keep `weeklyHours` and `contractType` ENUM)

Do this only after Tasks 4 (backfill run), 7, and 8 — nothing reads the columns anymore.

- [ ] **Step 1: Remove the columns**

In `prisma/schema.prisma`, delete these four lines from the `User` model:

```prisma
  contractType      ContractType      @default(PERMANENT)
  contractHours     Decimal?          @db.Decimal(5, 2)
  contractStart     DateTime?         @db.Date
  contractEnd       DateTime?         @db.Date
```

Keep `weeklyHours` and the `enum ContractType` (still used by `Contract`).

- [ ] **Step 2: Push schema**

```bash
export NVM_DIR="$HOME/.nvm" && source "$NVM_DIR/nvm.sh" && nvm use 22 && npx prisma db push
```

Expected: sync succeeds and drops the columns. (Confirm the backfill in Task 4 ran first — these columns' data is gone after this.)

- [ ] **Step 3: Typecheck**

```bash
export NVM_DIR="$HOME/.nvm" && source "$NVM_DIR/nvm.sh" && nvm use 22 && npx tsc --noEmit
```

Expected: exit 0. **Note:** the backfill endpoint in `src/app/api/migrate-contracts/route.ts` reads these columns — it is deleted in Task 10, so a transient type error there is expected until Task 10. If you prefer green between tasks, do Task 10 Step 1 (delete the endpoint) before this typecheck.

- [ ] **Step 4: Commit**

```bash
git add prisma/schema.prisma
git commit -m "refactor: drop flat contract columns from User"
```

---

### Task 10: Expiry reminder cron + email + sidebar + cleanup

**Files:**
- Delete: `src/app/api/migrate-contracts/route.ts` (backfill done)
- Create: `src/app/api/cron/contract-expiry/route.ts`
- Modify: `src/lib/email.ts` (add `sendContractExpiryEmail`)
- Modify: `vercel.json` (add the cron)
- Modify: `src/components/layout/sidebar.tsx` (add Personeel group)

- [ ] **Step 1: Remove the backfill endpoint**

```bash
git rm src/app/api/migrate-contracts/route.ts
```

- [ ] **Step 2: Add the email function**

In `src/lib/email.ts`, add (mirroring the existing `sendHoursReminderEmail` HTML/transport style — read it first for the exact `transport.sendMail` shape and `from` address):

```ts
export async function sendContractExpiryEmail(
  admin: { name: string; email: string },
  contract: { jobTitle: string | null; contractType: string; endDate: string },
  employee: { name: string },
  settings: any,
): Promise<void> {
  const end = new Date(contract.endDate).toLocaleDateString("nl-NL");
  const html = `<!DOCTYPE html><html><body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;font-size:14px;color:#111;">
  <div style="max-width:640px;margin:0 auto;padding:40px 24px;">
    <p style="margin:0 0 8px;">Beste ${admin.name},</p>
    <p style="margin:0 0 16px;">Het contract van <strong>${employee.name}</strong>${contract.jobTitle ? ` (${contract.jobTitle})` : ""} loopt af op <strong>${end}</strong>.</p>
    <p style="margin:0 0 16px;">Type: ${contract.contractType}. Plan tijdig een verlenging of vervolggesprek.</p>
    <p style="color:#666;margin:24px 0 0;">${settings?.name ?? ""}</p>
  </div></body></html>`;
  await transport.sendMail({
    from: settings?.email || process.env.MAIL_FROM || "noreply@evatime.app",
    to: admin.email,
    subject: `Contract loopt af: ${employee.name} (${end})`,
    html,
  });
}
```

Verify the `from`/transport call matches how `sendHoursReminderEmail` sends (copy its exact `from` resolution); adjust if different.

- [ ] **Step 3: Add the cron route**

Create `src/app/api/cron/contract-expiry/route.ts`:

```ts
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { sendContractExpiryEmail } from "@/lib/email";

// ponytail: 30-day window, tunable; promote to CompanySettings if it ever needs configuring
const CONTRACT_EXPIRY_REMINDER_DAYS = 30;

export async function GET(req: Request) {
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && req.headers.get("x-vercel-cron-secret") !== cronSecret) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const today = new Date();
  const from = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()));
  const until = new Date(from);
  until.setUTCDate(until.getUTCDate() + CONTRACT_EXPIRY_REMINDER_DAYS);

  const contracts = await prisma.contract.findMany({
    where: { endDate: { gte: from, lte: until }, expiryReminderSentAt: null },
    select: {
      id: true, contractType: true, jobTitle: true, endDate: true,
      user: { select: { name: true } },
    },
  });
  if (contracts.length === 0) return NextResponse.json({ reminded: 0 });

  const admins = await prisma.user.findMany({
    where: { role: "ADMIN" },
    select: { name: true, email: true },
  });
  const settings = await prisma.companySettings.findFirst();

  let reminded = 0;
  for (const c of contracts) {
    const endDate = c.endDate!.toISOString().slice(0, 10);
    for (const admin of admins) {
      if (!admin.email) continue;
      try {
        await sendContractExpiryEmail(
          admin,
          { jobTitle: c.jobTitle, contractType: c.contractType, endDate },
          { name: c.user.name },
          settings,
        );
      } catch (e) {
        console.error("contract-expiry email failed", c.id, e);
      }
    }
    await prisma.contract.update({ where: { id: c.id }, data: { expiryReminderSentAt: new Date() } });
    reminded++;
  }
  return NextResponse.json({ reminded });
}
```

- [ ] **Step 4: Schedule the cron**

In `vercel.json`, add to the `crons` array:

```json
{
  "path": "/api/cron/contract-expiry",
  "schedule": "0 8 * * *"
}
```

(Resulting `crons` has both `hours-reminder` and `contract-expiry`.)

- [ ] **Step 5: Add the Personeel sidebar group**

In `src/components/layout/sidebar.tsx`, add a new group to `navGroups` (after Dashboard/Registratie, before or after Beheer). Use an already-imported icon (e.g. `UserCog` or `Users`):

```tsx
  {
    label: "Personeel",
    roles: ["ADMIN"],
    items: [
      { href: "/personeel", label: "Medewerkers", icon: UserCog },
    ],
  },
```

- [ ] **Step 6: Typecheck**

```bash
export NVM_DIR="$HOME/.nvm" && source "$NVM_DIR/nvm.sh" && nvm use 22 && npx tsc --noEmit
```

Expected: exit 0 (the backfill endpoint is gone, so no stale references to dropped columns remain).

- [ ] **Step 7: Manual check**

- Sidebar shows **Personeel → Medewerkers** for ADMIN, hidden for others.
- Create a contract ending in ~10 days with `expiryReminderSentAt` null, then hit
  `curl "http://localhost:3000/api/cron/contract-expiry"` (no CRON_SECRET locally) → returns
  `{ reminded: 1 }`, an admin email is sent (check Mailtrap), and a second call returns
  `{ reminded: 0 }`.

- [ ] **Step 8: Commit**

```bash
git add src/app/api/cron/contract-expiry src/lib/email.ts vercel.json src/components/layout/sidebar.tsx
git rm --cached src/app/api/migrate-contracts/route.ts 2>/dev/null || true
git commit -m "feat: contract expiry reminders, Personeel nav, remove backfill endpoint"
```

---

### Task 11: Adopt vitest as the test runner

**Files:**
- Modify: `package.json` (add `vitest` devDependency + `test` script)
- Create: `vitest.config.ts`
- Modify: `src/lib/contracts.test.ts`, `src/lib/payroll.test.ts`, `src/lib/km-template.test.ts`, `src/lib/projects.test.ts` (convert the `node:assert` self-check scripts to vitest suites)

Until now tests were standalone `npx tsx` self-checks. This task introduces vitest as the project test runner and migrates the existing self-checks to it, so `npm test` runs everything. Equivalent assertions — no behavior change in the code under test.

- [ ] **Step 1: Install vitest**

```bash
export NVM_DIR="$HOME/.nvm" && source "$NVM_DIR/nvm.sh" && nvm use 22 && npm install -D vitest
```

Expected: `vitest` added to `devDependencies`.

- [ ] **Step 2: Add config + test script**

Create `vitest.config.ts`:

```ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
});
```

Add to the `scripts` block in `package.json`:

```json
    "test": "vitest run",
```

- [ ] **Step 3: Convert the self-check files to vitest suites**

For EACH of `src/lib/contracts.test.ts`, `src/lib/payroll.test.ts`, `src/lib/km-template.test.ts`, `src/lib/projects.test.ts`: replace `import assert from "node:assert"` with `import { describe, it, expect } from "vitest"`, wrap the top-level assertions in `it(...)` blocks inside a `describe(<filename>, ...)`, translate each assertion (`assert.strictEqual(a, b)` → `expect(a).toBe(b)`; `assert.deepStrictEqual` → `toEqual`; `assert.ok(x)` → `expect(x).toBeTruthy()`; `assert.strictEqual(x, null)` → `expect(x).toBeNull()`), and delete the trailing `console.log("... self-check passed")`.

Concrete example — `src/lib/contracts.test.ts` becomes:

```ts
import { describe, it, expect } from "vitest";
import { getEffectiveContract, fillSalary, rangeOverlaps, WEEKS_PER_MONTH } from "./contracts";

const a = { id: "a", startDate: "2024-01-01", endDate: "2024-12-31" };
const b = { id: "b", startDate: "2025-01-01", endDate: null };

describe("getEffectiveContract", () => {
  it("returns null for no contracts", () => expect(getEffectiveContract([], "2025-06-01")).toBeNull());
  it("picks the covering contract", () => {
    expect(getEffectiveContract([a, b], "2024-06-01")?.id).toBe("a");
    expect(getEffectiveContract([a, b], "2025-06-01")?.id).toBe("b");
  });
  it("null before any contract", () => expect(getEffectiveContract([a, b], "2023-06-01")).toBeNull());
  it("null in a gap", () => {
    const c = { id: "c", startDate: "2025-06-01", endDate: null };
    expect(getEffectiveContract([a, c], "2025-03-01")).toBeNull();
  });
  it("null startDate = from beginning", () => {
    const open = { id: "o", startDate: null, endDate: null };
    expect(getEffectiveContract([open], "1999-01-01")?.id).toBe("o");
  });
  it("latest start wins", () => {
    const open = { id: "o", startDate: null, endDate: null };
    expect(getEffectiveContract([open, b], "2025-06-01")?.id).toBe("b");
  });
});

describe("fillSalary", () => {
  it("derives hourly from monthly", () => {
    const r = fillSalary({ salaryMonthly: 4000, salaryHourly: null, contractHours: 40 });
    expect(r.salaryHourly).toBeCloseTo(4000 / (40 * WEEKS_PER_MONTH), 2);
    expect(r.salaryMonthly).toBe(4000);
  });
  it("derives monthly from hourly", () => {
    const r = fillSalary({ salaryMonthly: null, salaryHourly: 25, contractHours: 40 });
    expect(r.salaryMonthly).toBeCloseTo(25 * 40 * WEEKS_PER_MONTH, 2);
  });
  it("keeps both when both provided", () => {
    expect(fillSalary({ salaryMonthly: 4000, salaryHourly: 30, contractHours: 40 }))
      .toEqual({ salaryMonthly: 4000, salaryHourly: 30 });
  });
  it("no derive without hours", () => {
    expect(fillSalary({ salaryMonthly: 4000, salaryHourly: null, contractHours: null }).salaryHourly).toBeNull();
  });
});

describe("rangeOverlaps", () => {
  it("open ranges overlap", () => expect(rangeOverlaps("2024-01-01", null, "2025-06-01", null)).toBe(true));
  it("adjacent no overlap", () => expect(rangeOverlaps("2024-01-01", "2024-12-31", "2025-01-01", null)).toBe(false));
});
```

Apply the same mechanical conversion to the other three files, preserving their existing assertions exactly. Read each file first; do not change the logic being tested.

- [ ] **Step 4: Run the full suite**

```bash
export NVM_DIR="$HOME/.nvm" && source "$NVM_DIR/nvm.sh" && nvm use 22 && npm test
```

Expected: all suites pass (contracts, payroll, km-template, projects), exit 0.

- [ ] **Step 5: Commit**

```bash
git add package.json package-lock.json vitest.config.ts src/lib/*.test.ts
git commit -m "test: adopt vitest and migrate self-checks to it"
```

---

## Self-Review

**Spec coverage:**
- §1 data model → Task 1. Salary auto-calc → Task 2 (`fillSalary`) + Task 3 (`toContractData`). Migration → Task 1 (add) + Task 4 (backfill) + Task 9 (drop). ✅
- §2 effective resolution → Task 2 (`getEffectiveContract`, tested). ✅
- §3 payroll → Task 7. ✅
- §4 UI & API → Task 3 (API), Task 5 (pages, overlap warning, empty state). ✅
- §5 attachments → Task 6. ✅
- §6 expiry reminders → Task 10 (cron, email, `expiryReminderSentAt` field added in Task 1, vercel.json). ✅
- §7 sidebar → Task 10 Step 5. ✅
- §8 out of scope respected (no self-view, no auto-FTE, no manager). ✅
- Empty-state behavior → Task 5 (UI) + Task 7 (payroll default). ✅

**Placeholder scan:** Logic-heavy code (helpers, API, cron, email, payroll) is given in full. The two large React client components (Task 5/6) are specified by exact props, API calls, states, and an explicit "mirror `users-client.tsx`" instruction rather than 300+ lines of verbatim JSX — deliberate, given the repo's established big-client-component pattern. The attachment download route (Task 6 Step 3) instructs copying the existing invoice/expense download route verbatim because its exact stream mechanism must match the repo. No "TBD"/"add error handling"-style gaps.

**Type consistency:** `contractSelect`/`serializeContract`/`toContractData`/`contractBodySchema` are defined once in `src/app/api/contracts/route.ts` (Task 3) and imported everywhere (Tasks 3, 5, 7). `getEffectiveContract`/`fillSalary`/`rangeOverlaps`/`WEEKS_PER_MONTH` defined in Task 2, used in Tasks 3/5/7. `PayrollUser` shape reused unchanged in Task 7. Serialized contract field names match between API serializer and client prop types. ✅
