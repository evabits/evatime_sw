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

export async function GET() {
  try {
    const session = await auth();
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const types = await prisma.activityType.findMany({
      orderBy: { name: "asc" },
      include: { projects: { select: { projectId: true } } },
    });
    return NextResponse.json(types);
  } catch (e) { return handleError(e); }
}

export async function POST(req: Request) {
  try {
    const session = await auth();
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const role = (session.user as any)?.role ?? "EMPLOYEE";
    if (!isAdmin(role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const { projectIds, ...fields } = schema.parse(await req.json());
    const type = await prisma.$transaction(async (tx) => {
      const created = await tx.activityType.create({ data: fields });
      if (projectIds.length > 0) {
        await tx.activityTypeProject.createMany({
          data: projectIds.map((projectId) => ({ activityTypeId: created.id, projectId })),
        });
      }
      return tx.activityType.findUniqueOrThrow({
        where: { id: created.id },
        include: { projects: { select: { projectId: true } } },
      });
    });
    return NextResponse.json(type, { status: 201 });
  } catch (e) { return handleError(e); }
}
