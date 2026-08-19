import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { serialize } from "@/lib/utils";
import { canManagePlanning } from "@/lib/roles";
import { PlanningClient } from "@/components/planning/planning-client";

export default async function PlanningPage() {
  const session = await auth();
  if (!canManagePlanning((session?.user as any)?.role ?? "EMPLOYEE")) redirect("/");

  const projects = await prisma.project.findMany({
    where: { archivedAt: null, status: "ACTIVE" },
    select: {
      id: true,
      name: true,
      plannedStart: true,
      plannedEnd: true,
      customer: { select: { name: true } },
      tasks: {
        // id als tiebreaker en niet createdAt: swapOrder in lib/planning.ts
        // hernummert de hele lijst op basis van diezelfde sortering, en na een
        // projectsamenvoeging kunnen sortOrder-waarden dubbel voorkomen. Wijkt
        // deze orderBy af van swapOrder, dan schudt de eerste pijltjesklik erna
        // taken door elkaar die de beheerder niet aanraakte.
        orderBy: [{ sortOrder: "asc" }, { id: "asc" }],
        select: { id: true, name: true, startDate: true, endDate: true, sortOrder: true },
      },
    },
  });

  return <PlanningClient projects={serialize(projects)} />;
}
