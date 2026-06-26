# Contracts + History — Design

**Date:** 2026-06-26
**Status:** Approved
**Scope:** Sub-project 2 of the HR extension. Promote the flat contract fields on `User`
into versioned `Contract` records with history, a Personeel section, document attachments,
and expiry-reminder emails.

## Goal

Track an employee's contract terms over time (history), expose a dedicated management UI,
store salary (the figure performance reviews will later change), attach contract documents,
and remind admins before fixed-term contracts expire.

## Context

- Today the contract terms live flat on `User`: `contractType`, `contractHours`,
  `contractStart`, `contractEnd`. They are edited inline in the `/users` page form and read
  directly by `/api/payroll`.
- `weeklyHours` on `User` is a **registration target**, NOT a contract term — it stays on
  `User` and is out of scope here.
- Existing patterns to reuse:
  - Attachments: `InvoiceAttachment` model + `@vercel/blob` `put(path, file, {access:"private"})`
    upload route + a streamed download route (see `src/app/api/invoices/[id]/attachments/`).
  - Cron + email: `src/app/api/cron/hours-reminder/route.ts` (CRON_SECRET-guarded via
    `x-vercel-cron-secret`, scheduled in `vercel.json`) and `src/lib/email.ts` HTML emails.
  - Repo conventions (memory): serialize Decimal/Date before crossing to client components;
    wrap every API handler in try/catch → `handleError`; send `""` not `null` from forms;
    `prisma db push` (no migrations folder); Node 22 for all commands.

## 1. Data model

New `Contract` model — single source of truth. The 4 flat contract fields are removed from
`User` after data is backfilled.

```prisma
model Contract {
  id                  String               @id @default(cuid())
  userId              String
  user                User                 @relation(fields: [userId], references: [id], onDelete: Cascade)
  contractType        ContractType         @default(PERMANENT)
  contractHours       Decimal?             @db.Decimal(5, 2)   // per week
  startDate           DateTime?            @db.Date
  endDate             DateTime?            @db.Date
  salaryMonthly       Decimal?             @db.Decimal(10, 2)  // bruto
  salaryHourly        Decimal?             @db.Decimal(10, 2)  // bruto
  jobTitle            String?              // "Functie"
  ftePercentage       Decimal?             @db.Decimal(5, 2)
  notes               String?
  expiryReminderSentAt DateTime?
  createdAt           DateTime             @default(now())
  updatedAt           DateTime             @updatedAt
  attachments         ContractAttachment[]

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

`User` gains `contracts Contract[]` and **loses** `contractType`, `contractHours`,
`contractStart`, `contractEnd`. `weeklyHours` stays. `ContractType` enum is unchanged.

### Salary auto-calc (server-side, on create + update)
Factor: `WEEKS_PER_MONTH = 52 / 12`.
- If `salaryMonthly` set, `salaryHourly` blank, and `contractHours` set →
  `salaryHourly = salaryMonthly / (contractHours * WEEKS_PER_MONTH)`.
- If `salaryHourly` set, `salaryMonthly` blank, and `contractHours` set →
  `salaryMonthly = salaryHourly * contractHours * WEEKS_PER_MONTH`.
- If both set → manual override, leave both as-is.
- If `contractHours` is null (e.g. ZERO_HOURS) → no derivation; store whatever was given.

`ftePercentage` is an explicit optional field — no auto-derivation (YAGNI).

### Migration (data backfill, then column drop)
1. Add `Contract`/`ContractAttachment` models and `User.contracts` relation; keep the old
   `User` columns temporarily. `prisma db push`.
2. Backfill via a guarded one-off endpoint `POST /api/migrate-contracts` (mirrors the existing
   `/api/seed` pattern: requires a secret query param; idempotent — skips users that already
   have a contract). For every existing `User` with no contract, create one `Contract` from
   `{contractType, contractHours, startDate: contractStart, endDate: contractEnd}`
   (salary/jobTitle/fte/notes null). Runs against the remote Neon DB after deploy; safe to
   re-run. Delete the endpoint in the same sub-project once the backfill is confirmed.
3. Remove the 4 columns from `User` in the schema; `prisma db push` again.

## 2. Effective-contract resolution

Pure, unit-tested helper in `src/lib/contracts.ts`:

```
getEffectiveContract(contracts, refDate): Contract | null
```

Returns the contract with the latest `startDate` such that `startDate <= refDate` and
(`endDate` is null OR `endDate >= refDate`). A null `startDate` is treated as "effective from
the beginning" (sorts earliest). Returns `null` when no contract matches (zero contracts, or
none covering `refDate`).

Used for "current" (refDate = today) and by payroll (refDate = payroll month-end).

Test file `src/lib/contracts.test.ts` covers: single open contract; two sequential contracts
(picks the one covering the date); date before any contract; date in a gap; empty array → null;
null `startDate`.

## 3. Payroll integration

`/api/payroll` currently selects `user.contractType` + `user.contractHours` and feeds them to
`src/lib/payroll.ts` (signature unchanged). Change only the data sourcing in
`src/app/api/payroll/route.ts`:
- Select each user's `contracts` instead of the flat fields.
- For the requested month, resolve `getEffectiveContract(contracts, monthEnd)`.
- Pass the resolved contract's `contractType` (default to the enum default when null) and
  `contractHours` (null when no contract) into the existing calc.

Empty state: no effective contract → `contractHours` null → overtime `null` and contractType
shown as "—". This matches today's behavior when `contractHours` is null; payroll never breaks.
Worked hours/km still come from time entries regardless.

## 4. UI & API

All Personeel pages and contract APIs are **ADMIN-only**.

### Pages
- **`/personeel`** (Medewerkers list): name, role, current job title, current salary
  (monthly), and an end-date warning chip when the effective contract is FIXED_TERM ending
  within 30 days. Empty contract fields render "—". Server-resolves the effective contract
  per user; serialize before passing to the client.
- **`/personeel/[id]`**: employee header + **contract history table** (all versions newest
  first, current highlighted) + add / edit / delete contract form + per-contract attachment
  list (upload/download/delete). Empty state when the user has no contracts: "Nog geen
  contract" + an "Contract toevoegen" button.

### Contract API (ADMIN-only, `handleError`, Decimal/Date serialized)
- `GET /api/users/[id]/contracts` — list a user's contracts (newest first).
- `POST /api/contracts` — create (body includes `userId`); runs salary auto-calc.
- `PUT /api/contracts/[id]` — update; re-runs salary auto-calc.
- `DELETE /api/contracts/[id]` — delete (cascades attachments).

### Overlap handling
Non-blocking: the add/edit form shows a warning when the entered date range overlaps an
existing contract for the same user. It never blocks save. Admin can edit/delete any version
to correct mistakes.

### Form payload rules
Per repo convention, the form sends `""` for empty optionals (not `null`); the API converts
`""`/absent → `null` before Prisma writes. Zod optional decimals use
`z.coerce.number().positive().optional().nullable()` mirroring the existing user schema.

## 5. Contract attachments

Mirror `InvoiceAttachment` exactly.
- `POST /api/contracts/[id]/attachments` — `formData` `file`; `put(`contracts/${id}/${file.name}`,
  file, { access: "private" })`; create `ContractAttachment` row.
- `DELETE /api/contracts/[id]/attachments/[attachmentId]` — delete the row.
- `GET /api/contracts/[id]/attachments/[attachmentId]/download` — streamed private download,
  mirroring `src/app/api/invoices/[id]/attachments/[attachmentId]/route.ts` /
  `src/app/api/expenses/[id]/receipt/download/route.ts`.
- Surfaced in the `/personeel/[id]` contract UI.

## 6. Contract expiry reminders

- New cron `GET /api/cron/contract-expiry`, guarded by `CRON_SECRET` via the
  `x-vercel-cron-secret` header (same as hours-reminder). Scheduled daily in `vercel.json`
  (`{ "path": "/api/cron/contract-expiry", "schedule": "0 8 * * *" }`).
- Constant `CONTRACT_EXPIRY_REMINDER_DAYS = 30` (`// ponytail:` comment — tunable; promote to
  CompanySettings if it needs to be configurable).
