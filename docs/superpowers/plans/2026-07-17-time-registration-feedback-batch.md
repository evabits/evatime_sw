# Time-registration Feedback Batch Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix three pieces of user (AB) feedback on the "Uren registreren" flow: (1) billable toggle should default to the selected activity's setting, (2) hourly rates must not be reachable by non-admin staff, (3) the entry form should keep the entered date after adding.

**Architecture:** Three independent fixes in one branch. Fix #2 closes a server-side authorization gap on rate-exposing admin pages/API (they were nav-gated only). Fixes #1 and #3 are small client changes in the time-entry component. Only the pure-function role helper is unit-testable with the repo's setup (vitest, colocated `*.test.ts`); UI/page/API changes are verified via typecheck + lint + build + documented manual checks, matching existing repo conventions.

**Tech Stack:** Next.js (App Router, server components), React Hook Form, Prisma, vitest.

**Spec:** `docs/superpowers/specs/2026-07-17-time-registration-feedback-batch-design.md`

**Working directory:** worktree `time-reg-feedback-batch`, branch `worktree-time-reg-feedback-batch` (already synced with `origin/main`).

---

## File Structure

| File | Change |
|------|--------|
| `src/lib/roles.ts` | Add `canViewReports(role)` helper; flip FINANCE `viewReports` config flag to `true` |
| `src/lib/roles.test.ts` | **Create** — unit test for `canViewReports` |
| `src/app/api/reports/route.ts` | 403 when caller can't view reports |
| `src/app/(app)/reports/page.tsx` | Redirect non-admin/finance to `/` |
| `src/components/layout/sidebar.tsx` | Show Reports link to ADMIN + FINANCE |
| `src/app/(app)/projects/page.tsx` | Redirect non-ADMIN to `/` |
| `src/app/(app)/activity-types/page.tsx` | Redirect non-ADMIN to `/` |
| `src/components/time/time-entries-client.tsx` | Derive billable on activity select; remove effect; keep entered date on add-reset |

---

## Task 1: `canViewReports` role helper (TDD)

**Files:**
- Modify: `src/lib/roles.ts` (add helper after `canViewInvoices`, line 79-81; flip FINANCE `viewReports` at line 44)
- Create: `src/lib/roles.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/lib/roles.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { canViewReports } from "./roles";

describe("canViewReports", () => {
  it("allows ADMIN", () => {
    expect(canViewReports("ADMIN")).toBe(true);
  });
  it("allows FINANCE", () => {
    expect(canViewReports("FINANCE")).toBe(true);
  });
  it("denies EMPLOYEE", () => {
    expect(canViewReports("EMPLOYEE")).toBe(false);
  });
  it("denies unknown roles", () => {
    expect(canViewReports("")).toBe(false);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- roles`
Expected: FAIL — `canViewReports is not a function` (or import error).

- [ ] **Step 3: Add the helper**

In `src/lib/roles.ts`, add after the `canViewInvoices` function (currently lines 79-81):

```ts
export function canViewReports(role: string): boolean {
  return role === "ADMIN" || role === "FINANCE";
}
```

- [ ] **Step 4: Flip the FINANCE config flag for docblock consistency**

In `src/lib/roles.ts`, in the `FINANCE.can` block, change line 44 from:

```ts
      viewReports: false,
```

to:

