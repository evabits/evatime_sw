import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { z } from "zod";
import { handleError } from "@/lib/api";
import { isAdmin } from "@/lib/roles";

const schema = z.object({
  ids: z.array(z.string().min(1)).min(1).max(500),
});

export async function POST(req: Request) {
  try {
    const session = await auth();
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const role = (session.user as any)?.role ?? "EMPLOYEE";
    if (!isAdmin(role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const { ids } = schema.parse(await req.json());

    // Eén updateMany, dus alles of niets. Al gearchiveerde projecten vallen
    // vanzelf buiten de where en leveren geen foutmelding op — count telt
    // daarom wat er daadwerkelijk is gearchiveerd, niet hoeveel ids er kwamen.
    const { count } = await prisma.project.updateMany({
      where: { id: { in: ids }, archivedAt: null },
      data: { archivedAt: new Date() },
    });
    return NextResponse.json({ count });
  } catch (e) { return handleError(e); }
}