- Logic: find contracts where `endDate` is between today (inclusive) and
  today + `CONTRACT_EXPIRY_REMINDER_DAYS` and `expiryReminderSentAt IS NULL`. For each, email
  every **ADMIN** user, then set `expiryReminderSentAt = now()` so it sends once.
- New `sendContractExpiryEmail(admin, contract, employee, settings)` in `src/lib/email.ts`,
  matching the existing HTML-email style. Includes employee name, job title, contract type,
  and end date.
- Recipient is ADMIN users because there is no manager relationship yet; sub-project 3 may
  refine recipients to managers.

## 7. Sidebar

Add a new **Personeel** group (ADMIN) to `navGroups` in `src/components/layout/sidebar.tsx`,
above or near Beheer, with one item **Medewerkers** → `/personeel` (icon: an existing lucide
import such as `Users`/`UserCog`, or add one import). Leaves room for a future "Beoordelingen"
item (sub-project 3).

## 8. Out of scope (YAGNI)

- Employee self-view of their own contract/salary (ADMIN-only for now).
- Auto-derived FTE.
- Manager relationship / manager-targeted reminders (sub-project 3+).
- Performance reviews and review-driven salary changes (sub-project 3).

## Verification

- `npx tsc --noEmit` passes (Node 22).
- `src/lib/contracts.test.ts` passes (vitest), covering the resolution cases listed in §2.
- Manual: migrate existing users → each has one contract; `/personeel` lists employees;
  `/personeel/[id]` shows history, add a raise contract → salary auto-calc fills the blank
  field; overlapping dates show a warning but still save; upload + download + delete an
  attachment; payroll for a past month still matches the contract effective then; a user with
  no contract shows the empty state and payroll shows "—"/null overtime without error.
- Expiry cron: a contract ending within 30 days with null `expiryReminderSentAt` triggers an
  admin email once and stamps `expiryReminderSentAt`.
