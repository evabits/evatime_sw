import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { z } from "zod";
import { handleError } from "@/lib/api";
import { serialize } from "@/lib/utils";

const schema = z.object({ name: z.string().min(1) });

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await auth();
    const userId = session?.user?.id;
    if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const { id } = await params;
    const { name } = schema.parse(await req.json());

    const result = await prisma.kmTemplate.updateMany({ where: { id, userId }, data: { name } });
    if (result.count === 0) return NextResponse.json({ error: "Niet gevonden" }, { status: 404 });

    const template = await prisma.kmTemplate.findUnique({
      where: { id },
      include: {
        project: { select: { id: true, name: true, customer: { select: { id: true, name: true } } } },
        activityType: { select: { id: true, name: true } },
      },
    });
    return NextResponse.json(serialize(template));
  } catch (e: any) {
    if (e?.code === "P2002") return NextResponse.json({ error: "Naam bestaat al" }, { status: 409 });
    return handleError(e);
  }
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await auth();
    const userId = session?.user?.id;
    if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const { id } = await params;

    const result = await prisma.kmTemplate.deleteMany({ where: { id, userId } });
    if (result.count === 0) return NextResponse.json({ error: "Niet gevonden" }, { status: 404 });
    return NextResponse.json({ success: true });
  } catch (e) { return handleError(e); }
}
