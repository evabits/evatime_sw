# Concept Projects Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let employees create a `CONCEPT` project (name + activities only) that is immediately usable for logging hours, and let an admin finalize it (customer, rates) by flipping it to `ACTIVE`.

**Architecture:** Reuse the existing `Project` model. Add a `CONCEPT` status and make `customerId` nullable. Employees create concept projects from the time page; admins finalize via the existing projects edit dialog. A small pure helper enforces that non-admins can only create bare concept projects.

**Tech Stack:** Next.js (App Router, this fork — read `node_modules/next/dist/docs/` before changing routing), Prisma + PostgreSQL, Zod, react-hook-form, shadcn/ui, NextAuth. Tests are plain `node:assert` scripts run with `npx tsx` (see `src/lib/payroll.test.ts`).

**Conventions to follow:**
- API routes wrap handlers in `try/catch` and return `handleError(e)` (`src/lib/api.ts`).
- Serialize Prisma `Decimal`/`Date` with `serialize()` (`src/lib/utils.ts`) before passing to clients.
- Role checks via `isAdmin(role)` / helpers in `src/lib/roles.ts`.
- Dutch UI labels (e.g. "Concept", "Nieuw project").

---

## File Structure

- `prisma/schema.prisma` — add `CONCEPT` enum value; make `customerId`/`customer` nullable. **Modify.**
- `src/lib/projects.ts` — new pure helper `projectCreateDenialReason(role, input)`. **Create.**
- `src/lib/projects.test.ts` — assert-based test for the helper. **Create.**
- `src/app/api/projects/route.ts` — POST: optional `customerId`, `CONCEPT` status, `activityTypeIds`, role guard, link activities. **Modify.**
- `src/app/api/projects/[id]/route.ts` — PUT: add `CONCEPT` to status enum. **Modify.**
- `src/app/(app)/time/page.tsx` — load `CONCEPT` projects too. **Modify.**
- `src/components/time/time-entries-client.tsx` — null-customer guard, "+ Nieuw project" dialog, concept label. **Modify.**
- `src/components/projects/projects-client.tsx` — `CONCEPT` badge/label/select option + status filter. **Modify.**

---

## Task 1: Schema — add CONCEPT status and nullable customer

**Files:**
- Modify: `prisma/schema.prisma`

- [ ] **Step 1: Add `CONCEPT` to the `ProjectStatus` enum**

```prisma
enum ProjectStatus {
  CONCEPT
  ACTIVE
  INACTIVE
  COMPLETED
}
```

- [ ] **Step 2: Make the `Project` customer relation nullable**

In `model Project`, change these two lines:

```prisma
  customerId        String?
  customer          Customer?             @relation(fields: [customerId], references: [id])
```

(Leave the rest of the model unchanged. Making a populated NOT NULL column nullable is a safe migration.)

- [ ] **Step 3: Create and apply the migration**

Run: `npm run db:migrate -- --name concept_projects`
Expected: migration created under `prisma/migrations/`, applies cleanly, `prisma generate` runs.

- [ ] **Step 4: Commit**

```bash
git add prisma/schema.prisma prisma/migrations
git commit -m "feat: add CONCEPT project status and nullable customer"
```

---

## Task 2: Pure guard helper (TDD)

The only non-trivial branching logic in this feature: deciding whether a given role may create a given project payload. Extract it as a pure function and test it.

**Files:**
- Create: `src/lib/projects.ts`
- Test: `src/lib/projects.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/lib/projects.test.ts`:

```ts
import assert from "node:assert";
import { projectCreateDenialReason } from "./projects";

// Admins may create anything.
assert.strictEqual(projectCreateDenialReason("ADMIN", { status: "ACTIVE", customerId: "c1" }), null);
assert.strictEqual(projectCreateDenialReason("ADMIN", { status: "CONCEPT" }), null);

// Employees may create a bare concept project.
assert.strictEqual(projectCreateDenialReason("EMPLOYEE", { status: "CONCEPT" }), null);

// Employees may not create non-concept projects.
assert.ok(projectCreateDenialReason("EMPLOYEE", { status: "ACTIVE" }));

// Employees may not attach a customer or rates to a concept project.
assert.ok(projectCreateDenialReason("EMPLOYEE", { status: "CONCEPT", customerId: "c1" }));
assert.ok(projectCreateDenialReason("EMPLOYEE", { status: "CONCEPT", defaultHourlyRate: 80 }));
assert.ok(projectCreateDenialReason("EMPLOYEE", { status: "CONCEPT", defaultKmRate: 0.23 }));

// FINANCE is not an admin -> same restriction as employees.
assert.ok(projectCreateDenialReason("FINANCE", { status: "ACTIVE", customerId: "c1" }));

console.log("projects.test.ts passed");
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx tsx src/lib/projects.test.ts`
Expected: FAIL — cannot find module `./projects` (file not created yet).

