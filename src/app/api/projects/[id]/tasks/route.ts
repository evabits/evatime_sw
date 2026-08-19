import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { z } from "zod";
import { canManagePlanning } from "@/lib/roles";
import { handleError } from "@/lib/api";
import { validateDateRange } from "@/lib/planning";

const schema = z.object({
  name: z.string().trim().min(1),
  // Verplicht, anders van beide: een taak zonder datums kun je niet tekenen.
  startDate: z.string().min(1),
  endDate: z.string().min(1),
});

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await auth();
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const role = (session.user as any)?.role ?? "EMPLOYEE";
    if (!canManagePlanning(role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const { id } = await params;
    const data = schema.parse(await req.json());

    const datumFout = validateDateRange(data.startDate, data.endDate);
    if (datumFout) return NextResponse.json({ error: datumFout }, { status: 400 });

    const project = await prisma.project.findUnique({ where: { id }, select: { id: true } });
    if (!project) return NextResponse.json({ error: "Not found" }, { status: 404 });

    // Achteraan in de lijst. De hoogste bestaande waarde opzoeken in plaats van
    // tellen, want na een samenvoeging kunnen twee reeksen sortOrder door
    // elkaar lopen en zou tellen een botsing opleveren.
    const laatste = await prisma.projectTask.findFirst({
      where: { projectId: id },
      orderBy: { sortOrder: "desc" },
      select: { sortOrder: true },
    });

    const taak = await prisma.projectTask.create({
      data: {
        projectId: id,
        name: data.name,
        startDate: new Date(data.startDate),
        endDate: new Date(data.endDate),
        sortOrder: (laatste?.sortOrder ?? -1) + 1,
      },
    });

    return NextResponse.json(taak, { status: 201 });
  } catch (e) { return handleError(e); }
}
