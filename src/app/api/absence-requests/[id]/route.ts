import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { z } from "zod";
import { handleError } from "@/lib/api";
import { isAdmin } from "@/lib/roles";
import { workingDaysBetween } from "@/lib/working-days";
import {
  ABSENCE_PROJECT_NAMES,
  splitHoursOverDays,
  patternSummary,
  patternedEntries,
} from "@/lib/absence-entries";
import { weekTotal, toWeekSchedule } from "@/lib/work-schedule";
import { isQuarter, NOT_A_QUARTER } from "@/lib/quarter-hours";

const patroonUren = z.number().min(0).max(24).refine(isQuarter, NOT_A_QUARTER);

const employeeUpdateSchema = z.object({
  type: z.enum(["VACATION", "SICK", "PARENTAL_LEAVE", "SPECIAL_LEAVE", "UNPAID_LEAVE"]).optional(),
  startDate: z.string(),
  endDate: z.string(),
  hours: z.number().positive().refine(isQuarter, NOT_A_QUARTER),
  description: z.string().optional(),
  pattern: z.object({
    monday: patroonUren,
    tuesday: patroonUren,
    wednesday: patroonUren,
    thursday: patroonUren,
    friday: patroonUren,
  }).nullable().optional(),
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

    const existing = await prisma.absenceRequest.findUnique({
      where: { id },
      include: { pattern: true },
    });
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
        // Met patroon: alleen de dagen die erop passen, met de uren van die dag.
        // Zonder patroon: het totaal gelijk over alle werkdagen, ongewijzigd.
        const patroon = toWeekSchedule(existing.pattern);
        regels = patroon
          ? patternedEntries(patroon, dagen)
          : splitHoursOverDays(Number(existing.hours), dagen);

        // Een periode kan werkdagen bevatten zonder dat er één op het patroon
        // past — een woensdagpatroon over maandag en dinsdag. Dat is een andere
        // fout dan een periode zonder werkdagen en verdient een eigen melding.
        if (regels.length === 0) {
          return NextResponse.json(
            { error: "Deze periode bevat geen dagen die op het patroon passen" },
            { status: 400 },
          );
        }
      }

      const updated = await prisma.$transaction(async (tx) => {
        const aanvraag = await tx.absenceRequest.update({
          where: { id },
          data: { status: data.status, reviewedBy: userId, reviewedAt: new Date() },
          include: {
            user: { select: { id: true, name: true } },
            reviewer: { select: { id: true, name: true } },
            pattern: true,
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

      // Ook hier het patroon meegeven: het scherm vervangt de rij met dit
      // antwoord, en een ontbrekend veld leest het formulier als "wel een
      // patroon".
      return NextResponse.json({
        ...updated,
        hours: Number(updated.hours),
        pattern: toWeekSchedule(updated.pattern),
      });
    }

    if (existing.userId !== userId) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    if (existing.status !== "PENDING") {
      return NextResponse.json({ error: "Can only edit pending requests" }, { status: 400 });
    }

    const data = employeeUpdateSchema.parse(body);

    let hours = data.hours;
    if (data.pattern) {
      if (weekTotal(data.pattern) === 0) {
        return NextResponse.json(
          { error: "Een patroon van alleen nullen levert geen verlofdagen op" },
          { status: 400 },
        );
      }
      const { entries, total } = patternSummary(data.pattern, data.startDate, data.endDate);
      if (entries.length === 0) {
        return NextResponse.json(
          { error: "Deze periode bevat geen dagen die op het patroon passen" },
          { status: 400 },
        );
      }
      hours = total;
    }

    const updated = await prisma.$transaction(async (tx) => {
      // Het patroon eerst wegschrijven en pas daarna de aanvraag bijwerken, zodat
      // de include op de update het NIEUWE patroon teruggeeft en niet het oude.
      // Verwijderen-en-opnieuw-maken: geen patroon in de body betekent dat een
      // bestaand patroon verdwijnt.
      await tx.absencePattern.deleteMany({ where: { absenceRequestId: id } });
      if (data.pattern) {
        await tx.absencePattern.create({ data: { absenceRequestId: id, ...data.pattern } });
      }
      return tx.absenceRequest.update({
        where: { id },
        data: {
          ...(data.type ? { type: data.type } : {}),
          startDate: new Date(data.startDate),
          endDate: new Date(data.endDate),
          hours,
          description: data.description ?? null,
        },
        include: {
          user: { select: { id: true, name: true } },
          reviewer: { select: { id: true, name: true } },
          pattern: true,
        },
      });
    });
    return NextResponse.json({
      ...updated,
      hours: Number(updated.hours),
      pattern: toWeekSchedule(updated.pattern),
    });
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
