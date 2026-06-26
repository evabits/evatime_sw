# Km trip templates — design

## Goal

Let a user save a frequent kilometer trip (e.g. home–work, a regular client) as a
named, reusable **template**. When registering km the user can pick a template to
pre-fill the form, and can tick a checkbox to save the current entry as a new
template. Templates are **per-user**, never global. A dedicated page lets the user
rename and delete their templates.

## Data model

New Prisma model (created with `prisma db push`, no migration folder — see
`db_workflow`):

```prisma
model KmTemplate {
  id             String        @id @default(cuid())
  userId         String
  user           User          @relation(fields: [userId], references: [id])
  name           String
  projectId      String
  project        Project       @relation(fields: [projectId], references: [id])
  activityTypeId String?
  activityType   ActivityType? @relation(fields: [activityTypeId], references: [id])
  km             Decimal       @db.Decimal(8, 2)
  description    String?
  createdAt      DateTime      @default(now())
  updatedAt      DateTime      @updatedAt

  @@unique([userId, name])
}
```

- Add back-relations `kmTemplates KmTemplate[]` on `User`, `Project`, and
  `ActivityType`.
- Delete behaviour: default Prisma restrict, mirroring the existing `KmEntry`
  relations (a project/activity in use can't be hard-deleted). No new cascade.
- `@@unique([userId, name])` — a user can't have two templates with the same name;
  the create API maps a unique violation to HTTP 409.

## API

All routes use `auth()`, derive `userId` from the session, return `handleError(e)`
on failure, and serialize Decimals (`km`) the same way the rest of the app does.
Every query is scoped to the session `userId` so a user can only see/touch their
own templates (no admin override — templates are personal).

### `src/app/api/km/templates/route.ts`

- **GET** — list the current user's templates, ordered by `name asc`, including
  `project { id, name, customer { id, name } }` and `activityType { id, name }`.
- **POST** — body `{ name, projectId, activityTypeId?, km, description? }`
  (Zod: `name` min 1, `projectId` min 1, `activityTypeId` optional/nullable,
  `km` positive number, `description` optional). Creates with `userId` from
  session. On Prisma unique-constraint error (P2002) return
  `409 { error: "Naam bestaat al" }`.

### `src/app/api/km/templates/[id]/route.ts`

- **PUT** — body `{ name }` (rename only). Update `where: { id, userId }` so a user
  can only rename their own; if no row matched, 404. P2002 → 409.
- **DELETE** — delete `where: { id, userId }`; 404 if nothing matched.

## KM registration form changes

File: `src/components/km/km-entries-client.tsx`. The page server component
(`src/app/(app)/km/page.tsx`) additionally fetches the current user's templates
and passes them as a new `templates` prop. Templates are kept in component state so
a newly-saved one appears immediately.

1. **Apply dropdown** — a "Sjabloon" `Select` rendered above the form (full width).
   Choosing a template fills the form:
   - `selectedCustomerId` ← `template.project.customer.id` (so the project list
     filters correctly),
   - `projectId`, `activityTypeId`, `km`, `description` ← template values,
   - `date` stays today (today's date is the point of a daily trip log).
   The customer-change `useEffect` currently clears `projectId`/`activityTypeId`;
   applying a template must set those **after** the customer, so order the writes /
   use the existing flow carefully (set customer, then set the rest) to avoid the
   reset wiping them.

2. **Save-as-template checkbox** — a "Opslaan als sjabloon" checkbox next to the
   submit button (plain `<input type="checkbox">` + `Label`; no checkbox UI
   component exists yet and one isn't needed).

3. **Save flow** — `onSubmit` creates the km entry exactly as today (unchanged).
   After a successful **create** (not edit), if the checkbox is ticked, open a
   small dialog (`dialog.tsx`) with a name `Input` pre-filled from the entry's
   `description`. On confirm, `POST /api/km/templates` with the just-submitted
   project/activity/km/description + the entered name; on success prepend it to the
   template state and uncheck the box. A 409 shows an inline "Naam bestaat al"
   message in the dialog. Saving a template never blocks or fails the km entry —
   the entry is already created.

   The checkbox is only meaningful on create; hide/ignore it while `editing`.

## Management page

- Route `src/app/(app)/km/templates/page.tsx` — server component, `auth()`,
  fetches the session user's templates (same include as GET) and serializes them.
  No role gate beyond being logged in.
- Client `src/components/km/km-templates-client.tsx` — a `Card` + `Table` listing
  name / project / activity / km, with per-row **rename** (opens a dialog with a
  name `Input`, `PUT`) and **delete** (`confirm()` then `DELETE`, mirroring the km
  list's delete). Empty state mirrors the km list ("Geen sjablonen").
- Sidebar (`src/components/layout/sidebar.tsx`): add
  `{ href: "/km/templates", label: "Km-sjablonen", icon: <lucide icon> }` to the
  **first (non-admin) nav group**, immediately after the Kilometers item, with **no
  `roles` restriction** — every user manages their own. Pick an unused lucide icon
  (e.g. `BookMarked` or `MapPin`).

## Out of scope (deliberate)

- **Editing a template's trip details** (km/project/activity/description) on the
  manage page — rename + delete only. To change a trip, save a new template.
  Add full edit only if later requested.
- No sharing / global templates. No reordering or favourites.

## Testing

- Reuse the project's existing test approach. Add one focused unit check on the
  template POST Zod schema (valid payload parses, missing name / non-positive km
  rejected) — the smallest thing that fails if the contract breaks. No new
  framework or fixtures.
- Manual: save a template via the checkbox, confirm it appears in the dropdown,
  apply it (project/activity/km/description fill, date is today), rename + delete on
  the manage page, and confirm a second user does not see it.
