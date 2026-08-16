import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { z } from "zod";
import { handleError, entryMutationError, projectMembershipError } from "@/lib/api";
import { isAdmin } from "@/lib/roles";
import { checkEntryMutation, resolveEntryUserId } from "@/lib/entry-owner";
import { membershipCheckNeeded } from "@/lib/project-members";
import { isQuarter, NOT_A_QUARTER, TIME_PATTERN, hoursBetween } from "@/lib/quarter-hours";

const schema = z.object({
  projectId: z.string().min(1),
  date: z.string(),
  hours: z.number().positive().refine(isQuarter, NOT_A_QUARTER),
  startTime: z.string().regex(TIME_PATTERN, "Tijd als uu:mm").optional().nullable().or(z.literal("")),
  endTime: z.string().regex(TIME_PATTERN, "Tijd als uu:mm").optional().nullable().or(z.literal("")),
  breakMinutes: z.number().int().min(0).max(24 * 60).optional().nullable(),
  description: z.string().optional(),
  rateOverride: z.number().positive().optional().nullable(),
  userId: z.string().optional().nullable(),
}).refine(
  // Een eindtijd vóór de begintijd is geen tijdvak. Het formulier houdt het al
  // tegen, maar de route is de plek waar het niet omheen kan.
  (d) => !d.startTime || !d.endTime || hoursBetween(d.startTime, d.endTime) !== null,
  { message: "Eindtijd moet na de begintijd liggen", path: ["endTime"] },
);

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await auth();
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const role = (session.user as any)?.role ?? "EMPLOYEE";
    const sessionUserId = session.user?.id;
    if (!sessionUserId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const { id } = await params;

    const existing = await prisma.timeEntry.findUnique({ where: { id }, select: { userId: true, invoiced: true, workLevel: true, projectId: true, absenceRequestId: true } });
    const error = entryMutationError(checkEntryMutation(role, sessionUserId, existing));
    if (error || !existing) return error ?? NextResponse.json({ error: "Not found" }, { status: 404 });

    // Een verlofregel hoort bij een goedgekeurde aanvraag. Hem hier wijzigen
    // laat de tijdlijn uit de pas lopen met die aanvraag, zonder dat iets dat
    // herstelt. Ook voor admins: de aanvraag is de bron.
    if (existing.absenceRequestId) {
      return NextResponse.json(
        { error: "Verlofregels wijzig je via de afwezigheidsaanvraag" },
        { status: 400 },
      );
    }

    const data = schema.parse(await req.json());

    let { rateOverride } = data;
    if (!isAdmin(role)) rateOverride = null;

    const { userId: requestedUserId, ...entryData } = data;
    const ownerId = resolveEntryUserId(role, sessionUserId, requestedUserId);

    if (membershipCheckNeeded(
      { projectId: existing.projectId, userId: existing.userId },
      { projectId: data.projectId, userId: ownerId },
    )) {
      const memberError = await projectMembershipError(data.projectId, ownerId);
      if (memberError) return memberError;
    }

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
      data: { ...entryData, rateOverride, date: new Date(data.date),
        // Niet meegestuurd betekent "laat staan", meegestuurd als "" of null
        // betekent "leeggemaakt". Dat onderscheid is nodig omdat het
        // bewerkscherm in de rapportage naar dezelfde route schrijft zonder
        // deze velden te kennen; zonder deze tak zou opslaan daar het tijdvak
        // van een registratie wissen.
        ...(data.startTime !== undefined ? { startTime: data.startTime || null } : {}),
        ...(data.endTime !== undefined ? { endTime: data.endTime || null } : {}),
        ...(data.breakMinutes !== undefined ? { breakMinutes: data.breakMinutes ?? null } : {}),
        userId: ownerId, workLevel },
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

    const existing = await prisma.timeEntry.findUnique({ where: { id }, select: { userId: true, invoiced: true, absenceRequestId: true } });
    const error = entryMutationError(checkEntryMutation(role, sessionUserId, existing));
    if (error) return error;

    if (existing?.absenceRequestId) {
      return NextResponse.json(
        { error: "Verlofregels wijzig je via de afwezigheidsaanvraag" },
        { status: 400 },
      );
    }

    await prisma.timeEntry.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (e) { return handleError(e); }
}
