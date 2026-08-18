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

/**
 * Het gefactureerd-filter. Anders dan factureerbaar staat `invoiced` op de
 * registratie zelf en niet op het project, dus dit hoort in de where-clause
 * ernaast en niet in de `project`-conditie hierboven — die twee mogen elkaar
 * niet in de weg zitten. "factureerbaar én niet gefactureerd" is juist de
 * combinatie waar je naar zoekt als je wilt weten wat er nog op een factuur moet.
 */
export function invoicedWhere(invoiced: string | null | undefined) {
  if (invoiced === "true") return { invoiced: true };
  if (invoiced === "false") return { invoiced: false };
  return {};
}

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
