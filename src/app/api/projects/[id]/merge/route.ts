import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { z } from "zod";
import { handleError } from "@/lib/api";
import { isAdmin } from "@/lib/roles";
import { projectMergeDenialReason } from "@/lib/projects";

const schema = z.object({ targetId: z.string().min(1) });

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await auth();
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const role = (session.user as any)?.role ?? "EMPLOYEE";
    // Het scherm toont deze knop alleen aan een admin, maar een scherm is geen
    // beveiliging: dit verplaatst geboekte uren tussen projecten.
    if (!isAdmin(role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const { id } = await params;
    const { targetId } = schema.parse(await req.json());

    const kies = { id: true, status: true, archivedAt: true } as const;
    const [source, target] = await Promise.all([
      prisma.project.findUnique({ where: { id }, select: kies }),
      prisma.project.findUnique({ where: { id: targetId }, select: kies }),
    ]);

    const [timeEntries, kmEntries, expenses] = await Promise.all([
      prisma.timeEntry.count({ where: { projectId: id, invoiced: true } }),
      prisma.kmEntry.count({ where: { projectId: id, invoiced: true } }),
      prisma.expense.count({ where: { projectId: id, invoiced: true } }),
    ]);

    const denial = projectMergeDenialReason(source, target, { timeEntries, kmEntries, expenses });
    if (denial) return NextResponse.json({ error: denial }, { status: 400 });

    // Alles in één transactie, met het verwijderen als laatste stap: klapt dat
    // eruit, dan staan de registraties weer bij de bron in plaats van half
    // verplaatst.
    //
    // Het verwijderen is meteen het vangnet. TimeEntry, KmEntry en KmTemplate
    // hebben een verplichte projectkoppeling zonder onDelete, wat in Prisma
    // neerkomt op Restrict: blijft er één achter, dan weigert de database het
    // verwijderen en rolt alles terug. Expense is de uitzondering — zijn
    // projectId is optioneel, dus daar geldt SetNull en zou een achtergebleven
    // uitgave stilletjes zijn project kwijtraken. Daarom staat hij hier
    // expliciet bij, niet omdat de huidige data hem bevat.
    const verplaatst = await prisma.$transaction(async (tx) => {
      const leden = await tx.projectMember.findMany({
        where: { projectId: id },
        select: { userId: true },
      });

      const uren = await tx.timeEntry.updateMany({ where: { projectId: id }, data: { projectId: targetId } });
      const km = await tx.kmEntry.updateMany({ where: { projectId: id }, data: { projectId: targetId } });
      const sjablonen = await tx.kmTemplate.updateMany({ where: { projectId: id }, data: { projectId: targetId } });
      const uitgaven = await tx.expense.updateMany({ where: { projectId: id }, data: { projectId: targetId } });

      // skipDuplicates omdat de sleutel van ProjectMember [projectId, userId]
      // is: de aanvrager kan al deelnemer van het doel zijn, en dat is precies
      // het geval dat deze functie moet afvangen.
      let leden_toegevoegd = 0;
      if (leden.length > 0) {
        const { count } = await tx.projectMember.createMany({
          data: leden.map((l) => ({ projectId: targetId, userId: l.userId })),
          skipDuplicates: true,
        });
        leden_toegevoegd = count;
      }

      await tx.project.delete({ where: { id } });

      return {
        timeEntries: uren.count,
        kmEntries: km.count,
        kmTemplates: sjablonen.count,
        expenses: uitgaven.count,
        members: leden_toegevoegd,
      };
    });

    return NextResponse.json(verplaatst);
  } catch (e) { return handleError(e); }
}
