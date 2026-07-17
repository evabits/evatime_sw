# Customerless Concept Projects — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let employees book hours on customerless concept projects, and make admins aware those projects exist.

**Architecture:** Two isolated fixes, no schema or permission changes. (1) The time-entry project dropdown always keeps customerless projects selectable, grouped under a "Zonder klant" label. (2) Admins see a customerless-project count in two places: a dashboard banner and a filter+badge on the projects list. A "customerless project" is `customerId === null && archivedAt === null` — in practice only ever a CONCEPT project.

**Tech Stack:** Next.js 16 (App Router, RSC), React Hook Form, Prisma, shadcn/ui Select, Vitest.

**Worktree:** Work happens in `/home/erikkallen/Projects/evabits/evatime-customerless` on branch `fix/customerless-concept-projects`. All commands below assume that directory is the CWD.

---

## Files

- Modify: `src/lib/projects.ts` — add pure `partitionProjectsByCustomer` helper (Fix 1 logic).
- Modify: `src/lib/projects.test.ts` — tests for the helper.
- Modify: `src/components/time/time-entries-client.tsx` — use helper, render "Zonder klant" group (Fix 1 UI).
- Modify: `src/app/(app)/page.tsx` — admin dashboard banner counting customerless projects (Fix 2a).
- Modify: `src/app/(app)/projects/page.tsx` — read `?filter=no-customer`, pass to client (Fix 2b).
- Modify: `src/components/projects/projects-client.tsx` — "Zonder klant" filter toggle + count badge (Fix 2b).

---

## Task 1: Pure helper to partition projects by customer

**Files:**
- Modify: `src/lib/projects.ts`
- Test: `src/lib/projects.test.ts`

- [ ] **Step 1: Write the failing test**

Append to `src/lib/projects.test.ts` (inside the file, after the existing `describe` block):

```ts
import { partitionProjectsByCustomer } from "./projects";

describe("partitionProjectsByCustomer", () => {
  const p = (id: string, customerId: string | null) => ({
    id,
    customer: customerId ? { id: customerId } : null,
  });

  it("no customer selected: splits into projects-with-customer and customerless", () => {
    const projects = [p("a", "c1"), p("b", null), p("c", "c2")];
    const { matched, customerless } = partitionProjectsByCustomer(projects, "");
    expect(matched.map((x) => x.id)).toEqual(["a", "c"]);
    expect(customerless.map((x) => x.id)).toEqual(["b"]);
  });

  it("customer selected: matched is that customer's projects, customerless always included", () => {
    const projects = [p("a", "c1"), p("b", null), p("c", "c2")];
    const { matched, customerless } = partitionProjectsByCustomer(projects, "c1");
    expect(matched.map((x) => x.id)).toEqual(["a"]);
    expect(customerless.map((x) => x.id)).toEqual(["b"]);
  });

  it("customerless is empty when every project has a customer", () => {
    const projects = [p("a", "c1"), p("c", "c2")];
    const { customerless } = partitionProjectsByCustomer(projects, "c1");
    expect(customerless).toEqual([]);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- src/lib/projects.test.ts`
Expected: FAIL — `partitionProjectsByCustomer is not a function` (or import error).

- [ ] **Step 3: Write minimal implementation**

Append to `src/lib/projects.ts`:

```ts
export type ProjectLike = { customer?: { id: string } | null };

/**
 * Splits projects for the time-entry dropdown. `matched` is the projects that
 * belong to the selected customer (or all customer-bearing projects when no
 * customer is selected); `customerless` is every project with no customer and
 * is ALWAYS returned so those projects stay bookable regardless of the filter.
 */
export function partitionProjectsByCustomer<T extends ProjectLike>(
  projects: T[],
  selectedCustomerId: string,
): { matched: T[]; customerless: T[] } {
  const customerless = projects.filter((p) => !p.customer);
  const matched =
    selectedCustomerId === ""
      ? projects.filter((p) => p.customer)
      : projects.filter((p) => p.customer?.id === selectedCustomerId);
  return { matched, customerless };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test -- src/lib/projects.test.ts`
