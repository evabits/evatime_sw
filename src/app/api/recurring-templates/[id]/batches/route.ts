import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { z } from "zod";
import { handleError, projectNameTakenError } from "@/lib/api";
import { canManageRecurringBatches } from "@/lib/roles";
import { suggestBatchName } from "@/lib/recurring";

const schema = z.object({
  name: z.string().trim().min(1).optional(),
});

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await auth();
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const role = (session.user as any)?.role ?? "EMPLOYEE";
    if (!canManageRecurringBatches(role)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { id } = await params;
    const data = schema.parse(await req.json());

    const sjabloon = await prisma.recurringTemplate.findUnique({ where: { id } });
    if (!sjabloon) return NextResponse.json({ error: "Not found" }, { status: 404 });
    if (sjabloon.archivedAt) {
      return NextResponse.json(
        { error: "Dit sjabloon is gearchiveerd en kan geen nieuwe batches meer starten" },
        { status: 400 },
      );
    }

    const naam = data.name || suggestBatchName(sjabloon.name, new Date());

    // Project.name is uniek; handleError vertaalt de P2002 hierop naar een
    // verwarrende "Deze waarde is al in gebruik". Deze controle vooraf geeft
    // de melding die hier wél klopt.
    const conflict = await projectNameTakenError(naam);
    if (conflict) return conflict;

    // De deelnemers van de vorige batch uit hetzelfde sjabloon overnemen: het is
    // elke keer hetzelfde clubje dat het werk doet. Zonder deelnemers is het
    // project onboekbaar — het urenscherm toont alleen projecten waar je lid van
    // bent, en de urenroute weigert een niet-deelnemer, ook een beheerder. Is er
    // nog geen vorige batch, dan is de aanvrager het startpunt, net als bij een
    // gewoon nieuw project.
    const vorige = await prisma.project.findFirst({
      where: { templateId: sjabloon.id },
      orderBy: { createdAt: "desc" },
      select: { members: { select: { userId: true } } },
    });
    const leden = vorige?.members.length
      ? vorige.members.map((m) => m.userId)
      : [session.user!.id!];

    const batch = await prisma.project.create({
      data: {
        name: naam,
        customerId: sjabloon.customerId,
        status: "ACTIVE",
        templateId: sjabloon.id,
        // De uren op een batch zijn interne kosten: de factuur komt uit het
        // sjabloontarief, niet uit de uren. Zou de batch factureerbaar staan,
        // dan kwamen die uren náást de gegenereerde factuur nog eens terug als
        // "nog te factureren" bij dezelfde klant.
        billable: false,
        members: { create: leden.map((lid) => ({ userId: lid })) },
      },
    });
    return NextResponse.json(batch, { status: 201 });
  } catch (e) { return handleError(e); }
}
