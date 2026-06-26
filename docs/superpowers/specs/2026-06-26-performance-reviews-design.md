# Performance Reviews — Design

**Date:** 2026-06-26
**Status:** Approved
**Scope:** Sub-project 3 of the HR extension. A quarterly performance-review system: a
data-driven questionnaire template (editable in-app), employee self-evaluation + admin
manager-evaluation, agreements, and an optional salary change that creates a new contract.

## Goal

Capture structured performance reviews over time. Employees fill a self-evaluation; admins
fill the manager evaluation, record up to three agreements, and optionally grant a raise that
flows into the existing contract system. Questions are editable in an admin screen without a
deploy, and historical reviews keep the questions they were answered against.

## Context & decisions

- **Reviewers:** admins review everyone (no manager relationship). The form's "Beoordelaar" is
  recorded as the admin who conducts it, mirroring `AbsenceRequest.reviewedBy → User`.
- **Questions are data, not code.** A single editable `ReviewTemplate` holds the questionnaire.
  Each review **snapshots** the template at creation (`formSnapshot`), so rewording/removing a
  question never alters past reviews — no version table needed.
- **Answers** are JSON keyed by stable question `key`, split into `selfAnswers` (employee) and
  `managerAnswers` (admin). Agreements and the salary outcome are fixed structured fields, NOT
  templated, so the template editor only deals with text questions.
- **Lifecycle:** PLANNED → SELF_COMPLETED → COMPLETED. No employee acknowledgement step.
- **Salary outcome:** optional at finalize — creates a new `Contract` linked via
  `resultingContractId`.
- **Employee access:** a "Mijn beoordelingen" sidebar page AND a dashboard card for pending
  self-evals.
- Reuses: `AbsenceRequest` reviewer/status pattern; `Contract` + `src/lib/contracts.ts`
  (`getEffectiveContract`, `fillSalary`); `src/lib/email.ts`; the `/personeel/[id]` UI
  (`contracts-client.tsx` patterns); repo conventions (serialize Decimal/Date, `handleError`,
  `""`-not-null forms, no zod `.default()` with zodResolver, Node 22, `prisma db push`, vitest).

## 1. Data model

```prisma
enum ReviewStatus {
  PLANNED
  SELF_COMPLETED
  COMPLETED
}

model ReviewTemplate {            // singleton (like CompanySettings)
  id         String   @id @default(cuid())
  definition Json     // { sections: [{ title, questions: [{ key, label, hint, respondent }] }] }
  updatedAt  DateTime @updatedAt
}

model PerformanceReview {
  id                 String       @id @default(cuid())
  userId             String
  user               User         @relation("ReviewSubject", fields: [userId], references: [id], onDelete: Cascade)
  reviewedBy         String?
  reviewer           User?        @relation("ReviewReviewer", fields: [reviewedBy], references: [id])
  period             String       // e.g. "2026-Q2"
  plannedDate        DateTime?    @db.Date
  status             ReviewStatus @default(PLANNED)
  formSnapshot       Json         // copy of ReviewTemplate.definition at creation
  selfAnswers        Json?        // { [questionKey]: string }
  managerAnswers     Json?        // { [questionKey]: string }
  agreements         Json?        // [{ action: string, result: string }] (max 3)
  resultingContractId String?     @unique
  resultingContract  Contract?    @relation("ReviewResult", fields: [resultingContractId], references: [id])
  selfCompletedAt    DateTime?
  completedAt        DateTime?
  plannedEmailSentAt DateTime?
  createdAt          DateTime     @default(now())
  updatedAt          DateTime     @updatedAt

  @@index([userId])
}
```

`User` gains: `reviews PerformanceReview[] @relation("ReviewSubject")` and
`reviewsGiven PerformanceReview[] @relation("ReviewReviewer")`.
`Contract` gains: `reviewResult PerformanceReview? @relation("ReviewResult")`.

### Template seed (initial `ReviewTemplate.definition`)
Seeded once via a guarded endpoint (mirrors `/api/seed`) or the template editor. Sections and
question keys (Dutch labels from the supplied forms; `respondent` SELF or MANAGER):

- **SELF — "Zelfbeoordeling medewerker":** `satisfied` ("Waar ben je tevreden over?"),
  `learned` ("Wat ging minder goed en wat heb je daarvan geleerd?"),
  `techDevelopment` ("Hoe heb je jezelf technisch ontwikkeld?"),
  `personalDevelopment` ("Hoe heb je jezelf persoonlijk ontwikkeld?"),
  `atmosphere` ("Wat vind je van de werksfeer?"),
  `futureDevelopment` ("Waar wil je je de komende periode verder in ontwikkelen?").
- **MANAGER — "Technisch functioneren":** `quality` ("Kwaliteit van het werk"),
  `execution` ("Uitvoering en afronding van opdrachten"),
  `knowledge` ("Technische kennis en probleemoplossing"),
  `techGrowth` ("Technische ontwikkeling").
- **MANAGER — "Persoonlijk functioneren":** `responsibility` ("Verantwoordelijkheid en initiatief"),
  `askingHelp` ("Hulp vragen en omgaan met knelpunten"),
  `communication` ("Communicatie en samenwerking"),
  `feedbackHandling` ("Feedback en persoonlijke ontwikkeling").
