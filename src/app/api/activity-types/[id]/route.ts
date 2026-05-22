import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { z } from "zod";
import { handleError } from "@/lib/api";
import { isAdmin } from "@/lib/roles";

const schema = z.object({
  name: z.string().min(1),
  defaultRate: z.number().positive().optional().nullable(),
  billable: z.boolean().default(true),
  showInAllProjects: z.boolean().default(false),
  projectIds: z.array(z.string()).default([]),
});

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await auth();
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const role = (session.user as any)?.role ?? "EMPLOYEE";
    if (!isAdmin(role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const { id } = await params;
    const { projectIds, ...fields } = schema.parse(await req.json());

    const type = await prisma.$transaction(async (tx) => {
      await tx.activityType.update({ where: { id }, data: fields });
      await tx.activityTypeProject.deleteMany({ where: { activityTypeId: id } });
      if (projectIds.length > 0) {
        await tx.activityTypeProject.createMany({
          data: projectIds.map((projectId) => ({ activityTypeId: id, projectId })),
        });
      }
      return tx.activityType.findUniqueOrThrow({
        where: { id },
        include: { projects: { select: { projectId: true } } },
      });
    });
    return NextResponse.json(type);
  } catch (e) { return handleError(e); }
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await auth();
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const role = (session.user as any)?.role ?? "EMPLOYEE";
    if (!isAdmin(role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const { id } = await params;
    await prisma.activityType.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (e) { return handleError(e); }
}
