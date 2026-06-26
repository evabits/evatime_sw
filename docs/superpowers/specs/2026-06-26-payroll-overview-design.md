# Payroll overview (loonverwerking) — design

Date: 2026-06-26

## Goal

An admin-only monthly overview for payroll processing. For a selected month it
shows, per employee: kilometers driven, total worked hours, hours tagged WBSO,
and overtime. The numbers are what the admin hands to payroll.

## Scope

- New admin page `/payroll` with a month picker and a table, one row per user.
- New aggregation API `GET /api/payroll?month=YYYY-MM`.
- A small contract concept added to the employee (fields on `User`).
- Routes/identifiers in English; all visible UI copy in Dutch.

Out of scope (YAGNI — add later if asked): CSV/export, contract history table,
absence-adjusted overtime, selecting the WBSO tag by id instead of by name.

## Report columns

One row per **user** (all users, including admins/finance), for the selected month:

| Column (Dutch label) | Meaning | Source |
|---|---|---|
| Werknemer | employee name | `User.name` |
| Contract | type + contracted hours/week | `User.contractType`, `User.contractHours` |
| Gewerkte uren | total worked hours in month | sum `TimeEntry.hours` where `date` in month |
| WBSO-uren | worked hours on WBSO projects | sum `TimeEntry.hours` where the entry's project has a tag named "wbso" (case-insensitive) |
| Overuren | overtime | see calculation below; blank for `ZERO_HOURS` |
| Kilometers | km driven in month | sum `KmEntry.km` where `date` in month |

## Overtime calculation

For `PERMANENT` and `FIXED_TERM`:

```
monthlyContractHours = contractHours (per week) * daysInMonth / 7
overtime = max(0, workedHours - monthlyContractHours)
```

`daysInMonth / 7` is the same weeks-in-period approximation `/api/hours-overview`
already uses; keep them consistent.

For `ZERO_HOURS`: no contracted baseline, all hours are paid by agreement →
overtime column is blank / n.a.

## Schema change (the only real cost)

On `User`:

- `contractType` — new enum `ContractType { PERMANENT FIXED_TERM ZERO_HOURS }`.
  Reasonable default: `PERMANENT`.
- `contractHours` — `Decimal? @db.Decimal(5, 2)`, per week. This is a **rename of
  the existing `weeklyHours`** field (preserve data in the migration).
- `contractStart` — `DateTime? @db.Date`, optional.
- `contractEnd` — `DateTime? @db.Date`, optional (relevant for fixed-term).

Consumer to update: `/api/hours-overview/route.ts` currently reads
`weeklyHours` — switch it to `contractHours`.

These fields are edited in the existing `/users` admin page (add contract type
dropdown, hours input, start/end date inputs).

No schema change needed for WBSO (reuses Project `Tag`), kilometers (`KmEntry`),
or overtime (computed at request time).

## API: `GET /api/payroll?month=YYYY-MM`

- Auth: `auth()`, 401 if no session; **403/empty if not admin** (role `ADMIN`).
  (Authorization lives in the route, matching the project pattern.)
- Parse `month` into `[from, to)` date range (first day of month → first day of
  next month). Default to current month if absent.
- Aggregate (parallel):
  - `prisma.timeEntry.groupBy({ by: ["userId"], _sum: { hours }, where: { date } })`
    → worked hours per user.
  - WBSO hours: sum `TimeEntry.hours` for entries whose `project` has a tag
    named "wbso" in range, grouped by user. (Filter via the project→tags relation.)
  - `prisma.kmEntry.groupBy({ by: ["userId"], _sum: { km }, where: { date } })`
    → km per user.
  - `prisma.user.findMany()` → name + contract fields.
- Compute overtime per user as above.
- Serialize all `Decimal` to `Number(...)` before returning (project rule).
- `handleError(e)` in catch.

Response shape (per user):
```ts
{
  userId, name,
  contractType, contractHours,
  workedHours, wbsoHours,
  overtime,          // number | null (null for ZERO_HOURS)
  km
}
```

## Page: `/payroll`

- `src/app/(app)/payroll/page.tsx` — server component: `auth()`, compute
  `isAdmin`; if not admin, render nothing useful / redirect (match how other
  admin pages behave). Delegates to a client component.
- `src/components/payroll/payroll-client.tsx` — month picker (`<input
  type="month">`), fetch `/api/payroll?month=...`, render the table. Dutch labels.
- Add a sidebar entry in the admin group of
  `src/components/layout/sidebar.tsx` (roles: `["ADMIN"]`).

## Files touched

- `prisma/schema.prisma` — `ContractType` enum + `User` fields (rename
  `weeklyHours` → `contractHours`, add 3 fields).
- new migration.
- `src/app/api/payroll/route.ts` — new.
- `src/app/(app)/payroll/page.tsx` — new.
- `src/components/payroll/payroll-client.tsx` — new.
- `src/components/layout/sidebar.tsx` — add nav item.
- `src/app/api/hours-overview/route.ts` — `weeklyHours` → `contractHours`.
- `/users` page + its API — add contract fields to the employee edit form.

## Testing

- One aggregation check on the overtime + WBSO math: a user with a known set of
  time entries (some on a WBSO-tagged project), km entries, and a contract →
  assert workedHours, wbsoHours, overtime, km for a sample month. Verify
  ZERO_HOURS yields null overtime.
