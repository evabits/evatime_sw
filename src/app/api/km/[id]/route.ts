import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { z } from "zod";
import { handleError, entryMutationError, projectMembershipError } from "@/lib/api";
import { isAdmin } from "@/lib/roles";
import { checkEntryMutation, resolveEntryUserId } from "@/lib/entry-owner";
import { membershipCheckNeeded } from "@/lib/project-members";
import { commuteVerdict } from "@/lib/commute-rules";

const schema = z.object({
  projectId: z.string().min(1),
  date: z.string(),
  km: z.number().positive(),
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

    const existing = await prisma.kmEntry.findUnique({ where: { id }, select: { userId: true, invoiced: true, projectId: true } });
    const error = entryMutationError(checkEntryMutation(role, sessionUserId, existing));
    if (error || !existing) return error ?? NextResponse.json({ error: "Not found" }, { status: 404 });

    const data = schema.parse(await req.json());
    let { rateOverride } = data;
    if (!isAdmin(role)) rateOverride = null;

    const { userId: requestedUserId, ...entryData } = data;
    const ownerId = resolveEntryUserId(role, sessionUserId, requestedUserId);
    if (ownerId !== sessionUserId) {
      const target = await prisma.user.findUnique({ where: { id: ownerId }, select: { id: true } });
      if (!target) return NextResponse.json({ error: "Onbekende medewerker" }, { status: 400 });
    }

    if (membershipCheckNeeded(
      { projectId: existing.projectId, userId: existing.userId },
      { projectId: data.projectId, userId: ownerId },
    )) {
      const memberError = await projectMembershipError(data.projectId, ownerId);
      if (memberError) return memberError;
    }

    // Ook bij het wijzigen opnieuw beoordelen: wie een gewone rit bijwerkt tot
    // de afstand van zijn woon-werksjabloon heeft daarmee een woon-werkrit, en
    // wie er juist vanaf wijkt niet meer. De rit mag zichzelf daarbij niet als
    // duplicaat tegenkomen.
    const { commute, denial } = await commuteVerdict({
      ownerId,
      date: new Date(data.date),
      projectId: data.projectId,
      km: data.km,
      negeerRitId: id,
    });
    if (denial) return NextResponse.json({ error: denial }, { status: 400 });

    const entry = await prisma.kmEntry.update({
      where: { id },
      data: { ...entryData, rateOverride, date: new Date(data.date), userId: ownerId, commute },
      include: {
        project: { select: { name: true, billable: true, customer: { select: { id: true, name: true } } } },
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