Expected: PASS (all existing + 3 new tests green).

- [ ] **Step 5: Commit**

```bash
git add src/lib/projects.ts src/lib/projects.test.ts
git commit -m "feat: partitionProjectsByCustomer helper keeps customerless projects bookable"
```

---

## Task 2: Time form shows customerless projects under a "Zonder klant" group

**Files:**
- Modify: `src/components/time/time-entries-client.tsx`

- [ ] **Step 1: Import the helper and Select group primitives**

At the top of `src/components/time/time-entries-client.tsx`, extend the existing `@/components/ui/select` import (line ~11) to include `SelectGroup` and `SelectLabel`:

```tsx
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from "@/components/ui/select";
```

Add a new import (near the other `@/lib` imports):

```tsx
import { partitionProjectsByCustomer } from "@/lib/projects";
```

- [ ] **Step 2: Replace the `filteredProjects` computation**

Find (around line 149):

```tsx
  const filteredProjects = selectedCustomerId === ""
    ? projects
    : projects.filter((p) => p.customer?.id === selectedCustomerId);
```

Replace with:

```tsx
  const { matched: matchedProjects, customerless: customerlessProjects } =
    partitionProjectsByCustomer(projects, selectedCustomerId);
```

- [ ] **Step 3: Update the entry-form project dropdown to render two groups**

Find the entry-form project `<SelectContent>` (around line 389, the one inside the `Project *` field that maps `filteredProjects`):

```tsx
                  <SelectContent>
                    {filteredProjects.map((p) => (
                      <SelectItem key={p.id} value={p.id}>
                        {p.customer ? `${p.customer.name} — ` : ""}{p.name}{p.status === "CONCEPT" ? " (concept)" : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
```

Replace with:

```tsx
                  <SelectContent>
                    {matchedProjects.map((p) => (
                      <SelectItem key={p.id} value={p.id}>
                        {p.customer ? `${p.customer.name} — ` : ""}{p.name}{p.status === "CONCEPT" ? " (concept)" : ""}
                      </SelectItem>
                    ))}
                    {customerlessProjects.length > 0 && (
                      <SelectGroup>
                        <SelectLabel>Zonder klant</SelectLabel>
                        {customerlessProjects.map((p) => (
                          <SelectItem key={p.id} value={p.id}>
                            {p.name}{p.status === "CONCEPT" ? " (concept)" : ""}
                          </SelectItem>
                        ))}
                      </SelectGroup>
                    )}
                  </SelectContent>
```

- [ ] **Step 4: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors. (`filteredProjects` no longer referenced — confirm no other usage remains: `grep -n filteredProjects src/components/time/time-entries-client.tsx` returns nothing.)

- [ ] **Step 5: Build to confirm the component compiles**

Run: `npm run build`
Expected: build succeeds.

- [ ] **Step 6: Manual verification**

Start dev (`npm run dev`), open `/time` as a non-admin:
1. Create a concept project via "+ Nieuw project" — it auto-selects (unchanged).
2. Pick a Klant in the Klant dropdown, then open the Project dropdown: the concept project still appears under a "Zonder klant" heading and is selectable.
3. Submit hours against it — entry saves.

- [ ] **Step 7: Commit**

```bash
git add src/components/time/time-entries-client.tsx
git commit -m "feat: customerless projects stay selectable under 'Zonder klant' in time form"
```

---

## Task 3: Dashboard banner alerting admins to customerless projects

**Files:**
- Modify: `src/app/(app)/page.tsx`

- [ ] **Step 1: Add the count query to the Promise.all**

In `src/app/(app)/page.tsx`, the `Promise.all([...])` destructures into `[timeStats, kmStats, projectStats, recentTime, recentKm, vacationBudget, vacationApproved, upcomingVacations, pendingVacations]` (line ~27). Add one more entry.

Change the destructuring line to append `, customerlessProjects`:

```tsx
  const [timeStats, kmStats, projectStats, recentTime, recentKm, vacationBudget, vacationApproved, upcomingVacations, pendingVacations, customerlessProjects] = await Promise.all([
```

