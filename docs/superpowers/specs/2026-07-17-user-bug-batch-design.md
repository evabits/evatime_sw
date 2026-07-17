# User-reported bug batch — design

Date: 2026-07-17

Five independent items reported by admin (AB). Each ships as its own commit;
no cross-dependencies. DB changes are additive and applied via `prisma db push`
(Neon, no migrations folder).

---

## 1. Archive (customers, projects, activity types, users)

**Problem:** DELETE endpoints for `Customer` and `Project` hard-delete and hit
foreign-key constraints (projects → customer, time/km entries → project), so
they throw. Deleting is also undesirable — history must be preserved.

**Approach:** uniform soft-archive.

- Add nullable `archivedAt DateTime?` to `Customer`, `Project`, `ActivityType`,
  `User`. Timestamp over boolean: `null` = active, non-null = archived + when.
  `Project.status` stays a separate business concept (CONCEPT/ACTIVE/INACTIVE/
  COMPLETED), untouched.
- **List/GET endpoints** default to `where: { archivedAt: null }`. Accept
  `?includeArchived=1` to include archived rows.
- **DELETE handlers become archive:** each existing DELETE handler sets
  `archivedAt = now()` instead of `prisma.delete`. Add an unarchive path
  (PATCH or a `?unarchive` flag). Hard-delete is dropped entirely (YAGNI).
  Safe: existing delete callers (customers/projects/activity-types/users
  clients) only `fetch(DELETE)` then drop the row from local state — none read
  the response body.

**Every read site that must exclude archived** — the sweep is wider than the
four list pages. Each `prisma.{customer,project,activityType,user}.findMany`
needs an `archivedAt: null` decision:
- Pickers/lists: `time/page.tsx` (employee filter), `invoices/new`,
  `quotes/new`, `expenses`, `km`, `personeel`, `reports`, `(app)/page.tsx`
  (dashboard), `api/hours-overview/route.ts`, `api/payroll/route.ts`.
- **Cron/background jobs must skip archived users too** (else archived staff
  get emailed/paid): `cron/hours-reminder`, `cron/review-reminder`,
  `cron/contract-expiry`, `payroll`.

- **User archive:** reuse the existing "cannot delete/archive own account"
  guard. Block archived users at login — add `archivedAt: null` to the
  credentials lookup in `@/lib/auth` **and** verify the Google-provider path
  (upsert around `auth.ts:44`) also rejects archived users (it does not
  `findUnique` on `archivedAt` today).
- **UI:** "Archiveren" / "Herstellen" buttons on each entity; a "Toon
  gearchiveerd" toggle per list page. Archived rows render muted.

**Affected files (indicative):**
- `prisma/schema.prisma`
- `src/app/api/customers/[id]/route.ts`, `src/app/api/customers/route.ts`
- `src/app/api/projects/[id]/route.ts`, `src/app/api/projects/route.ts`
- `src/app/api/activity-types/[id]/route.ts`, `src/app/api/activity-types/route.ts`
- `src/app/api/users/[id]/route.ts`, `src/app/api/users/route.ts`
- `src/lib/auth.ts` (credentials + Google login block)
- the read sites listed above (list pages, pickers, cron, payroll,
  hours-overview) and any shared picker components.
- **Serialization note:** `customers/[id]` returns the model directly via
  `NextResponse.json(customer)` (not `serialize`), so the new `archivedAt` Date
  is emitted raw — fine, but consumers must handle a Date/ISO string.

**Test:** a query-level check that an archived row is excluded from the default
list query and included with `includeArchived`.

---

## 2. Time page remembers filters

**Problem:** `time-entries-client.tsx:73` hard-defaults `filterUser` to `"all"`
on every load, so admins always land on "Alle medewerkers" even when they just
want to enter their own hours.

**Approach:** client-only persistence.

- Persist `filterUser` and `filterProject` in `localStorage`, keyed per
  logged-in user (e.g. `time-filters:<userId>`). Restore on mount.
- `filterMonth` stays default (current month) — it is time-relative, not a
  view preference.
- No server state.

**Affected files:** `src/components/time/time-entries-client.tsx`.

**Test:** trivial (localStorage read/write) — no dedicated test.

---

## 3. Warning when editing/deleting an activity with booked hours

**Problem (as reported):** hours appear to "disappear" when editing activities.
Per decision, we do not investigate root cause; we guard the mutation paths so
the user is warned before any change that affects booked entries.

Concrete data paths that make entries "vanish":
- Deleting an `ActivityType` sets `TimeEntry.activityTypeId` / `KmEntry.
  activityTypeId` to null (default SetNull) — hours remain but the activity
  (and any activity-derived rate) is lost.
- Editing an activity type's project-links removes it from a project, so
  entries booked on that project+activity no longer surface in
  activity-filtered views.

**Approach:**

