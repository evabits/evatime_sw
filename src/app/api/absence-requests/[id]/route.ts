import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { z } from "zod";
import { handleError } from "@/lib/api";
import { isAdmin } from "@/lib/roles";
import { workingDaysBetween } from "@/lib/working-days";
import { ABSENCE_PROJECT_NAMES, splitHoursOverDays } from "@/lib/absence-entries";

const employeeUpdateSchema = z.object({
  type: z.enum(["VACATION", "SICK", "PARENTAL_LEAVE", "SPECIAL_LEAVE", "UNPAID_LEAVE"]).optional(),
  startDate: z.string(),
  endDate: z.string(),
  hours: z.number().positive(),
  description: z.string().optional(),
});

const adminUpdateSchema = z.object({
  status: z.enum(["APPROVED", "REJECTED"]),
});

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await auth();
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const userId = session.user?.id;
    if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const role = (session.user as any)?.role ?? "EMPLOYEE";
    const { id } = await params;

    const existing = await prisma.absenceRequest.findUnique({ where: { id } });
    if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const body = await req.json();

    if (isAdmin(role) && "status" in body) {
      const data = adminUpdateSchema.parse(body);

      // Bij goedkeuring eerst alles uitrekenen en pas daarna schrijven: een
      // ontbrekend verlofproject of een periode zonder werkdagen moet de
      // aanvraag onaangeroerd laten in plaats van hem half goed te keuren.
      let projectId = "";
      let regels: Array<{ date: string; hours: number }> = [];

      if (data.status === "APPROVED") {
        const naam = ABSENCE_PROJECT_NAMES[existing.type];
        const project = await prisma.project.findFirst({
          where: { name: naam, billable: false, customerId: null },
          select: { id: true },
        });
        if (!project) {
          return NextResponse.json(
            { error: `Het project "${naam}" bestaat nog niet` },
            { status: 400 },
          );
        }
        projectId = project.id;

        const dagen = workingDaysBetween(
          existing.startDate.toISOString().slice(0, 10),
          existing.endDate.toISOString().slice(0, 10),
        );
        if (dagen.length === 0) {
          return NextResponse.json({ error: "Deze periode bevat geen werkdagen" }, { status: 400 });
        }
        regels = splitHoursOverDays(Number(existing.hours), dagen);
      }

      const updated = await prisma.$transaction(async (tx) => {
        const aanvraag = await tx.absenceRequest.update({
          where: { id },
          data: { status: data.status, reviewedBy: userId, reviewedAt: new Date() },
          include: {
            user: { select: { id: true, name: true } },
            reviewer: { select: { id: true, name: true } },
          },
        });

        // Verwijderen-en-opnieuw-maken in plaats van bijwerken: zo komen
        // gewijzigde datums vanzelf goed, en elke status behalve APPROVED laat
        // het bij het verwijderen. Daarmee kan de tijdlijn niet uit de pas
        // lopen met de aanvraag.
        await tx.timeEntry.deleteMany({ where: { absenceRequestId: id } });
        if (regels.length > 0) {
          await tx.timeEntry.createMany({
            data: regels.map((r) => ({
              userId: existing.userId,
              projectId,
              date: new Date(`${r.date}T00:00:00Z`),
              hours: r.hours,
              description: existing.description,
              absenceRequestId: id,
            })),
          });
        }
        return aanvraag;
      });

      return NextResponse.json({ ...updated, hours: Number(updated.hours) });
    }

    if (existing.userId !== userId) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    if (existing.status !== "PENDING") {
      return NextResponse.json({ error: "Can only edit pending requests" }, { status: 400 });
    }

    const data = employeeUpdateSchema.parse(body);
    const updated = await prisma.absenceRequest.update({
      where: { id },
      data: {
        ...(data.type ? { type: data.type } : {}),
        startDate: new Date(data.startDate),
        endDate: new Date(data.endDate),
        hours: data.hours,
        description: data.description ?? null,
      },
      include: {
        user: { select: { id: true, name: true } },
        reviewer: { select: { id: true, name: true } },
      },
    });
    return NextResponse.json({ ...updated, hours: Number(updated.hours) });
  } catch (e) { return handleError(e); }
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await auth();
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const userId = session.user?.id;
    if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const role = (session.user as any)?.role ?? "EMPLOYEE";
    const { id } = await params;

    const existing = await prisma.absenceRequest.findUnique({ where: { id } });
    if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

    if (!isAdmin(role)) {
      if (existing.userId !== userId) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      if (existing.status !== "PENDING") return NextResponse.json({ error: "Can only delete pending requests" }, { status: 400 });
    }

    await prisma.absenceRequest.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (e) { return handleError(e); }
}
