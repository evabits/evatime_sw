# User Bug Batch Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix five independent admin-reported issues: broken target-hours validation, non-persistent time-page filters, silent data changes when editing activities, admin-defined commute km templates, and hard-delete failures via a soft-archive.

**Architecture:** Extract testable logic into pure functions under `src/lib` (the repo's only test pattern — vitest, no DB/route/component harness) and TDD those. Route and UI wiring is applied directly with manual verification steps. Each task group (A–E) is independent and independently committable.

**Tech Stack:** Next.js App Router, Prisma + Postgres (Neon, `prisma db push` — no migrations), Zod, react-hook-form, next-auth v5, vitest.

**Execution order (quick wins first):** A (#5) → B (#2) → C (#3) → D (#4) → E (#1). E is the largest.

---

## File Structure

New files:
- `src/lib/user-schema.ts` + `.test.ts` — shared `weeklyHoursField` (Group A)
- `src/lib/archive.ts` + `.test.ts` — `archivedWhere()` helper (Group E)
- `src/app/api/activity-types/[id]/impact/route.ts` — booked-entry counts (Group C)
- `src/lib/activity-impact.ts` + `.test.ts` — `removedProjectIds()` diff (Group C)

Modified (by group):
- **A:** `src/app/api/users/route.ts`, `src/app/api/users/[id]/route.ts`, `src/components/users/users-client.tsx`
- **B:** `src/components/time/time-entries-client.tsx`
- **C:** `src/app/api/activity-types/[id]/route.ts`, activity-types list client
- **D:** `prisma/schema.prisma`, `src/lib/km-template.ts` (+`.test.ts`), `src/app/api/km/templates/route.ts`, `src/app/api/km/templates/[id]/route.ts`, `src/app/(app)/personeel/[id]/...`, `src/components/.../km-templates-client.tsx`
- **E:** `prisma/schema.prisma`, all four `route.ts` list + `[id]` pairs (customers/projects/activity-types/users), `src/lib/auth.ts`, the read-site sweep (see Task E5), four list clients

---

# Group A — Target-hours validation (#5)

**Root cause:** `weeklyHours: z.coerce.number().positive()` coerces `""` → `0`, which fails `.positive()`. Present in both API routes AND the client form (`users-client.tsx:22,30`), so the client blocks before the request is sent.

### Task A1: Shared `weeklyHoursField` schema (TDD)

**Files:**
- Create: `src/lib/user-schema.ts`
- Test: `src/lib/user-schema.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/user-schema.test.ts
import { describe, it, expect } from "vitest";
import { weeklyHoursField } from "./user-schema";

describe("weeklyHoursField", () => {
  it("empty string => undefined (no target)", () => {
    expect(weeklyHoursField.parse("")).toBeUndefined();
  });
  it("null => undefined", () => {
    expect(weeklyHoursField.parse(null)).toBeUndefined();
  });
  it("undefined => undefined", () => {
    expect(weeklyHoursField.parse(undefined)).toBeUndefined();
  });
  it("'40' => 40", () => {
    expect(weeklyHoursField.parse("40")).toBe(40);
  });
  it("number 40 => 40", () => {
    expect(weeklyHoursField.parse(40)).toBe(40);
  });
  it("'0' rejected", () => {
    expect(() => weeklyHoursField.parse("0")).toThrow();
  });
  it("negative rejected", () => {
    expect(() => weeklyHoursField.parse("-5")).toThrow();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/user-schema.test.ts`
Expected: FAIL — cannot find module `./user-schema`.

- [ ] **Step 3: Write the implementation**

```ts
// src/lib/user-schema.ts
import { z } from "zod";

// Empty input ("" / null / undefined) means "no target" -> undefined.
// Any provided value must be > 0. Callers store `weeklyHours ?? null`.
export const weeklyHoursField = z.preprocess(
  (v) => (v === "" || v == null ? undefined : v),
  z.coerce.number().positive("Moet groter zijn dan 0").optional(),
);
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/user-schema.test.ts`
Expected: PASS (7 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/user-schema.ts src/lib/user-schema.test.ts
git commit -m "feat: shared weeklyHoursField that treats empty as no target"
```

### Task A2: Use it in both API routes

**Files:**
- Modify: `src/app/api/users/route.ts:13`
- Modify: `src/app/api/users/[id]/route.ts:13`

- [ ] **Step 1: Edit `users/route.ts`** — add the import and replace the field.

Add after the existing imports:
```ts
import { weeklyHoursField } from "@/lib/user-schema";
```
Replace line 13 (`weeklyHours: z.coerce.number().positive().optional().nullable(),`) inside `createSchema` with:
```ts
  weeklyHours: weeklyHoursField,
```

- [ ] **Step 2: Edit `users/[id]/route.ts`** — same change in `updateSchema`.

Add the import:
```ts
import { weeklyHoursField } from "@/lib/user-schema";
```
Replace line 13 with:
```ts
  weeklyHours: weeklyHoursField,
```
(The `data.weeklyHours ?? null` usage at `:48` already handles `undefined` → `null`.)

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add src/app/api/users/route.ts src/app/api/users/[id]/route.ts
git commit -m "fix: user routes accept empty weeklyHours as no target"
```

### Task A3: Use it in the client form (both schemas)

**Files:**
- Modify: `src/components/users/users-client.tsx:22,30`

- [ ] **Step 1: Add the import** near the top (with the other imports):

```ts
import { weeklyHoursField } from "@/lib/user-schema";
```

- [ ] **Step 2: Replace both `weeklyHours` lines** (line 22 in `createSchema`, line 30 in `editSchema`). Each currently reads:
```ts
  weeklyHours: z.coerce.number().positive("Moet groter zijn dan 0").optional().nullable(),
```
Replace each with:
```ts
  weeklyHours: weeklyHoursField,
```

- [ ] **Step 3: Typecheck + lint**

Run: `npx tsc --noEmit && npm run lint`
Expected: no errors. (The inputs at `:236`/`:282` keep `min="1"`; harmless — HTML `min` doesn't reject an empty field.)

- [ ] **Step 4: Manual verification**

Run `npm run dev`. As ADMIN, open Users → "Nieuwe gebruiker", fill name/email/password, leave **Uren per week empty**, submit.
Expected: user is created (no "Moet groter zijn dan 0" error), `weeklyHours` shows "—" in the list. Editing an existing user and clearing the field also saves.

- [ ] **Step 5: Commit**

```bash
git add src/components/users/users-client.tsx
git commit -m "fix: user form allows empty weeklyHours (no target)"
```

---

# Group B — Time page remembers filters (#2)

**Root cause:** `time-entries-client.tsx:73` hard-defaults `filterUser` to `"all"` on every load; nothing is persisted.

### Task B1: Persist `filterUser` + `filterProject` in localStorage

**Files:**
- Modify: `src/components/time/time-entries-client.tsx`

- [ ] **Step 1: Add hydrate + persist effects.** After the filter `useState` declarations (around `:73`, where `filterUser`/`filterProject` are defined), add:

```ts
const filtersKey = `time-filters:${userId}`;

// Hydrate saved filters once on mount (client-only; avoids SSR mismatch).
useEffect(() => {
  try {
    const raw = localStorage.getItem(filtersKey);
    if (!raw) return;
    const saved = JSON.parse(raw) as { filterUser?: string; filterProject?: string };
    if (saved.filterUser) setFilterUser(saved.filterUser);
    if (saved.filterProject) setFilterProject(saved.filterProject);
  } catch {
    /* ignore malformed storage */
  }
  // eslint-disable-next-line react-hooks/exhaustive-deps
}, []);

// Persist on change.
useEffect(() => {
  try {
    localStorage.setItem(filtersKey, JSON.stringify({ filterUser, filterProject }));
  } catch {
    /* ignore quota/private-mode errors */
  }
}, [filtersKey, filterUser, filterProject]);
```

Note: `userId` is already a prop (`:55`). `useEffect` is already imported (`:2`).

- [ ] **Step 2: Typecheck + lint**

Run: `npx tsc --noEmit && npm run lint`
Expected: no errors.

- [ ] **Step 3: Manual verification**

`npm run dev`, log in as ADMIN, go to Uren (time page). Change "Alle medewerkers" to a specific person and pick a project. Reload the page.
Expected: the same person + project are still selected after reload. Open in a different browser/user → their own saved selection (or defaults) apply.

- [ ] **Step 4: Commit**

```bash
git add src/components/time/time-entries-client.tsx
git commit -m "feat: remember time-page employee/project filter per user"
```

---

# Group C — Warn when editing/deleting an activity with booked hours (#3)

**Behavior (per decision):** warn before any change to an activity type that has entries booked on it. Two triggers: delete, and editing that removes a project-link with bookings.

> Note: if Group E ships first, activity-type DELETE becomes archive; this task's delete-confirm then guards the archive action instead. Logic is unchanged.

### Task C1: `removedProjectIds` diff helper (TDD)

**Files:**
- Create: `src/lib/activity-impact.ts`
- Test: `src/lib/activity-impact.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/activity-impact.test.ts
import { describe, it, expect } from "vitest";
import { removedProjectIds } from "./activity-impact";

describe("removedProjectIds", () => {
  it("returns links present now but not in the new selection", () => {
    expect(removedProjectIds(["a", "b", "c"], ["a", "c"])).toEqual(["b"]);
  });
  it("empty when nothing removed", () => {
    expect(removedProjectIds(["a"], ["a", "b"])).toEqual([]);
  });
  it("all removed when new selection empty", () => {
    expect(removedProjectIds(["a", "b"], [])).toEqual(["a", "b"]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/activity-impact.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

```ts
// src/lib/activity-impact.ts
// Project links attached now but absent from the new selection = being removed.
export function removedProjectIds(current: string[], next: string[]): string[] {
  const keep = new Set(next);
  return current.filter((id) => !keep.has(id));
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/activity-impact.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/activity-impact.ts src/lib/activity-impact.test.ts
git commit -m "feat: removedProjectIds diff for activity-link changes"
```

### Task C2: Impact endpoint

**Files:**
- Create: `src/app/api/activity-types/[id]/impact/route.ts`

- [ ] **Step 1: Write the route**

```ts
// src/app/api/activity-types/[id]/impact/route.ts
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { handleError } from "@/lib/api";
import { isAdmin } from "@/lib/roles";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await auth();
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const role = (session.user as any)?.role ?? "EMPLOYEE";
    if (!isAdmin(role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const { id } = await params;
    const [timeAgg, kmCount, timeProjects, kmProjects] = await Promise.all([
      prisma.timeEntry.aggregate({ where: { activityTypeId: id }, _count: true, _sum: { hours: true } }),
      prisma.kmEntry.count({ where: { activityTypeId: id } }),
      prisma.timeEntry.findMany({ where: { activityTypeId: id }, distinct: ["projectId"], select: { projectId: true } }),
      prisma.kmEntry.findMany({ where: { activityTypeId: id }, distinct: ["projectId"], select: { projectId: true } }),
    ]);

    const projectIds = Array.from(
      new Set([...timeProjects, ...kmProjects].map((p) => p.projectId)),
    );

    return NextResponse.json({
      timeEntries: timeAgg._count,
      kmEntries: kmCount,
      hours: Number(timeAgg._sum.hours ?? 0),
      projectIds,
    });
  } catch (e) { return handleError(e); }
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Manual verification**

With the dev server running and an activity type that has time entries, request
`/api/activity-types/<id>/impact` (browser while logged in as ADMIN).
Expected JSON: `{ timeEntries, kmEntries, hours, projectIds: [...] }` with non-zero counts.

- [ ] **Step 4: Commit**

```bash
git add "src/app/api/activity-types/[id]/impact/route.ts"
git commit -m "feat: activity-type impact endpoint (booked entry counts)"
```

### Task C3: Confirmed-delete guard on the API

**Files:**
- Modify: `src/app/api/activity-types/[id]/route.ts` (DELETE handler, `:43-53`)

- [ ] **Step 1: Guard the delete.** Replace the body of the DELETE handler (after the admin check + `const { id } = await params;`) with:

```ts
    const url = new URL(_req.url);
    const confirmed = url.searchParams.get("confirm") === "1";
    if (!confirmed) {
      const booked =
        (await prisma.timeEntry.count({ where: { activityTypeId: id } })) +
        (await prisma.kmEntry.count({ where: { activityTypeId: id } }));
      if (booked > 0) {
        return NextResponse.json(
          { error: "IN_USE", booked },
          { status: 409 },
        );
      }
    }
    await prisma.activityType.delete({ where: { id } });
    return NextResponse.json({ success: true });
```

Note: the DELETE signature's first param is currently `_req` — it is now read, so rename `_req` → `req` in the `DELETE(req: Request, ...)` signature and the `new URL(req.url)` call.

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add "src/app/api/activity-types/[id]/route.ts"
git commit -m "feat: block activity-type delete when entries are booked (unless confirmed)"
```

### Task C4: Confirm dialogs in the activity-types UI

**Files:**
- Modify: the activity-types list client (find it: `grep -rl "activity-types" src/components src/app/\(app\)/activity-types`)

- [ ] **Step 1: Read the component** to learn its delete/edit handlers and dialog primitives (it uses the shared `@/components/ui/dialog` like `users-client.tsx`).

- [ ] **Step 2: Delete flow.** Before calling `DELETE /api/activity-types/[id]`, fetch impact and confirm:

```ts
async function requestDelete(id: string) {
  const res = await fetch(`/api/activity-types/${id}/impact`);
  const impact = await res.json(); // { timeEntries, kmEntries, hours, projectIds }
  const booked = impact.timeEntries + impact.kmEntries;
  if (booked > 0) {
    const ok = window.confirm(
      `${booked} registratie(s) (${impact.hours} uur) gebruiken deze activiteit. ` +
      `Verwijderen ontkoppelt ze. Doorgaan?`,
    );
    if (!ok) return;
  }
  await fetch(`/api/activity-types/${id}?confirm=1`, { method: "DELETE" });
  // ...existing local-state refresh
}
```
(If the component already uses a styled `Dialog` for confirmations, use that instead of `window.confirm` to match; the branching logic is identical.)

- [ ] **Step 3: Edit flow.** When saving an edit, compare the activity's current project-links against the newly selected `projectIds` using `removedProjectIds`, and warn if any removed project has bookings:

```ts
import { removedProjectIds } from "@/lib/activity-impact";
// currentProjectIds = the activity's existing links (from the loaded row)
const removed = removedProjectIds(currentProjectIds, selectedProjectIds);
if (removed.length > 0) {
  const impact = await (await fetch(`/api/activity-types/${id}/impact`)).json();
  const affected = removed.filter((pid: string) => impact.projectIds.includes(pid));
  if (affected.length > 0) {
    const ok = window.confirm(
      `Er zijn uren geboekt op ${affected.length} project(en) die je loskoppelt van deze activiteit. Toch opslaan?`,
    );
    if (!ok) return;
  }
}
// ...existing PUT
```

- [ ] **Step 4: Typecheck + lint**

Run: `npx tsc --noEmit && npm run lint`
Expected: no errors.

- [ ] **Step 5: Manual verification**

Create an activity with a project link, book a time entry on it. Try to delete the activity → warning appears; cancel keeps it; confirm deletes. Edit the activity and unlink that project → warning appears before save.

- [ ] **Step 6: Commit**

```bash
git add src/components src/app/\(app\)/activity-types
git commit -m "feat: warn before delete/unlink of activity with booked hours"
```

---

# Group D — Admin-defined WoonWerk (commute) km template (#4)

### Task D1: Schema field

**Files:**
- Modify: `prisma/schema.prisma` (model `KmTemplate`, `:175-190`)

- [ ] **Step 1: Add the field.** Inside `model KmTemplate`, after `description String?`, add:

```prisma
  managedByAdmin Boolean       @default(false)
```

- [ ] **Step 2: Push + regenerate**

Run: `npm run db:push`
Expected: "Your database is now in sync" and Prisma Client regenerated. (Additive, defaulted column — no data backfill.)

- [ ] **Step 3: Commit**

```bash
git add prisma/schema.prisma
git commit -m "feat: KmTemplate.managedByAdmin flag"
```

### Task D2: `canManageTemplate` + extended schema (TDD)

**Files:**
- Modify: `src/lib/km-template.ts`
- Modify/Create: `src/lib/km-template.test.ts`

- [ ] **Step 1: Add failing tests** to `src/lib/km-template.test.ts`:

```ts
import { canManageTemplate } from "./km-template";

describe("canManageTemplate", () => {
  const base = { currentUserId: "u1", ownerId: "u1" };
  it("owner may manage own non-managed template", () => {
    expect(canManageTemplate({ ...base, role: "EMPLOYEE", managedByAdmin: false })).toBe(true);
  });
  it("non-owner employee may not manage another's template", () => {
    expect(canManageTemplate({ role: "EMPLOYEE", currentUserId: "u2", ownerId: "u1", managedByAdmin: false })).toBe(false);
  });
  it("owner employee may NOT manage a managed template", () => {
    expect(canManageTemplate({ ...base, role: "EMPLOYEE", managedByAdmin: true })).toBe(false);
  });
  it("admin may manage a managed template for anyone", () => {
    expect(canManageTemplate({ role: "ADMIN", currentUserId: "admin", ownerId: "u1", managedByAdmin: true })).toBe(true);
  });
  it("admin may manage any non-managed template", () => {
    expect(canManageTemplate({ role: "ADMIN", currentUserId: "admin", ownerId: "u1", managedByAdmin: false })).toBe(true);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/lib/km-template.test.ts`
Expected: FAIL — `canManageTemplate` not exported.

- [ ] **Step 3: Implement.** Append to `src/lib/km-template.ts`:

```ts
export function canManageTemplate(opts: {
  role: string;
  currentUserId: string;
  ownerId: string;
  managedByAdmin: boolean;
}): boolean {
  const admin = opts.role === "ADMIN";
  if (opts.managedByAdmin) return admin; // managed rows: admin only
  return admin || opts.ownerId === opts.currentUserId; // self rows: owner or admin
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run src/lib/km-template.test.ts`
Expected: PASS (existing + 5 new).

- [ ] **Step 5: Commit**

```bash
git add src/lib/km-template.ts src/lib/km-template.test.ts
git commit -m "feat: canManageTemplate authorization helper"
```

### Task D3: POST accepts admin-created managed templates

**Files:**
- Modify: `src/app/api/km/templates/route.ts` (POST, `:28-44`)

- [ ] **Step 1: Replace the POST handler body** with a version that lets admins target another user:

```ts
export async function POST(req: Request) {
  try {
    const session = await auth();
    const currentUserId = session?.user?.id;
    if (!currentUserId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const role = (session!.user as any)?.role ?? "EMPLOYEE";
    const admin = role === "ADMIN";

    const body = await req.json();
    const data = schema.parse(body);
    // Admins may create a managed template for a target user; everyone else creates their own.
    const targetUserId = admin && typeof body.userId === "string" ? body.userId : currentUserId;
    const managedByAdmin = admin && body.managedByAdmin === true;

    const template = await prisma.kmTemplate.create({
      data: { ...data, userId: targetUserId, managedByAdmin },
      include,
    });
    return NextResponse.json(serialize(template), { status: 201 });
  } catch (e: any) {
    if (e?.code === "P2002") return NextResponse.json({ error: "Naam bestaat al" }, { status: 409 });
    return handleError(e);
  }
}
```

Note: `schema` is `kmTemplateSchema` (does not include `userId`/`managedByAdmin`), so those are read off the raw `body` and gated on `admin`. This keeps non-admins unable to forge either field.

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/app/api/km/templates/route.ts
git commit -m "feat: admins can create managed km templates for a user"
```

### Task D4: Rewrite the `[id]` route with managed-vs-owner auth

**Files:**
- Modify (rewrite): `src/app/api/km/templates/[id]/route.ts`

The current route is owner-scoped (`where: { id, userId }`) and PUT only renames — an admin editing another user's template silently 404s, and managed fields can't be set. Replace the whole file:

- [ ] **Step 1: Write the new file**

```ts
// src/app/api/km/templates/[id]/route.ts
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { handleError } from "@/lib/api";
import { serialize } from "@/lib/utils";
import { kmTemplateSchema as schema, canManageTemplate } from "@/lib/km-template";

const include = {
  project: { select: { id: true, name: true, customer: { select: { id: true, name: true } } } },
  activityType: { select: { id: true, name: true } },
} as const;

async function loadAuthorized(id: string) {
  const session = await auth();
  const currentUserId = session?.user?.id;
  if (!currentUserId) return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  const role = (session!.user as any)?.role ?? "EMPLOYEE";

  const template = await prisma.kmTemplate.findUnique({ where: { id } });
  if (!template) return { error: NextResponse.json({ error: "Niet gevonden" }, { status: 404 }) };

  if (!canManageTemplate({ role, currentUserId, ownerId: template.userId, managedByAdmin: template.managedByAdmin })) {
    return { error: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
  }
  return { template };
}

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const gate = await loadAuthorized(id);
    if (gate.error) return gate.error;

    const data = schema.parse(await req.json());
    await prisma.kmTemplate.update({ where: { id }, data });
    const updated = await prisma.kmTemplate.findUnique({ where: { id }, include });
    return NextResponse.json(serialize(updated));
  } catch (e: any) {
    if (e?.code === "P2002") return NextResponse.json({ error: "Naam bestaat al" }, { status: 409 });
    return handleError(e);
  }
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const gate = await loadAuthorized(id);
    if (gate.error) return gate.error;

    await prisma.kmTemplate.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (e) { return handleError(e); }
}
```

Note: PUT now accepts the full template fields (`kmTemplateSchema`: name/projectId/activityTypeId/km/description), not just `name`. It does not change `userId` or `managedByAdmin` (ownership/kind are fixed at creation).

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Manual verification**

As an employee, editing your own template still works; editing a managed (locked) one returns 403. As admin, editing another user's managed template works.

- [ ] **Step 4: Commit**

```bash
git add "src/app/api/km/templates/[id]/route.ts"
git commit -m "fix: km template [id] route enforces managed-vs-owner auth, full-field edit"
```

### Task D5: Admin UI on employee detail + locked state in template list

**Files:**
- Modify: `src/app/(app)/personeel/[id]/...` (employee detail page — `grep -rl "personeel" src/app/\(app\)/personeel/\[id\]`)
- Modify: km templates list client (`grep -rl "km/templates" src/components src/app/\(app\)/km`)

- [ ] **Step 1: Read both files** to learn their data-loading and form patterns.

- [ ] **Step 2: Employee detail — "Woon-werk sjabloon" block.** Add an admin-only section that POSTs to `/api/km/templates` with `{ name, projectId, activityTypeId?, km, description?, userId: <employeeId>, managedByAdmin: true }`, and lists existing managed templates for this user (fetch `/api/km/templates` returns the current user's own; for the employee view, list via a filtered fetch or include on the personeel detail server load — reuse the page's existing Prisma query by adding `kmTemplates: { where: { managedByAdmin: true } }` to the user `include`). Provide edit (PUT `/api/km/templates/[id]`) and delete.

- [ ] **Step 3: Template list client — locked rows.** For rows where `template.managedByAdmin` is true, render read-only: hide edit/delete controls, show a lock icon + label ("Beheerd door admin"). The apply-to-km-entry action stays enabled. The GET already returns managed templates because their `userId` equals the employee's id.

- [ ] **Step 4: Typecheck + lint**

Run: `npx tsc --noEmit && npm run lint`
Expected: no errors.

- [ ] **Step 5: Manual verification**

As admin, open an employee's detail page, create a WoonWerk template (pick project + km). Log in as that employee → the template appears in their km templates, locked (no edit/delete), and can be applied to a km entry. The employee can still add their own separate template.

- [ ] **Step 6: Commit**

```bash
git add src/app/\(app\)/personeel src/components src/app/\(app\)/km
git commit -m "feat: admin-managed WoonWerk km templates on employee detail"
```

---

# Group E — Soft-archive (customers, projects, activity types, users) (#1)

### Task E1: Schema fields

**Files:**
- Modify: `prisma/schema.prisma` (models `Customer`, `Project`, `ActivityType`, `User`)

- [ ] **Step 1: Add `archivedAt DateTime?`** to each of the four models. Place it near `updatedAt` in each:

```prisma
  archivedAt DateTime?
```

Models and current line anchors: `Customer` (`:47`), `Project` (`:65`), `ActivityType` (`:99`), `User` (`:10`).

- [ ] **Step 2: Push + regenerate**

Run: `npm run db:push`
Expected: "in sync"; nullable column, no backfill.

- [ ] **Step 3: Commit**

```bash
git add prisma/schema.prisma
git commit -m "feat: archivedAt on Customer/Project/ActivityType/User"
```

### Task E2: `archivedWhere` helper (TDD)

**Files:**
- Create: `src/lib/archive.ts`
- Test: `src/lib/archive.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/archive.test.ts
import { describe, it, expect } from "vitest";
import { archivedWhere } from "./archive";

describe("archivedWhere", () => {
  it("excludes archived by default", () => {
    expect(archivedWhere(false)).toEqual({ archivedAt: null });
  });
  it("includes archived when asked", () => {
    expect(archivedWhere(true)).toEqual({});
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/lib/archive.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

```ts
// src/lib/archive.ts
// Prisma `where` fragment: hide archived rows unless includeArchived is set.
export function archivedWhere(includeArchived: boolean): { archivedAt?: null } {
  return includeArchived ? {} : { archivedAt: null };
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run src/lib/archive.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/archive.ts src/lib/archive.test.ts
git commit -m "feat: archivedWhere prisma filter helper"
```

### Task E3: DELETE → archive + PATCH restore (all four `[id]` routes)

**Files:**
- Modify: `src/app/api/customers/[id]/route.ts`, `src/app/api/projects/[id]/route.ts`, `src/app/api/activity-types/[id]/route.ts`, `src/app/api/users/[id]/route.ts`

Apply the same transformation to each. Shown for **customers**; repeat identically for the others (same field, same handler shape).

- [ ] **Step 1: customers — replace DELETE body** (keep the auth/`params` lines) so it archives:

```ts
    await prisma.customer.update({ where: { id }, data: { archivedAt: new Date() } });
    return NextResponse.json({ success: true });
```

- [ ] **Step 2: customers — add a PATCH restore handler:**

```ts
export async function PATCH(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await auth();
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const { id } = await params;
    await prisma.customer.update({ where: { id }, data: { archivedAt: null } });
    return NextResponse.json({ success: true });
  } catch (e) { return handleError(e); }
}
```

- [ ] **Step 3: projects** — same two changes with `prisma.project`. (Keep the existing auth check.)

- [ ] **Step 4: activity-types** — same, with `prisma.activityType`, preserving the admin-role check already in the handler. **Combine with Group C's confirm guard:** archive only after the `confirm` check (if C already landed, keep its 409-on-`booked` block and swap the final `prisma.activityType.delete` for the archive update). Add the PATCH restore with the same admin check.

- [ ] **Step 5: users** — same, with `prisma.user`, preserving the "cannot delete own account" guard (`:68-70`) — it must now block archiving self. Add PATCH restore (ADMIN only, matching the DELETE role check).

- [ ] **Step 6: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add "src/app/api/customers/[id]/route.ts" "src/app/api/projects/[id]/route.ts" "src/app/api/activity-types/[id]/route.ts" "src/app/api/users/[id]/route.ts"
git commit -m "feat: DELETE archives (archivedAt) and PATCH restores across four entities"
```

### Task E4: List GETs exclude archived (with `?includeArchived`)

**Files:**
- Modify: `src/app/api/customers/route.ts` (`:19`), `src/app/api/projects/route.ts`, `src/app/api/activity-types/route.ts` (`:16`), `src/app/api/users/route.ts` (`:28`)

Apply to each list GET. Shown for **customers**:

- [ ] **Step 1: customers GET** — accept the query flag and filter. Change the signature to read the request and add `where`:

```ts
export async function GET(req: Request) {
  try {
    const session = await auth();
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const includeArchived = new URL(req.url).searchParams.get("includeArchived") === "1";

    const customers = await prisma.customer.findMany({
      where: archivedWhere(includeArchived),
      orderBy: { name: "asc" },
      include: { _count: { select: { projects: true } } },
    });
    return NextResponse.json(customers);
  } catch (e) {
    return handleError(e);
  }
}
```
Add `import { archivedWhere } from "@/lib/archive";` at the top.

- [ ] **Step 2: projects GET** — same pattern (`where: archivedWhere(includeArchived)` merged with any existing `where`). Add the import.

- [ ] **Step 3: activity-types GET** — same. Add the import.

- [ ] **Step 4: users GET** — same. **Also add `archivedAt: true` to `userSelect`** (`:16-19`) so the client can render archived state, and to `serializeUser` output (pass through as-is). The GET currently takes no args — change to `GET(req: Request)`.

- [ ] **Step 5: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 6: Manual verification**

Archive a customer via the UI (next task) or `curl -X DELETE`. `GET /api/customers` omits it; `GET /api/customers?includeArchived=1` includes it with a non-null `archivedAt`.

- [ ] **Step 7: Commit**

```bash
git add src/app/api/customers/route.ts src/app/api/projects/route.ts src/app/api/activity-types/route.ts src/app/api/users/route.ts
git commit -m "feat: list endpoints hide archived rows unless includeArchived=1"
```

### Task E5: Read-site sweep — pickers, cron, payroll, reports

**Files (verify each with the exact query):**
- `src/app/(app)/time/page.tsx` — employee filter user list
- `src/app/(app)/invoices/new/...`, `src/app/(app)/quotes/new/...` — customer/project pickers
- `src/app/(app)/expenses/...`, `src/app/(app)/km/...` — project/activity pickers
- `src/app/(app)/personeel/page.tsx`, `src/app/(app)/reports/...`, `src/app/(app)/page.tsx` (dashboard)
- `src/app/api/hours-overview/route.ts`, `src/app/api/payroll/route.ts`
- Cron: `src/app/api/cron/hours-reminder/route.ts`, `src/app/api/cron/review-reminder/route.ts`, `src/app/api/cron/contract-expiry/route.ts`

- [ ] **Step 1: Find every affected query**

Run:
```bash
grep -rn "prisma.customer.findMany\|prisma.project.findMany\|prisma.activityType.findMany\|prisma.user.findMany" src/app
```

- [ ] **Step 2: For each hit, add the archived filter** to its `where`:
- User-facing pickers/lists (dropdowns of customers/projects/activities/employees): add `archivedAt: null` so archived items can't be picked or shown.
- **Cron + payroll + hours-overview user queries:** add `archivedAt: null` so archived staff are not emailed, reminded, or paid.
- Reports/dashboard: add `archivedAt: null` unless the report is explicitly historical (leave invoice/entry history untouched — those reference archived rows by FK and must keep resolving; only filter the *top-level list* of customers/projects/users, never the joined historical rows).

Example (a picker query):
```ts
const projects = await prisma.project.findMany({
  where: { archivedAt: null },
  orderBy: { name: "asc" },
});
```

- [ ] **Step 3: Typecheck + lint**

Run: `npx tsc --noEmit && npm run lint`
Expected: no errors.

- [ ] **Step 4: Manual verification**

Archive a project. Confirm it no longer appears in the time-entry project dropdown, invoice/quote/expense/km project pickers, or reports lists — but existing invoices/time entries that reference it still load. Archive a user; confirm they drop out of the employee filter and are skipped by the hours-reminder cron (inspect the query result / logs).

- [ ] **Step 5: Commit**

```bash
git add src/app
git commit -m "fix: exclude archived rows from pickers, cron, payroll, reports"
```

### Task E6: Block archived users at login

**Files:**
- Modify: `src/lib/auth.ts` (`signIn` callback, `:38-40`)

- [ ] **Step 1: Extend the `signIn` callback** to reject archived users (single chokepoint — runs for both Credentials and Google):

```ts
async signIn({ user }) {
  if (!user.email?.endsWith("@evabits.com")) return false;
  const dbUser = await prisma.user.findUnique({
    where: { email: user.email },
    select: { archivedAt: true },
  });
  if (dbUser?.archivedAt) return false; // archived users cannot sign in
  return true;
},
```

(A brand-new Google user has no row yet → `dbUser` is null → allowed, then created by the existing `jwt` upsert. Existing behavior preserved.)

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Manual verification**

Archive a non-admin user, then try to log in as them (credentials). Expected: login is rejected.

- [ ] **Step 4: Commit**

```bash
git add src/lib/auth.ts
git commit -m "fix: block archived users from signing in"
```

### Task E7: Archive/restore UI on the four list pages

**Files:**
- The four list clients: users (`src/components/users/users-client.tsx`), plus customers/projects/activity-types clients (`grep -rl` each under `src/components` and `src/app/(app)`).

Apply the same pattern to each. Shown conceptually for **customers**; repeat per entity with the entity's endpoint path and row type.

- [ ] **Step 1: Add a "Toon gearchiveerd" toggle.** A boolean state; when on, fetch the list with `?includeArchived=1`; when off, the default. Re-fetch on toggle.

```ts
const [showArchived, setShowArchived] = useState(false);
// in the fetch:
fetch(`/api/customers${showArchived ? "?includeArchived=1" : ""}`)
```

- [ ] **Step 2: Row actions.** For a non-archived row, replace/augment the existing "Verwijderen" with **"Archiveren"** (`DELETE /api/customers/${id}` — now archives). For an archived row (`row.archivedAt != null`), show **"Herstellen"** (`PATCH /api/customers/${id}`). Render archived rows muted and with a "Gearchiveerd" badge.

```ts
async function archive(id: string) {
  await fetch(`/api/customers/${id}`, { method: "DELETE" });
  refresh();
}
async function restore(id: string) {
  await fetch(`/api/customers/${id}`, { method: "PATCH" });
  refresh();
}
```

- [ ] **Step 3: Repeat** for projects, activity-types, users. For **users**, keep the existing "cannot archive self" affordance (hide the archive action on the current user's row); the row type now has `archivedAt` (added in Task E4).

- [ ] **Step 4: Typecheck + lint**

Run: `npx tsc --noEmit && npm run lint`
Expected: no errors.

- [ ] **Step 5: Manual verification**

On each list page: archive a row → it disappears from the default view, appears (muted, "Gearchiveerd") when "Toon gearchiveerd" is on, and "Herstellen" brings it back. Deleting a customer that has projects no longer errors (it archives).

- [ ] **Step 6: Commit**

```bash
git add src/components src/app/\(app\)
git commit -m "feat: archive/restore UI with show-archived toggle on entity lists"
```

---

## Full test + build gate (run after each group, and at the end)

- [ ] Run the whole suite: `npm test`
  Expected: all pass (existing + new `user-schema`, `activity-impact`, `archive`, `km-template` tests).
- [ ] Build: `npm run build`
  Expected: succeeds (`prisma generate && next build`).

---

## Notes / deferrals

- ponytail: `window.confirm` used for the activity warnings (Group C) and inline archive actions — swap for a styled `Dialog` only if the surrounding component already uses one; not worth adding otherwise.
- Historical FK references (invoices, time/km entries → archived customers/projects/activities) are intentionally preserved; only top-level *list* queries filter archived. Do not add `archivedAt: null` to joined history relations.
- No DB/route/component test harness exists; route + UI behavior is covered by the manual-verification steps by design (matches the repo). Add integration tests only if the user later asks.
