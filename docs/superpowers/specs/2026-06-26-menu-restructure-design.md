# Menu Restructure — Design

**Date:** 2026-06-26
**Status:** Approved
**Scope:** Sub-project 1 of the HR extension. Pure sidebar reorganization — no routes, pages, or APIs change.

## Goal

The sidebar is a flat list of ~17 items that has grown cluttered. Group items by what
the user is *doing*, move per-user/company "editing" items into a Settings group, and
leave a clean slot for a future HR/Personeel section.

## Context

- All navigation lives in `src/components/layout/sidebar.tsx` as a `navGroups: NavGroup[]`
  array. A `NavGroup` has an optional `label`, optional `roles`, and `items: NavItem[]`.
  Each `NavItem` has `href`, `label`, `icon`, optional `roles`.
- Group-level `roles` hides the whole group; item-level `roles` hides individual items.
  Both already filter correctly in the render loop — no component logic changes needed.
- Roles in the system: `ADMIN`, `FINANCE`, `EMPLOYEE`.

## The change

Replace the `navGroups` array. No other file changes. Icons used are already imported
(or swap to existing lucide imports already in the file).

| Group label | Group roles | Items (item-level roles) |
|---|---|---|
| *(none)* | — | Dashboard |
| **Registratie** | — | Uren, Kilometers, Uitgaven, Afwezigheid, Uren Overzicht |
| **Facturatie** | ADMIN, FINANCE | Facturen (ADMIN, FINANCE), Offertes (ADMIN), Rapporten (ADMIN) |
| **Beheer** | ADMIN | Klanten, Projecten, Activiteiten, Gebruikers, Loonverwerking |
| **Instellingen** | — | Km-sjablonen, Uitgavencategorieën (ADMIN), Bedrijfsinstellingen (ADMIN) |

### Notable moves
- **Km-sjablonen** (`/km/templates`) moves out of the main flow into **Instellingen**.
  It stays visible to all roles (per-user templates), so the Instellingen group has **no
  group-level `roles`** — visibility is controlled per item.
- **Bedrijfsinstellingen** is the existing `/settings` item, renamed from "Instellingen"
  to avoid clashing with the new group name. Still ADMIN-only.
- **Uitgavencategorieën** (`/expense-categories`) moves from Beheer into Instellingen,
  ADMIN-only.
- **Rapporten** moves under Facturatie (ADMIN-only item inside an ADMIN/FINANCE group —
  FINANCE will not see it, which matches today's ADMIN-only behavior).

### Unchanged
- The exact-match active-state logic for `/` and `/km` stays as-is (so `/km/templates`
  doesn't light up `/km`).
- All routes, pages, API handlers, and the page components themselves are untouched.

## Out of scope
- Collapsible/nested subsections (rejected: ~17 items fit fine as flat labeled groups).
- A consolidated tabbed `/settings` page (rejected: too much refactor for this step).
- The future **Personeel/HR** section — it will be added as a new group in a later
  sub-project (contracts, performance reviews).

## Verification
- Log in as ADMIN: all five groups visible with the items listed above.
- Log in as EMPLOYEE: sees Dashboard, Registratie (incl. Uren Overzicht), and Instellingen
  with only Km-sjablonen. No Facturatie/Beheer; no Uitgavencategorieën/Bedrijfsinstellingen.
- Log in as FINANCE: also sees Facturatie with Facturen only (no Offertes/Rapporten).
- `/km/templates` active state highlights Km-sjablonen, not Kilometers.
