/**
 * Bouwt het project/klant/tag/billable-deel van de Prisma where-clause voor
 * de rapport-API. Uren, ritten en uitgaven delen dezelfde klant/tag/billable
 * filters, maar niet dezelfde vorm: uren en ritten hebben altijd een
 * project (verplichte foreign key), uitgaven niet.
 *
 * Beide varianten bouwen ÉÉN `project`-conditie (customerId, tags, billable
 * samengevoegd in hetzelfde object) in plaats van los een klant/tag-filter
 * en een billable-filter te spreaden — twee spreads met dezelfde `project`
 * sleutel overschrijven elkaar in plaats van te combineren.
 */

export type ReportFilterParams = {
  projectId: string | null;
  customerId: string | null;
  tagIds: string[];
  billable: string | null;
};

type ProjectCondition = {
  customerId?: string;
  tags?: { some: { id: { in: string[] } } };
  billable?: boolean;
};

function buildProjectCondition({ customerId, tagIds, billable }: Omit<ReportFilterParams, "projectId">): ProjectCondition {
  return {
    ...(customerId ? { customerId } : {}),
    ...(tagIds.length > 0 ? { tags: { some: { id: { in: tagIds } } } } : {}),
    ...(billable === "true" ? { billable: true } : {}),
    ...(billable === "false" ? { billable: false } : {}),
  };
}

/** Voor uren en ritten: projectId is een verplichte kolom, dus nooit een OR met `projectId: null`. */
export function projectWhereForRequiredProject({ projectId, customerId, tagIds, billable }: ReportFilterParams) {
  if (projectId) {
    if (billable === "true") return { projectId, project: { billable: true } };
    if (billable === "false") return { projectId, project: { billable: false } };
    return { projectId };
  }
  const condition = buildProjectCondition({ customerId, tagIds, billable });
  return Object.keys(condition).length > 0 ? { project: condition } : {};
}

/**
 * Voor uitgaven: project is optioneel. Een uitgave zonder project is nooit
 * factureerbaar, dus telt mee bij billable=false — maar alleen als er geen
 * klant- of tagfilter actief is, want zo'n uitgave heeft geen klant en geen
 * tags om op te matchen.
 */
export function projectWhereForOptionalProject({ projectId, customerId, tagIds, billable }: ReportFilterParams) {
  if (projectId) {
    if (billable === "true") return { projectId, project: { billable: true } };
    if (billable === "false") return { projectId, project: { billable: false } };
    return { projectId };
  }
  const condition = buildProjectCondition({ customerId, tagIds, billable });
  const hasScopeFilter = Boolean(customerId) || tagIds.length > 0;
  if (billable === "false" && !hasScopeFilter) {
    return { OR: [{ project: condition }, { projectId: null }] };
  }
  return Object.keys(condition).length > 0 ? { project: condition } : {};
}
