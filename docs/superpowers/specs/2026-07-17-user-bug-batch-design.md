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
- **All pickers/selectors** exclude archived: project dropdowns, customer
  dropdowns, activity-type dropdowns, the employee filter on the time page.
- **DELETE handlers become archive:** each existing DELETE handler sets
  `archivedAt = now()` instead of `prisma.delete`. Add an unarchive path
  (PATCH or a `?unarchive` flag). Hard-delete is dropped entirely (YAGNI).
- **User archive:** reuse the existing "cannot delete/archive own account"
  guard. Archived users are blocked at login (add `archivedAt: null` to the
  credentials lookup in `@/lib/auth`) and excluded from staff lists and the
  time-page employee filter.
- **UI:** "Archiveren" / "Herstellen" buttons on each entity; a "Toon
  gearchiveerd" toggle per list page. Archived rows render muted.

**Affected files (indicative):**
- `prisma/schema.prisma`
- `src/app/api/customers/[id]/route.ts`, `src/app/api/customers/route.ts`
- `src/app/api/projects/[id]/route.ts`, `src/app/api/projects/route.ts`
- `src/app/api/activity-types/[id]/route.ts`, `src/app/api/activity-types/route.ts`
- `src/app/api/users/[id]/route.ts`, `src/app/api/users/route.ts`
- `src/lib/auth.ts` (login block)
- list pages under `src/app/(app)/{customers,projects,activity-types,users}`
  and any shared picker components.

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
- **On delete:** if count > 0, the UI shows a confirm dialog —
  *"N registraties (X uur) gebruiken deze activiteit. Verwijderen ontkoppelt
  ze."* — and the delete only proceeds with an explicit confirmed flag.
- **On edit that removes a project-link:** if entries are booked on a project
  being unlinked, warn before saving.

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
- New `src/app/api/km/templates/[id]/route.ts` (PUT/DELETE) enforces the
  admin-vs-owner rules; `km/templates` POST accepts an optional target `userId`
  + `managedByAdmin` when the caller is admin.

**Affected files:**
- `prisma/schema.prisma`
- `src/app/api/km/templates/route.ts`
- `src/app/api/km/templates/[id]/route.ts` (new)
- `src/lib/km-template.ts` (schema)
- `src/app/(app)/personeel/[id]` (admin block), km template list UI (locked
  state).

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

Confirm the client user form does not itself block an empty value.

**Affected files:**
- shared schema (co-locate near the user routes or in a small `src/lib`
  helper), `src/app/api/users/route.ts`, `src/app/api/users/[id]/route.ts`.

**Test:** schema test — `""` → null/undefined, `"0"` → error, `"40"` → 40.

---

## Sequencing

Independent; suggested order (quick wins first): **#5 → #2 → #3 → #4 → #1**.
#1 is the largest (four models + auth + multiple list pages).
