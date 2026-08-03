import { PrismaClient } from "@prisma/client";

const db = new PrismaClient();

async function main() {
  const write = process.argv.includes("--write");

  const projects = await db.project.findMany({
    select: {
      id: true,
      name: true,
      archivedAt: true,
      customer: { select: { name: true } },
      timeEntries: { select: { userId: true } },
      kmEntries: { select: { userId: true } },
      expenses: { select: { userId: true } },
    },
    orderBy: { name: "asc" },
  });

  const plan: { projectId: string; label: string; userIds: string[] }[] = [];
  const leeg: string[] = [];

  for (const p of projects) {
    const label = `${p.customer?.name ?? "— geen klant —"} / ${p.name}${p.archivedAt ? " (gearchiveerd)" : ""}`;
    const boekers = new Set<string>([
      ...p.timeEntries.map((e) => e.userId),
      ...p.kmEntries.map((e) => e.userId),
      ...p.expenses.map((e) => e.userId),
    ]);
    if (boekers.size === 0) { leeg.push(label); continue; }
    plan.push({ projectId: p.id, label, userIds: [...boekers] });
  }

  console.log(`${write ? "SCHRIJVEN" : "DROOG (geen wijzigingen)"} — ${plan.length} projecten\n`);
  for (const r of plan) {
    console.log(`  ${String(r.userIds.length).padStart(2)} deelnemer(s)  ${r.label}`);
  }

  if (leeg.length > 0) {
    console.log(`\nZONDER BOEKINGEN — deze krijgen geen deelnemers en moeten handmatig ingevuld worden (${leeg.length}):`);
    leeg.forEach((l) => console.log("  " + l));
  }

  if (!write) {
    console.log("\nDroge run. Draai met --write om dit toe te passen.");
    return;
  }

  await db.$transaction([
    ...plan.map((r) => db.projectMember.deleteMany({ where: { projectId: r.projectId } })),
    ...plan.flatMap((r) =>
      r.userIds.map((userId) =>
        db.projectMember.create({ data: { projectId: r.projectId, userId } }),
      ),
    ),
  ]);
  console.log(`\n${plan.length} projecten bijgewerkt.`);
}

main().catch(console.error).finally(() => db.$disconnect());