- [ ] **Step 3: Write the minimal implementation**

Create `src/lib/projects.ts`:

```ts
import { isAdmin } from "./roles";

export type NewProjectInput = {
  status: string;
  customerId?: string | null;
  defaultHourlyRate?: number | null;
  defaultKmRate?: number | null;
};

/**
 * Returns a denial reason string if `role` may NOT create the given project,
 * or null if creation is allowed. Non-admins may only create bare CONCEPT
 * projects (no customer, no rates).
 */
export function projectCreateDenialReason(role: string, input: NewProjectInput): string | null {
  if (isAdmin(role)) return null;
  if (input.status !== "CONCEPT") return "Medewerkers kunnen alleen conceptprojecten aanmaken";
  if (input.customerId) return "Een conceptproject kan geen klant hebben";
  if (input.defaultHourlyRate != null || input.defaultKmRate != null)
    return "Een conceptproject kan geen tarieven hebben";
  return null;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx tsx src/lib/projects.test.ts`
Expected: PASS — prints `projects.test.ts passed`.

- [ ] **Step 5: Commit**

```bash
git add src/lib/projects.ts src/lib/projects.test.ts
git commit -m "feat: add project creation permission guard"
```

---

## Task 3: POST /api/projects — concept creation + activity links + guard

**Files:**
- Modify: `src/app/api/projects/route.ts`

- [ ] **Step 1: Update the Zod schema**

Replace the `schema` definition near the top with:

```ts
const schema = z.object({
  customerId: z.string().min(1).optional().nullable(),
  name: z.string().min(1),
  description: z.string().optional(),
  status: z.enum(["CONCEPT", "ACTIVE", "INACTIVE", "COMPLETED"]).default("ACTIVE"),
  defaultHourlyRate: z.number().positive().optional().nullable(),
  defaultKmRate: z.number().positive().optional().nullable(),
  tags: z.array(z.string()).optional(),
  activityTypeIds: z.array(z.string()).optional(),
});
```

- [ ] **Step 2: Enforce the role guard and create with activity links**

Replace the body of `POST` (everything inside the `try`) with:

```ts
    const session = await auth();
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const role = (session.user as any)?.role ?? "EMPLOYEE";
    const { tags, activityTypeIds, ...rest } = schema.parse(await req.json());

    const denial = projectCreateDenialReason(role, rest);
    if (denial) return NextResponse.json({ error: denial }, { status: 403 });

    const project = await prisma.project.create({
      data: {
        ...rest,
        ...(tags && tags.length > 0
          ? {
              tags: {
                connectOrCreate: tags.map((name) => ({ where: { name }, create: { name } })),
              },
            }
          : {}),
        ...(activityTypeIds && activityTypeIds.length > 0
          ? {
              activityLinks: {
                create: activityTypeIds.map((activityTypeId) => ({ activityTypeId })),
              },
            }
          : {}),
      },
      include: { tags: { select: { id: true, name: true } } },
    });
    return NextResponse.json(project, { status: 201 });
```

- [ ] **Step 3: Add the import**

At the top of the file, add:

```ts
import { projectCreateDenialReason } from "@/lib/projects";
```

- [ ] **Step 4: Verify it compiles and lints**

Run: `npm run lint`
Expected: no errors in `src/app/api/projects/route.ts`.

- [ ] **Step 5: Commit**

```bash
git add src/app/api/projects/route.ts
git commit -m "feat: accept concept projects and activity links in projects api"
```

---

## Task 4: PUT /api/projects/[id] — allow CONCEPT status

So admins can open and re-save a concept project (e.g. before/while finalizing) without the status enum rejecting it.

**Files:**
- Modify: `src/app/api/projects/[id]/route.ts`

- [ ] **Step 1: Add `CONCEPT` to the PUT schema status enum**

Change the `status` line in the `schema` object to:

```ts
  status: z.enum(["CONCEPT", "ACTIVE", "INACTIVE", "COMPLETED"]),
```

(Leave `customerId: z.string().min(1)` as required — finalizing requires picking a customer.)

- [ ] **Step 2: Verify it lints**

Run: `npm run lint`
Expected: no errors in the file.

- [ ] **Step 3: Commit**

```bash
git add "src/app/api/projects/[id]/route.ts"
git commit -m "feat: allow CONCEPT status when editing a project"
```

---

## Task 5: Time page — load concept projects

**Files:**
- Modify: `src/app/(app)/time/page.tsx`

- [ ] **Step 1: Include CONCEPT projects in the query**

Change the project `findMany` `where` clause from `{ status: "ACTIVE" }` to:

```ts
      where: { status: { in: ["ACTIVE", "CONCEPT"] } },
```

Then add `status: true` to that query's `select` block (so the client can label concept projects):

