// Project links attached now but absent from the new selection = being removed.
export function removedProjectIds(current: string[], next: string[]): string[] {
  const keep = new Set(next);
  return current.filter((id) => !keep.has(id));
}
