/**
 * Canonical role definitions for EvaTime.
 *
 * When adding a new feature, check this file to understand what each role
 * should be able to do, then add the appropriate permission here and enforce
 * it in both the API route and the UI.
 */

export const ROLES = {
  ADMIN: {
    label: "Beheerder",
    description:
      "Full access. Manages users, roles, settings, expense categories, and all data for all users.",
    can: {
      manageUsers: true,
      manageSettings: true,
      manageExpenseCategories: true,
      viewAllTimeKm: true,               // entries of all users
      manageAllTimeKm: true,
      viewAllExpenses: true,             // expenses of all users
      viewAllReimbursableExpenses: true,
      manageAllExpenses: true,
      createEditInvoices: true,
      viewInvoices: "all" as const,      // DRAFT / SENT / PAID / CANCELLED
      viewReports: true,
    },
  },
  FINANCE: {
    label: "Financieel",
    description:
      "Sees SENT and PAID invoices (read-only). Manages own time, km and expenses. " +
      "Sees all reimbursable expenses from all users (read-only) for reimbursement processing.",
    can: {
      manageUsers: false,
      manageSettings: false,
      manageExpenseCategories: false,
      viewAllTimeKm: false,              // own entries only
      manageAllTimeKm: false,
      viewAllExpenses: false,            // own expenses only (except reimbursable)
      viewAllReimbursableExpenses: true, // all users' reimbursable expenses, read-only
      manageAllExpenses: false,
      createEditInvoices: false,
      viewInvoices: "sent_paid" as const,
      viewReports: false,
    },
  },
  EMPLOYEE: {
    label: "Medewerker",
    description:
      "Manages own time, km and expenses. No invoice or report access.",
    can: {
      manageUsers: false,
      manageSettings: false,
      manageExpenseCategories: false,
      viewAllTimeKm: false,              // own entries only
      manageAllTimeKm: false,
      viewAllExpenses: false,
      viewAllReimbursableExpenses: false,
      manageAllExpenses: false,
      createEditInvoices: false,
      viewInvoices: "none" as const,
      viewReports: false,
    },
  },
} as const;

export type RoleKey = keyof typeof ROLES;

// ─── Helpers used in API routes and UI ─────────────────────────────────────

export function isAdmin(role: string): boolean {
  return role === "ADMIN";
}

export function isAdminOrFinance(role: string): boolean {
  return role === "ADMIN" || role === "FINANCE";
}

export function canViewInvoices(role: string): boolean {
  return role === "ADMIN" || role === "FINANCE";
}

export function canEditInvoices(role: string): boolean {
  return role === "ADMIN";
}

export function canViewAllEntries(role: string): boolean {
  return role === "ADMIN";
}

export function canManageExpenseCategories(role: string): boolean {
  return role === "ADMIN";
}

export function canViewReimbursements(role: string): boolean {
  return role === "ADMIN" || role === "FINANCE";
}

export function getRoleLabel(role: string): string {
  return ROLES[role as RoleKey]?.label ?? role;
}