```ts
      select: {
        id: true,
        name: true,
        status: true,
        defaultHourlyRate: true,
        customer: { select: { id: true, name: true } },
        activityRates: { include: { activityType: true } },
      },
```

- [ ] **Step 2: Verify it lints**

Run: `npm run lint`
Expected: no errors in the file.

- [ ] **Step 3: Commit**

```bash
git add "src/app/(app)/time/page.tsx"
git commit -m "feat: show concept projects on the time page"
```

---

## Task 6: Time client — null-customer guard, concept label, create dialog

**Files:**
- Modify: `src/components/time/time-entries-client.tsx`

- [ ] **Step 1: Guard the customer filter against null customer**

Find the line (~108):

```ts
    : projects.filter((p) => p.customer.id === selectedCustomerId);
```

Replace with:

```ts
    : projects.filter((p) => p.customer?.id === selectedCustomerId);
```

- [ ] **Step 2: Label concept projects in the project dropdown**

Find the project `<SelectItem>` rendering inside the entry form (the project picker around line 303-311). It maps over the project list rendering each project's name. Append a concept marker to the label, e.g.:

```tsx
{filteredProjects.map((p) => (
  <SelectItem key={p.id} value={p.id}>
    {p.name}{p.status === "CONCEPT" ? " (concept)" : ""}
  </SelectItem>
))}
```