- **MANAGER — "Samenvatting":** `strengths` ("Sterke punten"),
  `developmentPoints` ("Ontwikkelpunten"), `conclusion` ("Algemene conclusie").

Each question carries an optional `hint` (the "Denk bijvoorbeeld aan…" guidance). Agreements
(≤3 action/result pairs) render as a fixed block after the MANAGER sections.

## 2. Pure helpers (`src/lib/reviews.ts`, vitest-tested)

- `currentQuarter(date = ...) → "YYYY-Qn"` — default period label.
- `questionKeys(snapshot, respondent) → string[]` — keys for SELF or MANAGER from a snapshot.
- `sanitizeAnswers(snapshot, respondent, answers) → { [key]: string }` — keep only keys that
  belong to `respondent` in the snapshot (prevents an employee writing manager answers, or
  stray keys). Used server-side before persisting.

Tests cover: quarter boundaries; questionKeys filters by respondent; sanitizeAnswers drops
foreign/unknown keys and keeps valid ones.

## 3. API (`handleError`, serialized, ADMIN-only unless noted)

- `GET /api/review-template` (admin) / `PUT /api/review-template` (admin) — read/update the
  singleton `definition`. Upsert the single row.
- `POST /api/reviews` (admin) — body `{ userId, period?, plannedDate? }`. Defaults `period` to
  `currentQuarter()`. Snapshots the current template into `formSnapshot`, sets
  `reviewedBy = session admin`, status PLANNED, sends the planned email (sets
  `plannedEmailSentAt`).
- `GET /api/reviews?userId=` (admin) — list for an employee. `GET /api/reviews/mine`
  (any role) — the caller's own reviews.
- `GET /api/reviews/[id]` — admin, or the subject employee.
- `PUT /api/reviews/[id]` — role/stage-gated:
  - **Employee, own, status ≠ COMPLETED:** may set `selfAnswers` (sanitized to SELF keys);
    a `submit` flag transitions PLANNED → SELF_COMPLETED and stamps `selfCompletedAt`.
  - **Admin:** may set `managerAnswers` (sanitized to MANAGER keys), `agreements` (≤3),
    `period`, `plannedDate`; a `finalize` flag sets status COMPLETED + `completedAt` and, if a
    salary outcome `{ salaryMonthly, effectiveDate }` is supplied, creates a new `Contract`
    (copying the subject's current effective contract's `contractType`/`contractHours`/
    `jobTitle`/`ftePercentage`, `startDate = effectiveDate`, `endDate = null`, running
    `fillSalary`) and sets `resultingContractId`.
- `DELETE /api/reviews/[id]` (admin).
- Email: `sendReviewPlannedEmail(employee, review, settings)` in `src/lib/email.ts`, matching
  the existing HTML style; links to the "Mijn beoordelingen" page.

## 4. UI

- **`/beoordelingen` — "Mijn beoordelingen"** (all roles): lists the caller's reviews (period,
  status, planned date). For a PLANNED review, a self-eval form rendering only the SELF
  questions from `formSnapshot` (textarea per question + hint), with Save (draft) and Submit.
  For COMPLETED reviews, a read-only view of manager answers + agreements + any salary outcome.
- **`/personeel/[id]` — Beoordelingen section** (admin): list the employee's reviews + a "Nieuwe
  beoordeling plannen" action (period + planned date). Open a review to fill manager answers +
  agreements and Finalize (with the optional salary-outcome fields). Mirrors
  `contracts-client.tsx` patterns (react-hook-form, fetch, `router.refresh()`).
- **Dashboard card**: when the current user has a PLANNED review awaiting their self-eval, show
  a card linking to `/beoordelingen`. (Server component on the existing dashboard page.)
- **Template editor** (admin) under settings: edit sections/questions (title, label, hint,
  respondent, key), add/remove/reorder. Saves to `PUT /api/review-template`.
- **Sidebar:** add **"Mijn beoordelingen"** → `/beoordelingen` (all roles, e.g. in a top group
  or near Registratie). Add the template editor under **Instellingen** (admin), e.g.
  "Beoordelingssjabloon" → `/settings/beoordelingen` (or a tab on settings).

## 5. Out of scope (YAGNI / later)

- **Sub-project 4:** quarterly *auto-creation* of reviews and recurring reminders nudging admins
  to plan next quarter. This sub-project sends only the single "review planned" email.
- PDF export of a completed review (PDF infra exists; add later if wanted).
- Drawn signatures and employee acknowledgement/reaction (explicitly dropped).
- Numeric scores/ratings (the supplied forms are qualitative text only).

## Verification

- `npm test` green incl. new `src/lib/reviews.test.ts`; `npx tsc --noEmit` clean; `npm run build`
  succeeds.
- Manual: seed template; admin plans a review → employee receives email and sees it on
  `/beoordelingen` + a dashboard card; employee submits self-eval → SELF_COMPLETED; admin fills
  manager answers + 2 agreements and finalizes with a salary bump → review COMPLETED, a new
  contract appears under Contracten effective the chosen date, payroll for later months uses it;
  editing the template afterward does not change the finalized review (snapshot intact);
  employee cannot edit a COMPLETED review or write manager-only keys.
