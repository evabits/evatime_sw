import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { z } from "zod";
import { canManagePlanning } from "@/lib/roles";
import { handleError } from "@/lib/api";
import { validateDateRange, swapOrder } from "@/lib/planning";

const updateSchema = z.object({
  name: z.string().trim().min(1),
  startDate: z.string().min(1),
  endDate: z.string().min(1),
});

const moveSchema = z.object({ move: z.enum(["up", "down"]) });

/** Ingelogd, beheerder, en de taak bestaat. Geeft de taak terug of een antwoord om te retourneren. */
async function taakOfFout(id: string) {
  const session = await auth();
  if (!session) return { fout: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  const role = (session.user as any)?.role ?? "EMPLOYEE";
  if (!canManagePlanning(role)) return { fout: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };

  const taak = await prisma.projectTask.findUnique({ where: { id } });
  if (!taak) return { fout: NextResponse.json({ error: "Not found" }, { status: 404 }) };
  return { taak };
}

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const { taak, fout } = await taakOfFout(id);
    if (fout) return fout;

    const data = updateSchema.parse(await req.json());
    const datumFout = validateDateRange(data.startDate, data.endDate);
    if (datumFout) return NextResponse.json({ error: datumFout }, { status: 400 });

    const bijgewerkt = await prisma.projectTask.update({
      where: { id: taak!.id },
      data: {
        name: data.name,
        startDate: new Date(data.startDate),
        endDate: new Date(data.endDate),
      },
    });
    return NextResponse.json(bijgewerkt);
  } catch (e) { return handleError(e); }
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const { taak, fout } = await taakOfFout(id);
    if (fout) return fout;

    const { move } = moveSchema.parse(await req.json());

    const broertjes = await prisma.projectTask.findMany({
      where: { projectId: taak!.projectId },
      select: { id: true, sortOrder: true },
    });

    const nieuweVolgorde = swapOrder(broertjes, id, move);
    // Leeg betekent: staat al boven- of onderaan. Geen fout, gewoon niets doen.
    if (nieuweVolgorde.length === 0) return NextResponse.json({ moved: false });

    // In één transactie, anders kan een halve hernummering achterblijven en
    // staan er twee taken op dezelfde plek.
    await prisma.$transaction(
      nieuweVolgorde.map((t) =>
        prisma.projectTask.update({ where: { id: t.id }, data: { sortOrder: t.sortOrder } }),
      ),
    );
    return NextResponse.json({ moved: true });
  } catch (e) { return handleError(e); }
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const { taak, fout } = await taakOfFout(id);
    if (fout) return fout;

    await prisma.projectTask.delete({ where: { id: taak!.id } });
    return NextResponse.json({ success: true });
  } catch (e) { return handleError(e); }
}
