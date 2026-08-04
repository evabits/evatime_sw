import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { z } from "zod";
import { handleError } from "@/lib/api";
import { isAdmin } from "@/lib/roles";

const schema = z.object({
  ids: z.array(z.string().min(1)).min(1).max(500),
  tagId: z.string().min(1),
  action: z.enum(["add", "remove"]),
});

export async function POST(req: Request) {
  try {
    const session = await auth();
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const role = (session.user as any)?.role ?? "EMPLOYEE";
    if (!isAdmin(role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const { ids, tagId, action } = schema.parse(await req.json());

    const tag = await prisma.tag.findUnique({ where: { id: tagId }, select: { id: true } });
    if (!tag) return NextResponse.json({ error: "Onbekende tag" }, { status: 400 });

    // Alleen de projecten die daadwerkelijk veranderen: bij "add" die de tag nog
    // niet hebben, bij "remove" die hem wel hebben. Zo telt count wat er echt is
    // gewijzigd, en niet hoeveel ids er binnenkwamen.
    const teWijzigen = await prisma.project.findMany({
      where: {
        id: { in: ids },
        tags: action === "add" ? { none: { id: tagId } } : { some: { id: tagId } },
      },
      select: { id: true },
    });

    if (teWijzigen.length > 0) {
      // updateMany kan geen relaties wijzigen, dus per project een update —
      // wel in één transactie, zodat het alles of niets is.
      await prisma.$transaction(
        teWijzigen.map((p) =>
          prisma.project.update({
            where: { id: p.id },
            data: {
              tags: action === "add" ? { connect: { id: tagId } } : { disconnect: { id: tagId } },
            },
          }),
        ),
      );
    }

    return NextResponse.json({ count: teWijzigen.length });
  } catch (e) { return handleError(e); }
}
