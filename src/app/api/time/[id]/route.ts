import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { z } from "zod";
import { handleError } from "@/lib/api";
import { isAdmin } from "@/lib/roles";

const schema = z.object({
  projectId: z.string().min(1),
  activityTypeId: z.string().optional().nullable(),
  date: z.string(),
  hours: z.number().positive(),
  description: z.string().optional(),
  rateOverride: z.number().positive().optional().nullable(),
  billable: z.boolean().optional(),
});

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await auth();
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const role = (session.user as any)?.role ?? "EMPLOYEE";
    const { id } = await params;

    const data = schema.parse(await req.json());
    let { rateOverride, billable, activityTypeId } = data;

    if (!isAdmin(role)) {
      rateOverride = null;
      if (activityTypeId) {
        const act = await prisma.activityType.findUnique({ where: { id: activityTypeId }, select: { billable: true } });
        billable = act?.billable ?? true;
      } else {
        billable = true;
      }
    }

    const entry = await prisma.timeEntry.update({
      where: { id },
      data: { ...data, rateOverride, billable: billable ?? true, date: new Date(data.date) },
      include: {
        project: { select: { name: true, customer: { select: { id: true, name: true } } } },
        activityType: { select: { name: true } },
      },
    });
    return NextResponse.json(entry);
  } catch (e) { return handleError(e); }
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await auth();
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const { id } = await params;
    await prisma.timeEntry.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (e) { return handleError(e); }
}