```ts
      viewReports: true,
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `npm test -- roles`
Expected: PASS (4 tests).

- [ ] **Step 6: Commit**

```bash
git add src/lib/roles.ts src/lib/roles.test.ts
git commit -m "feat: add canViewReports role helper (ADMIN+FINANCE)"
```

---

## Task 2: Gate the `/api/reports` endpoint

**Files:**
- Modify: `src/app/api/reports/route.ts` (imports + role check after line 9)

- [ ] **Step 1: Add the import**

In `src/app/api/reports/route.ts`, change the first import line from:

```ts
import { auth } from "@/lib/auth";
```

to:

```ts
import { auth } from "@/lib/auth";
import { canViewReports } from "@/lib/roles";
```

- [ ] **Step 2: Add the role check**

Replace the existing session guard (lines 8-9):

```ts
    const session = await auth();
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
```

with:

```ts
    const session = await auth();
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const role = (session.user as any)?.role ?? "EMPLOYEE";
    if (!canViewReports(role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
```

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 4: Manual verification (documented, run if a dev server is available)**

As an EMPLOYEE session, `GET /api/reports?from=2026-01-01&to=2026-12-31` → HTTP 403.
As ADMIN or FINANCE → HTTP 200 with data.

- [ ] **Step 5: Commit**

```bash
git add src/app/api/reports/route.ts
git commit -m "fix: forbid non-admin/finance access to /api/reports"
```

---

## Task 3: Gate the `/reports` page and show the nav link to Finance

**Files:**
- Modify: `src/app/(app)/reports/page.tsx` (imports + redirect gate)
- Modify: `src/components/layout/sidebar.tsx` (line 76)

- [ ] **Step 1: Add imports to the page**

In `src/app/(app)/reports/page.tsx`, change the import block (lines 1-3) from:

```ts
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { ReportsClient } from "@/components/reports/reports-client";
```

to:

```ts
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { canViewReports } from "@/lib/roles";
import { ReportsClient } from "@/components/reports/reports-client";
```

- [ ] **Step 2: Add the redirect gate**

In the same file, right after `const session = await auth();` (line 6), insert:

```ts
  if (!canViewReports((session?.user as any)?.role ?? "EMPLOYEE")) redirect("/");
```

- [ ] **Step 3: Update the sidebar link**

In `src/components/layout/sidebar.tsx`, change line 76 from:

```ts
      { href: "/reports", label: "Rapporten", icon: BarChart3, roles: ["ADMIN"] },
```

to:

```ts
      { href: "/reports", label: "Rapporten", icon: BarChart3, roles: ["ADMIN", "FINANCE"] },
```

- [ ] **Step 4: Typecheck**

Run: `npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 5: Manual verification (documented)**

As EMPLOYEE, navigating to `/reports` → redirected to `/`; no "Rapporten" link in sidebar.
As FINANCE, "Rapporten" link shows and `/reports` renders.

- [ ] **Step 6: Commit**

```bash
git add "src/app/(app)/reports/page.tsx" src/components/layout/sidebar.tsx
git commit -m "fix: server-gate /reports to admin+finance and show nav link to finance"
```

---

## Task 4: Gate the `/projects` and `/activity-types` pages (ADMIN-only)

**Files:**
- Modify: `src/app/(app)/projects/page.tsx` (imports + redirect gate)
- Modify: `src/app/(app)/activity-types/page.tsx` (imports + redirect gate)

- [ ] **Step 1: Gate the projects page**

In `src/app/(app)/projects/page.tsx`, change the import block (lines 1-3) from:

```ts
import { prisma } from "@/lib/prisma";
import { serialize } from "@/lib/utils";
import { ProjectsClient } from "@/components/projects/projects-client";
```

to:

```ts
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { serialize } from "@/lib/utils";
import { ProjectsClient } from "@/components/projects/projects-client";
```

Then change the function opening from:

```ts
export default async function ProjectsPage() {
  const [projects, customers, allTags] = await Promise.all([
```

to:

```ts
export default async function ProjectsPage() {
  const session = await auth();
  if ((session?.user as any)?.role !== "ADMIN") redirect("/");

  const [projects, customers, allTags] = await Promise.all([
```

- [ ] **Step 2: Gate the activity-types page**

In `src/app/(app)/activity-types/page.tsx`, change the import block (lines 1-3) from:

```ts
import { prisma } from "@/lib/prisma";
import { serialize } from "@/lib/utils";
import { ActivityTypesClient } from "@/components/activity-types/activity-types-client";
```

to:

```ts
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { serialize } from "@/lib/utils";
import { ActivityTypesClient } from "@/components/activity-types/activity-types-client";
```

Then change the function opening from:

```ts
export default async function ActivityTypesPage() {
  const [types, projects] = await Promise.all([
```

to:

```ts
export default async function ActivityTypesPage() {
  const session = await auth();
  if ((session?.user as any)?.role !== "ADMIN") redirect("/");

  const [types, projects] = await Promise.all([
```

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 4: Manual verification (documented)**

As EMPLOYEE, navigating directly to `/projects` or `/activity-types` → redirected to `/`.
As ADMIN, both pages render as before.

- [ ] **Step 5: Commit**

```bash
git add "src/app/(app)/projects/page.tsx" "src/app/(app)/activity-types/page.tsx"
git commit -m "fix: server-gate /projects and /activity-types to admin only"
```

---

## Task 5: Fix #1 — billable defaults to the selected activity

**Files:**
- Modify: `src/components/time/time-entries-client.tsx` (activity `<Select>` at line 406-409; remove effect at lines 159-164)

- [ ] **Step 1: Derive billable when the activity is selected**

In `src/components/time/time-entries-client.tsx`, change the activity `<Select>` (lines 406-409) from:

```tsx
              <Select
                onValueChange={(v) => form.setValue("activityTypeId", v)}
                value={form.watch("activityTypeId") ?? ""}
              >
```

to:

```tsx
              <Select
                onValueChange={(v) => {
                  form.setValue("activityTypeId", v);
                  const act = activityTypes.find((a) => a.id === v);
                  form.setValue("billable", act?.billable ?? true);
                }}
                value={form.watch("activityTypeId") ?? ""}
              >
```

- [ ] **Step 2: Remove the now-redundant effect**

In the same file, delete the entire effect at lines 159-164:

```tsx
  useEffect(() => {
    if (!isAdmin) {
      const act = activityTypes.find((a) => a.id === activityTypeId);
      form.setValue("billable", act?.billable ?? true);
    }
  }, [activityTypeId, isAdmin]); // eslint-disable-line react-hooks/exhaustive-deps
```

- [ ] **Step 3: Typecheck + lint**

Run: `npx tsc --noEmit && npm run lint`
Expected: no new errors. (If `isAdmin` or `activityTypeId` become unused after the deletion, remove the now-dead references only if lint flags them — `activityTypeId` is still used by `getEffectiveRate`/`effectiveRate`, and `isAdmin` is used elsewhere, so both should remain.)

- [ ] **Step 4: Manual verification (documented)**

As ADMIN: select a non-billable activity (e.g. *EVAbits-Intern-algemeen*) → "Factureerbaar" shows **Nee**; select a billable activity → **Ja**; manually overriding the dropdown still works. Open an existing entry to **edit** → its saved billable value is preserved (not overwritten).

- [ ] **Step 5: Commit**

```bash
git add src/components/time/time-entries-client.tsx
git commit -m "fix: default billable toggle to selected activity's setting for admins"
```

---

## Task 6: Fix #3 — keep the entered date after adding

**Files:**
- Modify: `src/components/time/time-entries-client.tsx` (add-branch reset at line 317)

- [ ] **Step 1: Preserve the entered date on the add reset**

In `src/components/time/time-entries-client.tsx`, inside `onSubmit`, the **add** branch (the `else` block, line 317) currently reads:

```tsx
          form.reset({ date: selectedDay ?? today, billable: true });
```

Change **only that line 317 occurrence** (the one inside the `else`/POST-success branch, not the edit branch at line 303 nor the cancel handler at line 468) to:

```tsx
          form.reset({ date: data.date, billable: true });
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 3: Manual verification (documented)**

In list view, add an entry dated 2026-07-10 → after adding, all fields clear (project, activity, hours, description) and the date field still shows **2026-07-10**, so a second entry for the same day can be logged immediately.

- [ ] **Step 4: Commit**

```bash
git add src/components/time/time-entries-client.tsx
git commit -m "fix: keep entered date after adding a time entry"
```

---

## Task 7: Full verification

- [ ] **Step 1: Run the test suite**

Run: `npm test`
Expected: PASS (including the new `roles.test.ts`).

- [ ] **Step 2: Lint**

Run: `npm run lint`
Expected: no new errors.

- [ ] **Step 3: Build**

Run: `npm run build`
Expected: build succeeds (prisma generate + next build).

- [ ] **Step 4: Final manual smoke (documented)**

Walk the three fixes once as ADMIN and once as EMPLOYEE to confirm the spec's Testing section:
- #1 billable defaults per activity (admin), edit preserves saved value.
- #2 EMPLOYEE cannot reach `/reports`, `/projects`, `/activity-types` or `GET /api/reports`; FINANCE can see reports.
- #3 date persists after adding a list-view entry.

---

## Self-Review Notes

- **Spec coverage:** Fix #1 → Task 5; Fix #2 → Tasks 1-4 (roles helper, API, reports page + sidebar, projects/activity-types pages); Fix #3 → Task 6. All spec files are covered.
- **Type consistency:** `canViewReports` defined in Task 1 is the exact symbol imported in Tasks 2 and 3. Role string extraction uses the repo's existing `(session.user as any)?.role ?? "EMPLOYEE"` idiom throughout.
- **Out of scope (per spec):** `/api/time` rate stripping (defense-in-depth) and gating of other unrelated admin pages (customers/users/payroll/settings).