Then, immediately after the last array element (the `isAdmin ? prisma.absenceRequest.count(...) : Promise.resolve(0)` entry, line ~82), add a comma and this element before the closing `]);`:

```tsx
    isAdmin
      ? prisma.project.count({ where: { customerId: null, archivedAt: null } })
      : Promise.resolve(0),
```

- [ ] **Step 2: Render the banner**

In the JSX, find the pending-review banner block (starts with `{pendingReview && pendingReview.status === "PLANNED" && (`, line ~124). Immediately AFTER its closing `)}`, add:

```tsx
      {isAdmin && customerlessProjects > 0 && (
        <Link href="/projects?filter=no-customer" className="block">
          <Card className="border-amber-500/40 bg-amber-500/5">
            <CardContent className="p-4 flex items-center gap-3">
              <FolderOpen className="h-5 w-5 text-amber-600" />
              <div>
                <p className="font-medium">
                  {customerlessProjects} {customerlessProjects === 1 ? "project" : "projecten"} zonder klant
                </p>
                <p className="text-sm text-muted-foreground">Koppel een klant zodat ze gefactureerd kunnen worden.</p>
              </div>
            </CardContent>
          </Link>
        </Card>
      )}
```

Wait — correct the tag nesting (Card wraps Link's children, Link is outer). Use exactly:

```tsx
      {isAdmin && customerlessProjects > 0 && (
        <Link href="/projects?filter=no-customer" className="block">
          <Card className="border-amber-500/40 bg-amber-500/5">
            <CardContent className="p-4 flex items-center gap-3">
              <FolderOpen className="h-5 w-5 text-amber-600" />
              <div>
                <p className="font-medium">
                  {customerlessProjects} {customerlessProjects === 1 ? "project" : "projecten"} zonder klant
                </p>
                <p className="text-sm text-muted-foreground">Koppel een klant zodat ze gefactureerd kunnen worden.</p>
              </div>
            </CardContent>
          </Card>
        </Link>
      )}
```

- [ ] **Step 3: Add the `FolderOpen` icon import**

The `lucide-react` import (line ~5) is `import { Clock, Car, Euro, TrendingUp, Umbrella, CalendarDays, ClipboardCheck } from "lucide-react";`. Add `FolderOpen`:

```tsx
import { Clock, Car, Euro, TrendingUp, Umbrella, CalendarDays, ClipboardCheck, FolderOpen } from "lucide-react";
```

- [ ] **Step 4: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 5: Manual verification**

As admin, with at least one customerless concept project, open `/` — the amber banner shows the count and links to `/projects?filter=no-customer`. As non-admin, no banner.

- [ ] **Step 6: Commit**

```bash
git add "src/app/(app)/page.tsx"
git commit -m "feat: dashboard banner alerts admins to projects without a customer"
```

---

## Task 4: Projects list "Zonder klant" filter + badge + deep link

**Files:**
- Modify: `src/app/(app)/projects/page.tsx`
- Modify: `src/components/projects/projects-client.tsx`

- [ ] **Step 1: Read the query param in the server page and pass it down**

Replace the whole `src/app/(app)/projects/page.tsx` with:

```tsx
import { prisma } from "@/lib/prisma";
import { serialize } from "@/lib/utils";
import { ProjectsClient } from "@/components/projects/projects-client";

export default async function ProjectsPage({
  searchParams,
}: {
  searchParams: Promise<{ filter?: string }>;
}) {
  const { filter } = await searchParams;
  const [projects, customers, allTags] = await Promise.all([
    prisma.project.findMany({
      where: { archivedAt: null },
      orderBy: { name: "asc" },
      include: {
        customer: { select: { id: true, name: true } },
        _count: { select: { timeEntries: true, kmEntries: true } },
        tags: { select: { id: true, name: true } },
      },
    }),
    prisma.customer.findMany({ where: { archivedAt: null }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
    prisma.tag.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }),
  ]);

  return (
    <ProjectsClient
      initialProjects={serialize(projects)}
      customers={serialize(customers)}
      allTags={serialize(allTags)}
      initialNoCustomerOnly={filter === "no-customer"}
    />
  );
}
```

- [ ] **Step 2: Accept the new prop in the client and add filter state**

In `src/components/projects/projects-client.tsx`, extend the `Props` interface (around line 38):

```tsx
interface Props {
  initialProjects: any[];
  customers: any[];
  allTags: { id: string; name: string }[];
  initialNoCustomerOnly?: boolean;
}
```

Update the component signature (around line 43):

```tsx
export function ProjectsClient({ initialProjects, customers, allTags, initialNoCustomerOnly = false }: Props) {
```

Add state next to the existing `showArchived` state (around line 51, after `const [showArchived, setShowArchived] = useState(false);`):

```tsx
  const [noCustomerOnly, setNoCustomerOnly] = useState(initialNoCustomerOnly);
```

- [ ] **Step 3: Add the customerless count derived value**

Immediately after that state line, add:

```tsx
  const customerlessCount = projects.filter((p) => !p.customer && !p.archivedAt).length;
```

- [ ] **Step 4: Add the filter toggle with badge next to "Toon gearchiveerd"**

Find the `Toon gearchiveerd` label block (around line 150). Immediately AFTER its closing `</label>`, add:

```tsx
          <label className="flex items-center gap-2 text-sm text-muted-foreground cursor-pointer mr-1">
            <input type="checkbox" className="h-4 w-4 rounded border-input accent-primary"
              checked={noCustomerOnly}
              onChange={(e) => setNoCustomerOnly(e.target.checked)} />
            Zonder klant
            {customerlessCount > 0 && (
              <Badge variant="secondary" className="ml-1">{customerlessCount}</Badge>
            )}
          </label>
```

(`Badge` is already imported in this file.)

- [ ] **Step 5: Apply the filter to the rendered rows**

Find the row filter (around line 192):

```tsx
              {projects
              .filter((p) => statusFilter === "all" || p.status === statusFilter)
              .map((p) => (
```

Replace with:

```tsx
              {projects
              .filter((p) => statusFilter === "all" || p.status === statusFilter)
              .filter((p) => !noCustomerOnly || !p.customer)
              .map((p) => (
```

- [ ] **Step 6: Typecheck and build**

Run: `npx tsc --noEmit`
Expected: no errors.

Run: `npm run build`
Expected: build succeeds.

- [ ] **Step 7: Manual verification**

As admin:
1. Open `/projects?filter=no-customer` (or click the dashboard banner) — the "Zonder klant" checkbox is pre-checked and the list shows only customerless projects.
2. The checkbox shows a count badge matching the number of customerless projects.
3. Unchecking shows all projects again.

- [ ] **Step 8: Commit**

```bash
git add "src/app/(app)/projects/page.tsx" src/components/projects/projects-client.tsx
git commit -m "feat: projects list 'Zonder klant' filter, badge and dashboard deep link"
```

---

## Task 5: Full verification

- [ ] **Step 1: Run the whole test suite**

Run: `npm test`
Expected: all tests pass.

- [ ] **Step 2: Typecheck and build once more**

Run: `npx tsc --noEmit && npm run build`
Expected: clean.

- [ ] **Step 3: End-to-end manual pass**

1. Non-admin: create a concept project on `/time`, select a different Klant, confirm the concept still appears under "Zonder klant" and hours save against it.
2. Admin: dashboard shows the "N projecten zonder klant" banner; click it → projects list pre-filtered to customerless; attach a customer to one via the edit dialog; banner count drops by one on next dashboard load.

---

## Notes / Out of Scope

- No change to `projectCreateDenialReason`, the Prisma schema, or the concept-creation dialog. Employees still cannot attach customers or set rates.
- Sidebar nav badge deliberately skipped — the dashboard banner + projects badge cover visibility without wiring a count through the layout into the client `Sidebar`. Add later if a persistent nav indicator is wanted.
- Invoicing is unaffected: it filters to ACTIVE projects, so customerless concepts never surface there.
