import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { canManageRecurringBatches } from "@/lib/roles";
import { handleError } from "@/lib/api";
import { deleteBatchDenial } from "@/lib/recurring";

/**
 * Een verkeerd aangemaakte batch echt weghalen, niet archiveren: hij moet uit
 * de lijst en de naam moet weer vrij zijn voor een nieuwe poging. Deelnemers,
 * taken en tarieven gaan mee via de cascade; snelkoppelingen voor kilometers
 * hebben geen cascade en worden hier eerst opgeruimd.
 */
export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await auth();
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const role = (session.user as any)?.role ?? "EMPLOYEE";
    if (!canManageRecurringBatches(role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const { id } = await params;
    const batch = await prisma.project.findUnique({
      where: { id },
      select: {
        templateId: true,
        status: true,
        generatedInvoiceId: true,
        _count: { select: { timeEntries: true, kmEntries: true, expenses: true } },
      },
    });
    if (!batch) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const weigering = deleteBatchDenial(batch, batch._count);
    if (weigering) return NextResponse.json({ error: weigering }, { status: 400 });

    await prisma.$transaction([
      prisma.kmTemplate.deleteMany({ where: { projectId: id } }),
      prisma.project.delete({ where: { id } }),
    ]);
    return NextResponse.json({ success: true });
  } catch (e) { return handleError(e); }
}
