import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { z } from "zod";
import { handleError } from "@/lib/api";
import { isAdmin } from "@/lib/roles";
import { projectMergeDenialReason } from "@/lib/projects";

const schema = z.object({ targetId: z.string().min(1) });

/**
 * Gegooid binnen de transactie als er na de updateMany's nog een gefactureerde
 * uitgave op de bron staat. Expense.projectId is optioneel (onDelete: SetNull),
 * dus in tegenstelling tot TimeEntry en KmEntry blokkeert dat het verwijderen
 * hieronder niet vanzelf — de uitgave zou stilletjes zijn project kwijtraken.
 * Deze klasse bestaat zodat de route dit geval kan onderscheiden van een echte
 * serverfout en er een schone 400 van kan maken.
 */
class GefactureerdTussentijdsError extends Error {}

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

    const kies = { id: true, status: true, archivedAt: true, templateId: true } as const;
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
    //
    // Dat zijn de vier registratiemodellen. ProjectMember wordt hieronder
    // eerst gekopieerd naar het doel en verdwijnt daarna vanzelf mee met het
    // verwijderen van de bron (Cascade); ProjectTask wordt verplaatst, want
    // planning hoort bij het werk en niet bij de prijsafspraken.
    //
    // TaskDependency verhuist niet apart mee en hoeft dat ook niet: een
    // koppeling wijst naar twee taken en niet naar een project, en beide
    // uiteinden verhuizen hierboven samen. Wie die regel ooit weghaalt of
    // splitst, breekt daarmee ook de afhankelijkheden.
    //
    // Twee andere relaties op Project zijn ook Cascade en gaan bewust NIET mee:
    // ProjectLevelRate en de tags-koppeling worden stilletjes verwijderd, niet
    // verplaatst. Dat is geen gat maar het
    // ontwerp — een conceptproject kan tarieven en tags hebben (admin-only, zie
    // projects/route.ts), maar na het samenvoegen gelden gewoon de tarieven en
    // tags van het doelproject; verplaatste uren blijven geprijsd volgens de
    // rateOverride op de regel zelf of de kaart van het doel, nooit die van de
    // verdwenen bron.
    const verplaatst = await prisma.$transaction(async (tx) => {
      const leden = await tx.projectMember.findMany({
        where: { projectId: id },
        select: { userId: true },
      });

      // invoiced: false in elke where — zie het commentaar boven de transactie.
      // KmTemplate heeft geen invoiced-veld, die verhuist onvoorwaardelijk.
      const uren = await tx.timeEntry.updateMany({
        where: { projectId: id, invoiced: false },
        data: { projectId: targetId },
      });
      const km = await tx.kmEntry.updateMany({
        where: { projectId: id, invoiced: false },
        data: { projectId: targetId },
      });
      const sjablonen = await tx.kmTemplate.updateMany({ where: { projectId: id }, data: { projectId: targetId } });

      // Taken zijn planning, geen prijsafspraak: ze horen bij de dingen die
      // meeverhuizen (uren, ritten, sjablonen, deelnemers) en niet bij de
      // dingen die stilletjes verdwijnen (tarieven, tags). Zonder deze regel
      // neemt de cascade op het verwijderen van de bron ze mee het graf in.
      //
      // De sortOrder van bron en doel lopen daarna door elkaar. Dat is
      // aanvaardbaar: alle taken staan er, en swapOrder hernummert de hele
      // lijst zodra je er één verplaatst.
      const taken = await tx.projectTask.updateMany({
        where: { projectId: id },
        data: { projectId: targetId },
      });
      const uitgaven = await tx.expense.updateMany({
        where: { projectId: id, invoiced: false },
        data: { projectId: targetId },
      });

      // Zie GefactureerdTussentijdsError hierboven: TimeEntry en KmEntry vangt
      // de foreign key straks vanzelf af bij het verwijderen, Expense niet.
      const achtergeblevenUitgaven = await tx.expense.count({ where: { projectId: id, invoiced: true } });
      if (achtergeblevenUitgaven > 0) {
        throw new GefactureerdTussentijdsError(
          "Er zijn tussentijds uitgaven gefactureerd; samenvoegen afgebroken",
        );
      }

      // skipDuplicates omdat de sleutel van ProjectMember [projectId, userId]
      // is: de aanvrager kan al deelnemer van het doel zijn, en dat is precies
      // het geval dat deze functie moet afvangen.
      const { count: leden_toegevoegd } = await tx.projectMember.createMany({
        data: leden.map((l) => ({ projectId: targetId, userId: l.userId })),
        skipDuplicates: true,
      });

      await tx.project.delete({ where: { id } });

      return {
        timeEntries: uren.count,
        kmEntries: km.count,
        kmTemplates: sjablonen.count,
        tasks: taken.count,
        expenses: uitgaven.count,
        members: leden_toegevoegd,
      };
    });

    return NextResponse.json(verplaatst);
  } catch (e) {
    if (e instanceof GefactureerdTussentijdsError) {
      return NextResponse.json({ error: e.message }, { status: 400 });
    }
    return handleError(e);
  }
}
