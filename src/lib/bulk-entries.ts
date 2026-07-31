export type BulkKind = "time" | "km" | "expense";

export type BulkAction =
  | { type: "project"; projectId: string }
  | { type: "billable"; billable: boolean }
  | { type: "user"; userId: string }
  | { type: "delete" };

/** De losse-regel-endpoints per soort, gedeeld door de dialoog en de bulkbalk. */
export const ENTRY_ENDPOINT: Record<BulkKind, string> = {
  time: "/api/time",
  km: "/api/km",
  expense: "/api/expenses",
};

/**
 * De where-clausule voor elke bulkmutatie. De invoiced-guard zit hier vast in,
 * zodat geen enkele aanroeper hem kan vergeten.
 */
export function buildBulkWhere(ids: string[]): { id: { in: string[] }; invoiced: false } {
  return { id: { in: ids }, invoiced: false };
}

export function buildBulkData(action: BulkAction): Record<string, string | boolean> {
  switch (action.type) {
    case "project": return { projectId: action.projectId };
    case "billable": return { billable: action.billable };
    case "user": return { userId: action.userId };
    case "delete": throw new Error("buildBulkData is niet bedoeld voor verwijderen");
  }
}
