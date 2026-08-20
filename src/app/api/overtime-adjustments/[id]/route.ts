import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { isAdmin } from "@/lib/roles";
import { handleError } from "@/lib/api";

/**
 * Een mutatie is niet te wijzigen, alleen te verwijderen en opnieuw in te
 * voeren. Zo ontstaan er geen stille correcties op correcties, en blijft in de
 * opsomming te volgen wat er is gebeurd.
 */
export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await auth();
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const role = (session.user as any)?.role ?? "EMPLOYEE";
    if (!isAdmin(role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const { id } = await params;
    const bestaand = await prisma.overtimeAdjustment.findUnique({ where: { id }, select: { id: true } });
    if (!bestaand) return NextResponse.json({ error: "Not found" }, { status: 404 });

    await prisma.overtimeAdjustment.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (e) { return handleError(e); }
}