(Use the existing variable the component already maps for the form's project select — match the current JSX; only add the ` (concept)` suffix.)

- [ ] **Step 3: Add component state for the new-project dialog**

Near the other `useState` hooks at the top of the component, add:

```tsx
const [newProjectOpen, setNewProjectOpen] = useState(false);
const [newProjectName, setNewProjectName] = useState("");
const [newProjectActivityIds, setNewProjectActivityIds] = useState<string[]>([]);
const [newProjectSaving, setNewProjectSaving] = useState(false);
```

- [ ] **Step 4: Add the create-concept-project handler**

Add this function inside the component (alongside the other handlers):

```tsx
async function handleCreateConceptProject() {
  if (!newProjectName.trim()) return;
  setNewProjectSaving(true);
  try {
    const res = await fetch("/api/projects", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: newProjectName.trim(),
        status: "CONCEPT",
        activityTypeIds: newProjectActivityIds,
      }),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      alert(body.error ?? "Aanmaken mislukt");
      return;
    }
    const created = await res.json();
    // Add to the in-memory project list so it is selectable immediately.
    projects.push({
      id: created.id,
      name: created.name,
      status: "CONCEPT",
      defaultHourlyRate: null,
      customer: null,
      activityRates: [],
    });
    form.setValue("projectId", created.id);
    setNewProjectOpen(false);
    setNewProjectName("");
    setNewProjectActivityIds([]);
  } finally {
    setNewProjectSaving(false);
  }
}
```

> Note: `projects` is a prop array; mutating + `setValue` re-renders via the form. If the component instead keeps projects in state, push to that setter rather than the prop. Check how `projects` is consumed before choosing; prefer a state setter if one exists.

- [ ] **Step 5: Add the "+ Nieuw project" button and dialog**

Next to the project `<Select>` in the entry form, add a button that opens the dialog:

```tsx
<Button type="button" variant="outline" size="sm" onClick={() => setNewProjectOpen(true)}>
  + Nieuw project
</Button>
```

And render a dialog (reuse the `Dialog` components already imported in this file — match the existing dialog usage pattern in the component):

```tsx
<Dialog open={newProjectOpen} onOpenChange={setNewProjectOpen}>
  <DialogContent>
    <DialogHeader>
      <DialogTitle>Nieuw conceptproject</DialogTitle>
    </DialogHeader>
    <div className="space-y-4">
      <div>
        <Label>Naam</Label>
        <Input value={newProjectName} onChange={(e) => setNewProjectName(e.target.value)} />
      </div>
      <div>
        <Label>Activiteiten</Label>
        <div className="space-y-1">
          {activityTypes.map((a) => (
            <label key={a.id} className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={newProjectActivityIds.includes(a.id)}
                onChange={(e) =>
                  setNewProjectActivityIds((prev) =>
                    e.target.checked ? [...prev, a.id] : prev.filter((id) => id !== a.id),
                  )
                }
              />
              {a.name}
            </label>
          ))}
        </div>
      </div>
    </div>
    <DialogFooter>
      <Button onClick={handleCreateConceptProject} disabled={newProjectSaving || !newProjectName.trim()}>
        Aanmaken
      </Button>
    </DialogFooter>
  </DialogContent>
</Dialog>
```

> If `Dialog`, `Label`, or `Input` are not already imported in this file, add them from `@/components/ui/*` matching the imports used in `projects-client.tsx`.

- [ ] **Step 6: Verify it builds and lints**

Run: `npm run lint`
Expected: no errors in the file. Then manually verify (see Task 8).

- [ ] **Step 7: Commit**

```bash
git add src/components/time/time-entries-client.tsx
git commit -m "feat: employees create concept projects from the time page"
```

---

## Task 7: Projects client — CONCEPT badge, select option, status filter

**Files:**
- Modify: `src/components/projects/projects-client.tsx`

- [ ] **Step 1: Add CONCEPT to the form status enum**

Change the form schema `status` field (line ~22) to:

```ts
  status: z.enum(["CONCEPT", "ACTIVE", "INACTIVE", "COMPLETED"]),
```

- [ ] **Step 2: Add CONCEPT to the label and badge variant maps**

```ts
const statusLabel: Record<string, string> = { CONCEPT: "Concept", ACTIVE: "Actief", INACTIVE: "Inactief", COMPLETED: "Afgerond" };
const statusVariant: Record<string, "default" | "secondary" | "success"> = {
  CONCEPT: "secondary",
  ACTIVE: "success",
  INACTIVE: "secondary",
  COMPLETED: "default",
};
```

- [ ] **Step 3: Add CONCEPT to the status `<Select>` options**

In the edit dialog's status select (the block with the `ACTIVE`/`INACTIVE`/`COMPLETED` `<SelectItem>`s, ~line 271-276), add:

```tsx
<SelectItem value="CONCEPT">Concept</SelectItem>
```

- [ ] **Step 4: Add a status filter above the projects table**

Add a filter state near the top of the component:

```tsx
const [statusFilter, setStatusFilter] = useState<string>("all");
```

Render a small select above the table (match the file's existing `Select` usage):

```tsx
<Select onValueChange={setStatusFilter} value={statusFilter}>
  <SelectTrigger className="w-48"><SelectValue /></SelectTrigger>
  <SelectContent>
    <SelectItem value="all">Alle statussen</SelectItem>
    <SelectItem value="CONCEPT">Concept</SelectItem>
    <SelectItem value="ACTIVE">Actief</SelectItem>
    <SelectItem value="INACTIVE">Inactief</SelectItem>
    <SelectItem value="COMPLETED">Afgerond</SelectItem>
  </SelectContent>
</Select>
```

And filter the rendered rows by it. Find where `projects` is mapped into table rows and wrap the source list:

```tsx
{projects
  .filter((p) => statusFilter === "all" || p.status === statusFilter)
  .map((p) => (
    // ...existing row JSX unchanged...
  ))}
```

- [ ] **Step 5: Verify it builds and lints**

Run: `npm run lint`
Expected: no errors in the file.

- [ ] **Step 6: Commit**

```bash
git add src/components/projects/projects-client.tsx
git commit -m "feat: concept status badge, option, and filter on projects page"
```

---

## Task 8: Full build + manual verification

**Files:** none (verification only).

- [ ] **Step 1: Build the whole app**

Run: `npm run build`
Expected: build succeeds (includes `prisma generate`). Fix any type errors surfaced by the nullable `customer` change (look for `.customer.` without optional chaining) before continuing.

- [ ] **Step 2: Manual end-to-end check**

Run `npm run dev` and verify:
1. As an employee, on the time page: "+ Nieuw project" → enter a name, pick one or more activities → "Aanmaken". The new project is selected automatically and shows "(concept)" in the picker.
2. Log an hour entry against the concept project with one of its activities; it saves.
3. As an admin, on the projects page: filter by "Concept", see the new project with a "Concept" badge and no customer.
4. Open it, assign a customer + rates, set status "Actief", save.
5. Back on the time page the project no longer shows "(concept)"; the earlier hour entry is still attached.
6. As an employee, confirm a direct `POST /api/projects` with `status: "ACTIVE"` is rejected with 403 (`curl` or devtools), proving the guard.

- [ ] **Step 3: Commit any build fixes**

```bash
git add -A
git commit -m "fix: handle nullable project customer across UI"
```

---

## Self-Review notes

- **Spec coverage:** schema (Task 1), employee create UI (Task 6), POST API + guard (Tasks 2-3), time page wiring (Tasks 5-6), admin finalize badge/filter/select (Task 7), PUT accepting CONCEPT (Task 4), null-customer guards (Tasks 6 & 8). All spec sections mapped.
- **Type consistency:** helper named `projectCreateDenialReason` and imported under that name in Task 3; `NewProjectInput` fields match the `rest` object passed from the route; `activityTypeIds` used consistently in schema, client fetch body, and link creation (`activityLinks.create`).
- **Known soft spots flagged inline:** whether `projects` is a prop vs state in the time client (Task 6 Step 4) and which UI primitives are already imported (Task 6 Step 5) — the implementer must check the actual file, since exact line content may have drifted.
