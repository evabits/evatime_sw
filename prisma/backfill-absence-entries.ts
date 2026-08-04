import { PrismaClient } from "@prisma/client";
import { workingDaysBetween } from "../src/lib/working-days";
import { ABSENCE_PROJECT_NAMES, splitHoursOverDays } from "../src/lib/absence-entries";

const db = new PrismaClient();

async function main() {
  const write = process.argv.includes("--write");
  const jaar = new Date().getUTCFullYear();

  // Alleen het lopende kalenderjaar: oudere periodes zijn al afgerekend, en er
  // achteraf uren aan toevoegen verschuift historische urenoverzichten zonder
  // dat iemand daarom vroeg.
  const aanvragen = await db.absenceRequest.findMany({
    where: {
      status: "APPROVED",
      startDate: {
        gte: new Date(`${jaar}-01-01T00:00:00Z`),
        lte: new Date(`${jaar}-12-31T00:00:00Z`),
      },
    },
    orderBy: { startDate: "asc" },
    select: {
      id: true, userId: true, type: true, startDate: true, endDate: true,
      hours: true, description: true,
      user: { select: { name: true } },
      timeEntries: { select: { id: true } },
    },
  });

  const projecten = await db.project.findMany({ select: { id: true, name: true } });
  const projectPerNaam = new Map(projecten.map((p) => [p.name, p.id]));

  const plan: Array<{ id: string; userId: string; projectId: string; description: string | null; regels: Array<{ date: string; hours: number }>; label: string }> = [];
  const overgeslagen: string[] = [];
  const zonderProject: string[] = [];
  const zonderWerkdagen: string[] = [];

  for (const a of aanvragen) {
    const label = `${a.user.name} — ${ABSENCE_PROJECT_NAMES[a.type] ?? a.type} ${a.startDate.toISOString().slice(0, 10)} t/m ${a.endDate.toISOString().slice(0, 10)}`;

    // Herhaalbaar zonder schade: wat al regels heeft blijft ongemoeid.
    if (a.timeEntries.length > 0) { overgeslagen.push(label); continue; }

    const naam = ABSENCE_PROJECT_NAMES[a.type];
    const projectId = naam ? projectPerNaam.get(naam) : undefined;
    if (!projectId) { zonderProject.push(`${label}  (project "${naam ?? a.type}" ontbreekt)`); continue; }

    const dagen = workingDaysBetween(
      a.startDate.toISOString().slice(0, 10),
      a.endDate.toISOString().slice(0, 10),
    );
    if (dagen.length === 0) { zonderWerkdagen.push(label); continue; }

    plan.push({ id: a.id, userId: a.userId, projectId, description: a.description, regels: splitHoursOverDays(Number(a.hours), dagen), label });
  }

  console.log(`${write ? "SCHRIJVEN" : "DROOG (geen wijzigingen)"} — ${aanvragen.length} goedgekeurde aanvragen in ${jaar}\n`);
  for (const p of plan) {
    const totaal = p.regels.reduce((s, r) => s + r.hours, 0);
    console.log(`  ${p.regels.length} regel(s), ${totaal.toFixed(2)} uur  ${p.label}`);
  }

  if (overgeslagen.length > 0) {
    console.log(`\nAL GEDAAN — deze hebben al urenregels (${overgeslagen.length}):`);
    overgeslagen.forEach((l) => console.log(`  ${l}`));
  }
  if (zonderProject.length > 0) {
    console.log(`\nGEEN PROJECT — deze worden overgeslagen tot het project bestaat (${zonderProject.length}):`);
    zonderProject.forEach((l) => console.log(`  ${l}`));
  }
  if (zonderWerkdagen.length > 0) {
    console.log(`\nGEEN WERKDAGEN — de hele periode valt in een weekend (${zonderWerkdagen.length}):`);
    zonderWerkdagen.forEach((l) => console.log(`  ${l}`));
  }

  if (!write) {
    console.log("\nDroge run. Draai met --write om dit toe te passen.");
    return;
  }

  await db.$transaction(
    plan.flatMap((p) =>
      p.regels.map((r) =>
        db.timeEntry.create({
          data: {
            userId: p.userId,
            projectId: p.projectId,
            date: new Date(`${r.date}T00:00:00Z`),
            hours: r.hours,
            description: p.description,
            absenceRequestId: p.id,
          },
        }),
      ),
    ),
  );
  console.log(`\n${plan.length} aanvragen voorzien van urenregels.`);
}

main().catch(console.error).finally(() => db.$disconnect());
