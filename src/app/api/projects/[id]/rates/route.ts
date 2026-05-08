import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { z } from "zod";

const schema = z.object({
  activityTypeId: z.string().min(1),
  rate: z.number().positive(),
});

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id: projectId } = await params;

  const body = await req.json();
  const data = schema.parse(body);
  const rate = await prisma.projectActivityRate.upsert({
    where: { projectId_activityTypeId: { projectId, activityTypeId: data.activityTypeId } },
    update: { rate: data.rate },
    create: { projectId, ...data },
    include: { activityType: true },
  });
  return NextResponse.json(rate, { status: 201 });
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id: projectId } = await params;

  const { searchParams } = new URL(req.url);
  const activityTypeId = searchParams.get("activityTypeId");
  if (!activityTypeId) return NextResponse.json({ error: "activityTypeId required" }, { status: 400 });

  await prisma.projectActivityRate.delete({
    where: { projectId_activityTypeId: { projectId, activityTypeId } },
  });
  return NextResponse.json({ success: true });
}
