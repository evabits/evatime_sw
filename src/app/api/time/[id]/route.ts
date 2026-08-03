import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { z } from "zod";
import { handleError, entryMutationError } from "@/lib/api";
import { isAdmin } from "@/lib/roles";
import { checkEntryMutation, resolveEntryUserId } from "@/lib/entry-owner";

const schema = z.object({
  projectId: z.string().min(1),
  date: z.string(),
  hours: z.number().positive(),
  description: z.string().optional(),
  rateOverride: z.number().positive().optional().nullable(),
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

    const existing = await prisma.timeEntry.findUnique({ where: { id }, select: { userId: true, invoiced: true, workLevel: true } });
    const error = entryMutationError(checkEntryMutation(role, sessionUserId, existing));
    if (error || !existing) return error ?? NextResponse.json({ error: "Not found" }, { status: 404 });

    const data = schema.parse(await req.json());

    let { rateOverride } = data;
    if (!isAdmin(role)) rateOverride = null;

    const { userId: requestedUserId, ...entryData } = data;
    const ownerId = resolveEntryUserId(role, sessionUserId, requestedUserId);
    let workLevel = existing.workLevel;
    if (ownerId !== existing.userId) {
      const owner = await prisma.user.findUnique({
        where: { id: ownerId },
        select: { id: true, workLevel: true },
      });
      if (!owner) return NextResponse.json({ error: "Onbekende medewerker" }, { status: 400 });
      workLevel = owner.workLevel;
    }

    const entry = await prisma.timeEntry.update({
      where: { id },
      data: { ...entryData, rateOverride, date: new Date(data.date), userId: ownerId, workLevel },
      include: {
        project: { select: { name: true, customer: { select: { id: true, name: true } } } },
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

    const existing = await prisma.timeEntry.findUnique({ where: { id }, select: { userId: true, invoiced: true } });
    const error = entryMutationError(checkEntryMutation(role, sessionUserId, existing));
    if (error) return error;

    await prisma.timeEntry.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (e) { return handleError(e); }
}
