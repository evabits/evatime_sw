// Prisma `where` fragment: hide archived rows unless includeArchived is set.
export function archivedWhere(includeArchived: boolean): { archivedAt?: null } {
  return includeArchived ? {} : { archivedAt: null };
}
