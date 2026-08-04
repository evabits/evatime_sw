import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { z } from "zod";
import { handleError } from "@/lib/api";
import { canLeadStandup } from "@/lib/roles";

const schema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  userId: z.string().min(1),
  note: z.string(),
});

export async function PUT(req: Request) {
  try {
    const session = await auth();
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const role = (session.user as any)?.role ?? "EMPLOYEE";
    if (!canLeadStandup(role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const { date, userId, note } = schema.parse(await req.json());
    const dag = new Date(`${date}T00:00:00Z`);
    const tekst = note.trim();

    const user = await prisma.user.findUnique({ where: { id: userId }, select: { id: true } });
    if (!user) return NextResponse.json({ error: "Onbekende medewerker" }, { status: 400 });

    if (tekst === "") {
      // Leegmaken verwijdert de notitie in plaats van een leeg record achter te
      // laten. Bestaat de standup nog niet, dan valt er ook niets te verwijderen.
      const bestaande = await prisma.standup.findUnique({
        where: { date: dag },
        select: { id: true },
      });
      if (bestaande) {
        await prisma.standupNote.deleteMany({ where: { standupId: bestaande.id, userId } });
      }
      return NextResponse.json({ note: null });
    }

    // De standup wordt pas aangemaakt bij de eerste notitie: het scherm openen en
    // niets invullen laat geen lege bijeenkomst achter. `update: {}` zorgt dat een
    // bestaande standup zijn oorspronkelijke ledById houdt — wie hem als eerste
    // vastlegde, staat als leider genoteerd.
    const standup = await prisma.standup.upsert({
      where: { date: dag },
      create: { date: dag, ledById: session.user!.id! },
      update: {},
      select: { id: true },
    });

    const opgeslagen = await prisma.standupNote.upsert({
      where: { standupId_userId: { standupId: standup.id, userId } },
      create: { standupId: standup.id, userId, note: tekst },
      update: { note: tekst },
      select: { note: true },
    });

    return NextResponse.json({ note: opgeslagen.note });
  } catch (e) { return handleError(e); }
}
