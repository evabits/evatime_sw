import { prisma } from "@/lib/prisma";
import { cycleThrough } from "@/lib/task-dependencies";

/**
 * Keurt de gevraagde koppelingen van één taak. Geeft een Nederlandse melding
 * terug, of `null` als het mag.
 *
 * Alle vier de regels staan hier en niet in het scherm: het scherm verbergt wat
 * niet mag, maar de route is wat het tegenhoudt.
 *
 * `taskId` is leeg bij een nieuwe taak — die kan per definitie nog nergens in
 * een kringloop zitten, dus dan vervalt die controle.
 */
export async function dependencyError(
  projectId: string,
  taskId: string | null,
  dependsOnIds: string[],
): Promise<string | null> {
  if (dependsOnIds.length === 0) return null;
  if (taskId && dependsOnIds.includes(taskId)) return "Een taak kan niet op zichzelf wachten";

  const doelen = await prisma.projectTask.findMany({
    where: { id: { in: dependsOnIds } },
    select: { id: true, projectId: true, name: true },
  });
  if (doelen.length !== dependsOnIds.length) return "Een van de gekozen taken bestaat niet";
  if (doelen.some((d) => d.projectId !== projectId)) {
    return "Een taak kan alleen wachten op taken van hetzelfde project";
  }

  if (!taskId) return null;

  // De bestaande koppelingen van het project, met die van deze taak eruit:
  // die worden immers vervangen door wat er nu binnenkomt.
  const bestaand = await prisma.taskDependency.findMany({
    where: { task: { projectId }, NOT: { taskId } },
    select: { taskId: true, dependsOnId: true },
  });
  const namen = new Map<string, string>();
  const taken = await prisma.projectTask.findMany({
    where: { projectId },
    select: { id: true, name: true },
  });
  for (const t of taken) namen.set(t.id, t.name);

  // Eén voor één toevoegen, want twee nieuwe koppelingen kunnen samen een ring
  // sluiten die geen van beide alleen sluit.
  const samen = [...bestaand];
  for (const dependsOnId of dependsOnIds) {
    const keten = cycleThrough(samen, taskId, dependsOnId);
    if (keten) {
      const leesbaar = keten.map((id) => namen.get(id) ?? "?").join(" → ");
      return `Dit zou een kringloop sluiten: ${leesbaar}`;
    }
    samen.push({ taskId, dependsOnId });
  }

  return null;
}
