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

**Root cause:** In `src/components/time/time-entries-client.tsx`, the `useEffect` that
derives `billable` from the selected activity only runs for non-admins:

```tsx
useEffect(() => {
  if (!isAdmin) {
    const act = activityTypes.find((a) => a.id === activityTypeId);
    form.setValue("billable", act?.billable ?? true);
  }
}, [activityTypeId, isAdmin]);
```

For admins the toggle keeps its default of `true` regardless of the activity.

**Fix:** Derive the `billable` default from the selected activity's `billable` setting
for **everyone**. Admins keep the manual override dropdown — it just starts pre-set to
the activity's real value (picking a non-billable activity pre-selects "Nee"). Remove
the `if (!isAdmin)` guard so the effect always sets the default from the activity.

Admin override still works: they can change the dropdown after selection. Switching
activity re-derives the default (intended — each activity carries its own default).

**Files:** `src/components/time/time-entries-client.tsx`

---

## Fix #2 — Regular staff can see hourly rates (security leak)

**Symptom:** Hourly rates should be admin-only; staff can still see them.

**Root cause:** The time-entry form already gates rates behind `isAdmin` correctly. The
leak is the **Reports** surface, which relies on UI-only gating (sidebar link hidden)
with **no server-side role check**:

- `src/app/api/reports/route.ts` — GET returns `defaultRate`, `defaultHourlyRate`,
  `defaultKmRate`, amounts, and total revenue to any authenticated user.
- `src/app/(app)/reports/page.tsx` — renders for anyone who navigates directly to
  `/reports`; the sidebar only hides the link.
- `src/app/(app)/activity-types/page.tsx` and `src/app/(app)/projects/page.tsx` render
  rate columns; their page-level role gating must be verified.

**Access decision:** Reports/rates are visible to **ADMIN and FINANCE** (`isAdminOrFinance`).

**Fix (server-side, root cause):**
- `src/app/api/reports/route.ts` → return 403 when the caller is not admin/finance.
- `src/app/(app)/reports/page.tsx` → server-side redirect (to `/`) when not admin/finance.
- `src/components/layout/sidebar.tsx` → show the Reports link to ADMIN **and** FINANCE
  (currently admin only), consistent with the new access rule.
- Verify `activity-types` and `projects` pages have server-side admin gating; add a
  redirect for non-admins if missing.
- The time-entry form needs **no change** — already gated.

**Files:** `src/app/api/reports/route.ts`, `src/app/(app)/reports/page.tsx`,
`src/components/layout/sidebar.tsx`, and (verify/add) `src/app/(app)/activity-types/page.tsx`,
`src/app/(app)/projects/page.tsx`.

**Out of scope:** Stripping rate fields from `/api/time` responses for non-admins
(defense-in-depth). The time UI already hides them; not part of this batch.

---

## Fix #3 — Reset input fields after "Toevoegen"

**Symptom:** After adding an entry, the form keeps the previous values.

**Root cause:** The submit success handler never resets the form.

**Fix:** After a successful add, call `form.reset()` back to defaults — but **keep the
current date** so several entries can be logged for the same day. Reset only applies to
the add flow, not edits.

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
