import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { z } from "zod";
import { handleError, findTagByName } from "@/lib/api";
import { isAdmin } from "@/lib/roles";
import { isReservedTagName } from "@/lib/tags";

const schema = z.object({
  name: z.string().trim().min(1),
  mergeInto: z.string().min(1).optional(),
});

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await auth();
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const role = (session.user as any)?.role ?? "EMPLOYEE";
    if (!isAdmin(role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    const { id } = await params;

    const { name, mergeInto } = schema.parse(await req.json());

    const tag = await prisma.tag.findUnique({ where: { id }, select: { id: true, name: true } });
    if (!tag) return NextResponse.json({ error: "Not found" }, { status: 404 });

    // De loonverwerking zoekt op deze naam. Hernoemen laat de WBSO-uren stil
    // naar nul gaan; samenvoegen wist de tag helemaal, met hetzelfde gevolg.
    // Deze guard dekt allebei, want beide lopen door deze route.
    if (isReservedTagName(tag.name)) {
      return NextResponse.json(
        { error: "Deze tag wordt gebruikt door de loonverwerking en kan niet hernoemd worden" },
        { status: 400 },
      );
    }

    if (mergeInto) {
      if (mergeInto === id) {
        return NextResponse.json({ error: "Een tag kan niet met zichzelf samengevoegd worden" }, { status: 400 });
      }
      const doel = await prisma.tag.findUnique({ where: { id: mergeInto }, select: { id: true } });
      if (!doel) return NextResponse.json({ error: "Onbekende tag om naar samen te voegen" }, { status: 400 });

      const bron = await prisma.tag.findUnique({
        where: { id },
        select: { projects: { select: { id: true } } },
      });

      // De relatie is een set: `connect` op een project dat de doeltag al heeft
      // is een no-op, dus een project dat aan beide tags hing komt er één keer
      // uit. Alles in één transactie, zodat de brontag nooit verdwijnt terwijl
      // zijn projecten nog niet verhuisd zijn.
      await prisma.$transaction([
        ...(bron?.projects ?? []).map((p) =>
          prisma.project.update({
            where: { id: p.id },
            data: { tags: { connect: { id: mergeInto } } },
          }),
        ),
        prisma.tag.delete({ where: { id } }),
      ]);

      return NextResponse.json({ merged: true, into: mergeInto });
    }

    const bestaand = await findTagByName(name);
    if (bestaand && bestaand.id !== id) {
      const projectCount = await prisma.project.count({ where: { tags: { some: { id: bestaand.id } } } });
      // Geen fout maar een vraag: dit is precies het geval waarin samenvoegen
      // het enige zinnige antwoord is. Er is nog niets gewijzigd.
      return NextResponse.json({ conflict: { id: bestaand.id, name: bestaand.name, projectCount } });
    }

    const updated = await prisma.tag.update({ where: { id }, data: { name } });
    return NextResponse.json(updated);
  } catch (e: any) {
    if (e?.code === "P2002") {
      return NextResponse.json({ error: "Er bestaat al een tag met deze naam" }, { status: 400 });
    }
    return handleError(e);
  }
}
