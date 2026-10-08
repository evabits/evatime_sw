import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { z } from "zod";
import { handleError } from "@/lib/api";
import { isAdmin } from "@/lib/roles";

const schema = z.object({ userId: z.string().min(1) });

/**
 * Eén deelnemer toevoegen, zonder de rest van de lijst mee te sturen. Voor het
 * urenscherm, waar een admin bij "geen deelnemer" iemand meteen toevoegt. Al
 * deelnemer is geen fout: dan staat hij er gewoon.
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await auth();
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const role = (session.user as any)?.role ?? "EMPLOYEE";
    if (!isAdmin(role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const { id } = await params;
    const { userId } = schema.parse(await req.json());
    await prisma.projectMember.upsert({
      where: { projectId_userId: { projectId: id, userId } },
      create: { projectId: id, userId },
      update: {},
    });
    return NextResponse.json({ success: true });
  } catch (e) { return handleError(e); }
}
