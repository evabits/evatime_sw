import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { z } from "zod";
import { handleError, entryMutationError } from "@/lib/api";
import { isAdmin } from "@/lib/roles";
import { checkEntryMutation, resolveEntryUserId } from "@/lib/entry-owner";

const schema = z.object({
  projectId: z.string().min(1),
  activityTypeId: z.string().optional().nullable(),
  date: z.string(),
  km: z.number().positive(),
  description: z.string().optional(),
  rateOverride: z.number().positive().optional().nullable(),
  billable: z.boolean().optional(),
  userId: z.string().optional().nullable(),
});

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await auth();
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const role = (session.user as any)?.role ?? "EMPLOYEE";
    const sessionUserId = session.user?.id;
    if (!sessionUserId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const { id } = await params;

    const existing = await prisma.kmEntry.findUnique({ where: { id }, select: { userId: true, invoiced: true } });
    const error = entryMutationError(checkEntryMutation(role, sessionUserId, existing));
    if (error) return error;

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

    const { userId: requestedUserId, ...entryData } = data;
    const ownerId = resolveEntryUserId(role, sessionUserId, requestedUserId);
    if (ownerId !== sessionUserId) {
      const target = await prisma.user.findUnique({ where: { id: ownerId }, select: { id: true } });
      if (!target) return NextResponse.json({ error: "Onbekende medewerker" }, { status: 400 });
    }

    const entry = await prisma.kmEntry.update({
      where: { id },
      data: { ...entryData, rateOverride, billable: billable ?? true, date: new Date(data.date), userId: ownerId },
      include: {
        project: { select: { name: true, customer: { select: { id: true, name: true } } } },
        activityType: { select: { name: true } },
        user: { select: { id: true, name: true } },
      },
    });
    return NextResponse.json(entry);
  } catch (e) { return handleError(e); }
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await auth();
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const role = (session.user as any)?.role ?? "EMPLOYEE";
    const sessionUserId = session.user?.id;
    if (!sessionUserId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const { id } = await params;

    const existing = await prisma.kmEntry.findUnique({ where: { id }, select: { userId: true, invoiced: true } });
    const error = entryMutationError(checkEntryMutation(role, sessionUserId, existing));
    if (error) return error;

    await prisma.kmEntry.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (e) { return handleError(e); }
}
