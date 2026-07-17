# Time-registration feedback batch — design

**Date:** 2026-07-17
**Branch:** `worktree-time-reg-feedback-batch`
**Source:** User (AB) feedback on the "Uren registreren" (time registration) flow.

Three independent fixes. AB reports as an **ADMIN** user.

---

## Fix #1 — Non-billable activity still asks "facturabel?" for admins

**Symptom:** Selecting a non-billable activity (e.g. *EVAbits-Intern-algemeen*) still
presents the billable toggle defaulted to "Ja", even though the activity is configured
as non-billable.

**Root cause:** In `src/components/time/time-entries-client.tsx` (lines 159-164), the
`useEffect` that derives `billable` from the selected activity only runs for non-admins:

```tsx
useEffect(() => {
  if (!isAdmin) {
    const act = activityTypes.find((a) => a.id === activityTypeId);
    form.setValue("billable", act?.billable ?? true);
  }
}, [activityTypeId, isAdmin]);
```

For admins the toggle keeps its default of `true` regardless of the activity.

**Rejected fix — just removing the `if (!isAdmin)` guard.** The effect fires on any
`activityTypeId` change, including the `form.reset(...)` inside `startEdit` (line 344).
Running the derive for admins on edit-open would clobber an admin's *saved* billable
override with the activity default. Regression.

**Fix (root cause):** Derive the billable default on **explicit activity selection**,
not via the reset-triggered effect. The activity `<Select>` already has
`onValueChange={(v) => form.setValue("activityTypeId", v)}` (line 407). Extend it:

```tsx
onValueChange={(v) => {
  form.setValue("activityTypeId", v);
  const act = activityTypes.find((a) => a.id === v);
  form.setValue("billable", act?.billable ?? true);
}}
```

and **delete** the `useEffect` at lines 159-164. `onValueChange` fires only on real user
interaction — not on `form.reset` — so opening an entry to edit preserves its saved
`billable`. Applies to admin and non-admin alike; admins keep the override dropdown,
which now starts at the activity's real value (non-billable activity → "Nee").

**Files:** `src/components/time/time-entries-client.tsx`

---

## Fix #2 — Regular staff can see hourly rates (security leak)

**Symptom:** Hourly rates should be admin-only; staff can still see them.

**Root cause:** The time-entry form already gates rates behind `isAdmin` correctly. The
leak is that several **admin-only pages are gated by the sidebar nav only** — the pages
themselves have **no server-side role check**, so a non-admin who navigates to the URL
directly renders the page (rates included). Verified:

- `src/app/api/reports/route.ts` — GET checks `session` only (line 9); returns
  `defaultRate`, `defaultHourlyRate`, `defaultKmRate`, amounts, and total revenue to any
  authenticated user.
- `src/app/(app)/reports/page.tsx` — no role gate; renders for anyone hitting `/reports`.
- `src/app/(app)/projects/page.tsx` and `src/app/(app)/activity-types/page.tsx` — no role
  gate; both render rate columns. Sidebar lists them under "Beheer" as `roles: ["ADMIN"]`.

**Access decision:** Reports visible to **ADMIN and FINANCE**; projects/activity-types
management remain **ADMIN-only** (matching the sidebar).

**Fix (server-side, root cause).** Canonical patterns already used in the repo:
- Page gate (see `src/app/(app)/quotes/page.tsx`):
  `if ((session?.user as any)?.role !== "ADMIN") redirect("/");`
- API gate (see `src/app/api/invoices/route.ts`):
  `if (!canViewReports(role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });`

Steps:
- `src/lib/roles.ts` → add `canViewReports(role)` = ADMIN || FINANCE; flip the FINANCE
  `viewReports` config flag (line 44) to `true` for consistency with the docblock.
- `src/app/api/reports/route.ts` → 403 when `!canViewReports(role)`.
- `src/app/(app)/reports/page.tsx` → `redirect("/")` when `!canViewReports(role)`.
- `src/app/(app)/projects/page.tsx` and `.../activity-types/page.tsx` → `redirect("/")`
  when role !== "ADMIN".
- `src/components/layout/sidebar.tsx` (line 76) → show the Reports link to
  `["ADMIN", "FINANCE"]`.
- The time-entry form needs **no change** — already gated.

**Files:** `src/lib/roles.ts`, `src/app/api/reports/route.ts`,
`src/app/(app)/reports/page.tsx`, `src/app/(app)/projects/page.tsx`,
`src/app/(app)/activity-types/page.tsx`, `src/components/layout/sidebar.tsx`.

**Out of scope:** (a) Stripping rate fields from `/api/time` responses for non-admins
(defense-in-depth; the time UI already hides them). (b) The broader systemic gap that
*other* admin-only pages (customers, users, payroll, settings, …) also lack server-side
gating — real, but not part of this rate-visibility batch.

---

## Fix #3 — Reset input fields after "Toevoegen"

**Symptom (as reported):** After adding an entry, the form keeps the previous values.

**Current state:** The add flow **already resets** on success (line 317:
`form.reset({ date: selectedDay ?? today, billable: true })`), clearing project,
activity, hours, and description. So the core ask is largely already implemented —
likely the feedback predates this code.

**Remaining gap vs. the "keep the date" decision:** In **list view**, `selectedDay` is
null, so the reset snaps the date back to `today` rather than the date just entered —
inconvenient when logging several entries for another day.

**Fix:** Change the add-branch reset (line 317) to keep the entered date:
`form.reset({ date: data.date, billable: true })`. In week view `data.date` already
equals the selected day, so behaviour there is unchanged. One-line change; edit flow
(line 303) left as-is.

**Files:** `src/components/time/time-entries-client.tsx`

---

## Testing / verification

- **#1:** As admin, select a non-billable activity → billable dropdown shows "Nee";
  select a billable activity → "Ja"; admin can still override.
- **#2:** As an EMPLOYEE, navigating to `/reports` redirects away; `GET /api/reports`
  returns 403. As ADMIN/FINANCE, reports work and the sidebar link shows.
- **#3:** After adding a time entry, all fields clear except the date.

## Notes

Fixes are independent and can land in any order in a single branch.
