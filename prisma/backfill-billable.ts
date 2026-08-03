import { PrismaClient } from "@prisma/client";
import { deriveProjectBillable } from "../src/lib/billable";

const db = new PrismaClient();

/**
 * De zeven projecten die vandaag zowel factureerbare als niet-factureerbare
 * boekingen hebben. Sleutel is de projectnaam; waarde is wat Project.billable
 * moet worden. Zonder een regel hier weigert het script te draaien, zodat
 * niemand per ongeluk historie omzet.
 *
 * Vul dit in vóór de --write-run.
 */
const KEUZES: Record<string, boolean> = {
  // "Assemblage koffer": false,
  // "H3X testen": false,
  // "Intern": false,
  // "Dutch IOT": true,
  // "DEVjig - EFRO": true,
  // "gadget": true,
  // "AUTOjig": true,
};

async function main() {
  const write = process.argv.includes("--write");
  const projects = await db.project.findMany({
    select: {
      id: true,
      name: true,
      customer: { select: { name: true } },
      timeEntries: { select: { billable: true } },
      kmEntries: { select: { billable: true } },
      expenses: { select: { billable: true } },
    },
    orderBy: { name: "asc" },
  });

  const plan: { id: string; label: string; value: boolean; reason: string }[] = [];
  const ontbreekt: string[] = [];

  for (const p of projects) {
    const label = `${p.customer?.name ?? "— geen klant —"} / ${p.name}`;
    const flags = [
      ...p.timeEntries.map((e) => e.billable),
      ...p.kmEntries.map((e) => e.billable),
      ...p.expenses.map((e) => e.billable),
    ];
    const result = deriveProjectBillable(flags, KEUZES[p.name]);
    if (result.status === "needs-choice") {
      ontbreekt.push(`${label}  (${flags.filter(Boolean).length} factureerbaar / ${flags.filter((f) => !f).length} niet)`);
      continue;
    }
    plan.push({ id: p.id, label, value: result.value, reason: result.reason });
  }

  console.log(`${write ? "SCHRIJVEN" : "DROOG (geen wijzigingen)"} — ${plan.length} projecten\n`);
  for (const r of plan) {
    console.log(`  ${r.value ? "factureerbaar    " : "niet factureerbaar"}  ${r.label}   [${r.reason}]`);
  }

  if (ontbreekt.length > 0) {
    console.error(`\nGEWEIGERD: ${ontbreekt.length} gemengde projecten zonder keuze in KEUZES:`);
    ontbreekt.forEach((l) => console.error("  " + l));
    console.error("\nVul KEUZES aan en draai opnieuw. Er is niets gewijzigd.");
    process.exitCode = 1;
    return;
  }

  if (!write) {
    console.log("\nDroge run. Draai met --write om dit toe te passen.");
    return;
  }

  for (const r of plan) {
    await db.project.update({ where: { id: r.id }, data: { billable: r.value } });
  }
  console.log(`\n${plan.length} projecten bijgewerkt.`);
}

main().finally(() => db.$disconnect());
