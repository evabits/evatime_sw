# Menu Restructure Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reorganize the sidebar's flat 17-item list into five role-aware sections (Dashboard / Registratie / Facturatie / Beheer / Instellingen) by replacing the `navGroups` array.

**Architecture:** Single-file change. `src/components/layout/sidebar.tsx` already renders `navGroups: NavGroup[]` with group-level and item-level role filtering and exact-match active state. We only replace the data array — no component logic, routes, pages, or APIs change. All required lucide icons are already imported.

**Tech Stack:** Next.js (App Router) client component, lucide-react icons, TypeScript. Verification via `npx tsc --noEmit` (run under Node 22) plus a manual role-visibility check; there is no React component test harness in this repo (vitest covers `src/lib/*` only), so no automated component test is added.

**Spec:** `docs/superpowers/specs/2026-06-26-menu-restructure-design.md`

---

### Task 1: Replace the navGroups array

**Files:**
- Modify: `src/components/layout/sidebar.tsx:45-73` (the `const navGroups: NavGroup[] = [ ... ];` block)

- [ ] **Step 1: Replace the array**

Replace the entire block at lines 45–73 (from `const navGroups: NavGroup[] = [` through the closing `];`) with:

```tsx
const navGroups: NavGroup[] = [
  {
    items: [
      { href: "/", label: "Dashboard", icon: LayoutDashboard },
    ],
  },
  {
    label: "Registratie",
    items: [
      { href: "/time", label: "Uren", icon: Clock },
      { href: "/km", label: "Kilometers", icon: Car },
      { href: "/expenses", label: "Uitgaven", icon: Receipt },
      { href: "/absence", label: "Afwezigheid", icon: Umbrella },
      { href: "/uren-overzicht", label: "Uren Overzicht", icon: CalendarCheck },
    ],
  },
  {
    label: "Facturatie",
    roles: ["ADMIN", "FINANCE"],
    items: [
      { href: "/invoices", label: "Facturen", icon: FileText, roles: ["ADMIN", "FINANCE"] },
      { href: "/quotes", label: "Offertes", icon: ClipboardList, roles: ["ADMIN"] },
      { href: "/reports", label: "Rapporten", icon: BarChart3, roles: ["ADMIN"] },
    ],
  },
  {
    label: "Beheer",
    roles: ["ADMIN"],
    items: [
      { href: "/customers", label: "Klanten", icon: Users },
      { href: "/projects", label: "Projecten", icon: FolderOpen },
      { href: "/activity-types", label: "Activiteiten", icon: Activity },
      { href: "/users", label: "Gebruikers", icon: UserCog },
      { href: "/payroll", label: "Loonverwerking", icon: Wallet },
    ],
  },
  {
    label: "Instellingen",
    items: [
      { href: "/km/templates", label: "Km-sjablonen", icon: BookMarked },
      { href: "/expense-categories", label: "Uitgavencategorieën", icon: Tag, roles: ["ADMIN"] },
      { href: "/settings", label: "Bedrijfsinstellingen", icon: Settings, roles: ["ADMIN"] },
    ],
  },
];
```

Notes for the engineer:
- Every icon used here (`LayoutDashboard`, `Clock`, `Car`, `Receipt`, `Umbrella`, `CalendarCheck`, `FileText`, `ClipboardList`, `BarChart3`, `Users`, `FolderOpen`, `Activity`, `UserCog`, `Wallet`, `BookMarked`, `Tag`, `Settings`) is already imported at the top of the file — do not add or remove imports.
- The ` Instellingen` group has **no group-level `roles`** on purpose, so employees can see `Km-sjablonen`. Item-level `roles` hide the admin-only items inside it.
- Do not touch anything below line 73 — the active-state logic (`item.href === "/" || item.href === "/km" ? pathname === item.href : pathname.startsWith(item.href)`) stays exactly as-is.

- [ ] **Step 2: Typecheck**

Run (Node 22 required per repo convention):

```bash
export NVM_DIR="$HOME/.nvm" && source "$NVM_DIR/nvm.sh" && nvm use 22 && npx tsc --noEmit
```

Expected: no errors (exit 0). The `NavItem`/`NavGroup` shapes are unchanged, so any error means a typo in the array.

- [ ] **Step 3: Manual role-visibility check**

Start the dev server (`npm run dev`) and verify each role. This is the real acceptance test — confirm against this matrix:

| Role | Visible groups & items |
|---|---|
| **ADMIN** | Dashboard · Registratie (Uren, Kilometers, Uitgaven, Afwezigheid, Uren Overzicht) · Facturatie (Facturen, Offertes, Rapporten) · Beheer (Klanten, Projecten, Activiteiten, Gebruikers, Loonverwerking) · Instellingen (Km-sjablonen, Uitgavencategorieën, Bedrijfsinstellingen) |
| **FINANCE** | Dashboard · Registratie (all) · Facturatie (Facturen only — no Offertes/Rapporten) · Instellingen (Km-sjablonen only). No Beheer. |
| **EMPLOYEE** | Dashboard · Registratie (all) · Instellingen (Km-sjablonen only). No Facturatie, no Beheer. |

Also confirm: navigating to `/km/templates` highlights **Km-sjablonen**, and `/km` highlights **Kilometers** (the two do not both light up).

- [ ] **Step 4: Commit**

```bash
git add src/components/layout/sidebar.tsx
git commit -m "feat: restructure sidebar into role-aware sections

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Self-Review

- **Spec coverage:** The five-group table, km-templates-visible-to-all decision, Bedrijfsinstellingen rename, Rapporten-under-Facturatie, and unchanged active-state logic are all reflected in Task 1. The spec's verification matrix maps to Step 3. ✅
- **Placeholders:** None — the full array is shown. ✅
- **Type consistency:** Uses existing `NavGroup`/`NavItem` fields (`label`, `roles`, `href`, `icon`) only; all icons pre-imported. ✅
