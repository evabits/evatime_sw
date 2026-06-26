# Concept Projects — Design

## Goal

Let employees create a project themselves with only a **name** and one or more
**activities**. The project is created in a `CONCEPT` state and is immediately
usable for logging hours, so employees don't have to wait for an admin. An admin
later fills in the customer, rates, and other fields and flips the project to
`ACTIVE` to finalize it. Hours logged in the meantime stay attached.

## Decisions

- Concept projects are **visible to everyone** on creation (not private to the
  creator).
- Employees can attach **one or more** activities at creation.
- Admins discover concept projects via a **badge + status filter** on the
  existing admin projects page. No notifications or approval queue.
- No separate concept-project model and no separate admin screen — reuse the
  existing `Project` model, projects page, and edit dialog.

## Changes

### 1. Schema (`prisma/schema.prisma`)

- Add `CONCEPT` to the `ProjectStatus` enum.
- Make `Project.customerId` and the `customer` relation **nullable** (a concept
  project has no customer yet). This is the only structural change.
- Run `prisma migrate dev`.

### 2. Employee creation UI (time page)

- Add a "+ Nieuw project" button next to the project picker in
  `src/components/time/time-entries-client.tsx`.
- It opens a small dialog with: **name** (text input) and **activities**
  (multi-select from the existing `ActivityType` list). No customer, no rates —
  employees never see rate fields.
- On submit, POST to `POST /api/projects` with `status: "CONCEPT"`, the chosen
  activity ids, and no customer/rate fields.
- On success, add the returned project to the in-memory `projects` list and
  auto-select it so the employee can log hours immediately.

### 3. API (`src/app/api/projects/route.ts` POST)

- `customerId` becomes optional in the Zod schema.
- Add `CONCEPT` to the status enum.
- Accept `activityTypeIds: string[]` (optional) and link them to the project via
  the `ActivityTypeProject` join table.
- **Server-side guard:** non-admin users may only create projects where
  `status === "CONCEPT"` and no `customerId` / rate fields are present. Reject
  anything else (the route currently has no role gate; this adds one without
  blocking admins).

### 4. Time page wiring (`src/app/(app)/time/page.tsx` + client)

- Load projects with `where: { status: { in: ["ACTIVE", "CONCEPT"] } }` so
  concept projects appear for logging.
- Guard the client-side customer filter (currently
  `projects.filter((p) => p.customer.id === selectedCustomerId)` around line
  108) to handle null customer: `p.customer?.id === selectedCustomerId`.
- Show a small "(concept)" label in the project dropdown so users know rates
  aren't set yet.

### 5. Admin finalize (existing projects page — no new screen)

- In `src/components/projects/projects-client.tsx`: add `CONCEPT` to
  `statusLabel` and `statusVariant` (badge), to the status `<Select>` options,
  and add a status filter so admins can list concept projects.
- Admin opens the existing edit dialog, fills in customer + rates, switches
  status from `CONCEPT` to `ACTIVE`. Hours already logged stay attached —
  nothing to migrate.

## Edge cases

- A concept project has no customer until finalized, so it naturally can't be
  invoiced; the badge/filter surfaces these to admins.
- Employees can only **create** concept projects, not edit existing ones (no
  employee edit UI is added).
- `serialize`/UI already handle null customer in places (e.g. the edit-entry
  path); we extend that guard to the one unguarded project filter.

## Out of scope (YAGNI)

Approval queue, notifications, a separate concept-project model, and per-creator
ownership. Add only if the badge + filter proves insufficient.