- Small count endpoint returns, for an activity type, the number of
  `TimeEntry` + `KmEntry` referencing it (and total hours), optionally split by
  project.
- **On edit that removes a project-link** (`activity-types/[id]/route.ts:28`,
  the `deleteMany` of `activityTypeProject`): if entries are booked on a project
  being unlinked, warn before saving. **This is the primary path** — see note.
- **On delete:** if count > 0, the UI shows a confirm dialog —
  *"N registraties (X uur) gebruiken deze activiteit. Verwijderen ontkoppelt
  ze."* — and the delete only proceeds with an explicit confirmed flag.

**Interaction with #1:** once #1 turns activity-type DELETE into archive, the
"hours vanish on hard-delete" path largely disappears (archived types keep
their FK links). The warning then centers on the edit/project-unlink path. If
#1 ships first, the delete-confirm becomes an archive-confirm.

**Affected files:**
- `src/app/api/activity-types/[id]/route.ts` (count + confirmed-delete guard)
- activity-type edit/delete UI under `src/app/(app)/activity-types`.

**Test:** the count logic (given entries on an activity, returns correct
count/hours; zero when none).

---

## 4. Admin-defined WoonWerk (commute) KM template

**Problem:** `KmTemplate` is strictly self-service (userId from session). Admin
wants to define an employee's commute template; the employee uses it but does
not own/edit it, while still keeping their own templates for other activities.

**Approach:**

- Add `managedByAdmin Boolean @default(false)` to `KmTemplate`. `projectId`
  stays required — admin picks the project/activity when defining it (no model
  surgery).
- **Admin** can create/edit/delete a template for a target user with
  `managedByAdmin = true`. UI lives on the employee detail page
  (`personeel/[id]`) as a "Woon-werk sjabloon" block.
- **Employee** GET returns their own templates (self + admin-managed). They can
  apply any template; they can create/edit/delete only their own non-managed
  ones. Admin-managed templates render read-only (locked).

**`km/templates/[id]/route.ts` already exists — REWRITE, not add.** Current
state (blocker to reconcile):
- Both PUT and DELETE are owner-scoped via `where: { id, userId }`
  (`updateMany`/`deleteMany` → `count === 0` → 404). An admin editing *another*
  user's template would silently 404. New authorization: allow the row's owner
  **or** an admin; when `managedByAdmin === true`, block the non-admin owner.
- PUT today only accepts `{ name }`. It must accept the full managed-template
  fields (project/activityType/km/description) when the caller is admin.
- `km-templates-client.tsx` already calls these endpoints — its calls and the
  new locked-state UI must stay in sync.
- POST (`km/templates/route.ts`) accepts an optional target `userId` +
  `managedByAdmin` when the caller is admin.
- `@@unique([userId, name])` (schema:189): a managed and a self template for the
  same user can't share a name — the 409 handler must surface this clearly.

**Affected files:**
- `prisma/schema.prisma`
- `src/app/api/km/templates/route.ts`
- `src/app/api/km/templates/[id]/route.ts` (rewrite existing)
- `src/lib/km-template.ts` (schema)
- `src/app/(app)/personeel/[id]` (admin block), `km-templates-client.tsx`
  (locked state).

**Test:** authorization logic — admin may write another user's managed
template; a non-admin may not edit/delete a managed template.

---

## 5. Target-hours validation

**Problem:** `weeklyHours: z.coerce.number().positive()` in both
`users/route.ts:13` and `users/[id]/route.ts:13`. An empty field coerces to
`0`, which fails `.positive()`, so a user without a target cannot be saved —
contradicting the intent (empty = no target).

**Approach:** one shared field, used in both routes.

```ts
const weeklyHours = z.preprocess(
  (v) => (v === "" || v == null ? undefined : v),
  z.coerce.number().positive("Moet groter dan 0 zijn").optional().nullable()
);
```

- Empty → `undefined` → stored as `null` (no target).
- `"0"` → clear validation error.
- `"40"` → 40.

**The client form has the identical bug and blocks first** —
`users-client.tsx:22` (create) and `:30` (edit) both use
`z.coerce.number().positive().optional().nullable()`, so validation fails in
the browser before any request is sent. The same `preprocess` field MUST be
applied to both client schemas, or the bug persists in the UI regardless of the
server fix. (The inputs also carry `min="1"` at `:236`/`:282`; harmless — HTML
`min` doesn't reject an empty field.)

**Affected files:**
- shared schema (co-locate near the user routes or in a small `src/lib`
  helper), `src/app/api/users/route.ts`, `src/app/api/users/[id]/route.ts`,
  **and `src/components/users/users-client.tsx` (both schemas)**.

**Test:** schema test — `""` → null/undefined, `"0"` → error, `"40"` → 40.

---

## Sequencing

Independent; suggested order (quick wins first): **#5 → #2 → #3 → #4 → #1**.
#1 is the largest (four models + auth + multiple list pages).
