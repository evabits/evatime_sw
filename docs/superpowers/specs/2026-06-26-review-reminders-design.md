# Quarterly Review Reminders — Design

**Date:** 2026-06-26
**Status:** Approved
**Scope:** Sub-project 4 (final) of the HR extension. A quarterly cron that reminds admins to
plan performance reviews for employees who don't yet have one this quarter.

## Goal

Each quarter, nudge admins to plan the reviews they still owe. The employee-facing "review
planned" email already exists (sub-project 3); this adds the recurring *manager-side* reminder.

## Context & decisions

- **Remind only** — the cron does NOT auto-create reviews; admins still plan them manually on
  `/personeel/[id]`.
- Reuses the established patterns: the `contract-expiry` cron
  (`src/app/api/cron/contract-expiry/route.ts`, CRON_SECRET via `x-vercel-cron-secret`, scheduled
  in `vercel.json`), `src/lib/email.ts` HTML emails, and `currentQuarter()` from
  `src/lib/reviews.ts`.
- Recipients: all `ADMIN` users (same as the contract-expiry cron — no manager relationship).
- No new model or UI. No dedup guard needed: the schedule fires once per quarter.

## 1. Pure helper (`src/lib/reviews.ts`, vitest-tested)

```
usersMissingReview(users: {id,name}[], reviewedUserIds: Set<string> | string[]) → {id,name}[]
```
Returns the users whose `id` is not in `reviewedUserIds`. One vitest case covers it (some
present, some missing → only the missing returned).

## 2. Email (`src/lib/email.ts`)

`sendReviewReminderEmail(admin: {name,email}, employees: {name}[], quarter: string, settings)`
— matches the existing HTML style; greets the admin, lists the employee names that still need a
review this `quarter`, and links to `${appUrl}/personeel`.

## 3. Cron (`src/app/api/cron/review-reminder/route.ts`)

`GET` handler, CRON_SECRET-guarded exactly like `contract-expiry`:
1. `const quarter = currentQuarter();`
2. Load all users (`id, name`) and the `userId`s of reviews whose `period === quarter`
   (`prisma.performanceReview.findMany({ where: { period: quarter }, select: { userId: true } })`).
3. `const missing = usersMissingReview(users, new Set(reviewedUserIds));`
4. If `missing.length === 0` → return `{ reminded: 0 }`.
5. Load `ADMIN` users + `companySettings`; email each admin with a non-null address via
   `sendReviewReminderEmail(admin, missing, quarter, settings)` (wrap each send in try/catch +
   `console.error`, like contract-expiry).
6. Return `{ reminded: <number of admins emailed>, missing: missing.length }`.

## 4. Schedule (`vercel.json`)

Add a third cron entry (keeping `hours-reminder` and `contract-expiry`):
```json
{ "path": "/api/cron/review-reminder", "schedule": "0 8 1 1,4,7,10 *" }
```
(08:00 on the 1st of January, April, July, October.)

## Out of scope

- Auto-creating reviews (explicitly remind-only).
- Per-employee "active" filtering (no such flag exists; admins judge who needs a review).
- Any UI.

## Verification

- `npm test` green incl. the new `usersMissingReview` case; `npx tsc --noEmit` clean;
  `npm run build` lists `/api/cron/review-reminder`.
- Manual: with a user lacking a current-quarter review, `curl localhost:3000/api/cron/review-reminder`
  (no CRON_SECRET locally) returns `{ reminded: N, missing: M }` and admins receive the listing
  email (Mailtrap); when every user already has a current-quarter review, returns `{ reminded: 0 }`.
