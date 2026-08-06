import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { z } from "zod";
import { handleError } from "@/lib/api";
import { isAdmin } from "@/lib/roles";
import { patternSummary, absenceLines } from "@/lib/absence-entries";
import { weekTotal, toWeekSchedule } from "@/lib/work-schedule";
import { isQuarter, NOT_A_QUARTER } from "@/lib/quarter-hours";
import { canCancelAbsence } from "@/lib/absence-permissions";
import { findAbsenceProject } from "@/lib/absence-project";

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

    // Intrekken is een eigen actie en geen statuswijziging via adminUpdateSchema:
    // die tak is admin-only en gaat over beoordelen, terwijl intrekken juist
    // iets is wat de medewerker zelf doet. Ze samenvoegen zou betekenen dat de
    // rechtencontrole van het beoordelen versoepeld moet worden.
    if (body?.action === "cancel") {
      const vandaag = new Date().toISOString().slice(0, 10);
      const verdict = canCancelAbsence(role, userId, {
        userId: existing.userId,
        status: existing.status,
        startDate: existing.startDate.toISOString().slice(0, 10),
      }, vandaag);

      if (verdict === "not-found") return NextResponse.json({ error: "Not found" }, { status: 404 });
      if (verdict === "forbidden") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      if (verdict === "not-approved") {
        return NextResponse.json(
          { error: "Alleen goedgekeurd verlof kan worden ingetrokken" },
          { status: 400 },
        );
      }
      if (verdict === "already-started") {
        return NextResponse.json(
          { error: "Verlof dat al begonnen is kan alleen een beheerder intrekken" },
          { status: 400 },
        );
      }

      const updated = await prisma.$transaction(async (tx) => {
        const aanvraag = await tx.absenceRequest.update({
          where: { id },
          data: { status: "CANCELLED", reviewedBy: userId, reviewedAt: new Date() },
          include: {
            user: { select: { id: true, name: true } },
            reviewer: { select: { id: true, name: true } },
            pattern: true,
          },
        });
        // De urenregels van een ingetrokken aanvraag horen te verdwijnen, net
        // als bij een afwijzing.
        await tx.timeEntry.deleteMany({ where: { absenceRequestId: id } });
        return aanvraag;
      });

      return NextResponse.json({
        ...updated,
        hours: Number(updated.hours),
        pattern: toWeekSchedule(updated.pattern),
      });
    }

    if (isAdmin(role) && "status" in body) {
      const data = adminUpdateSchema.parse(body);

      // Bij goedkeuring eerst alles uitrekenen en pas daarna schrijven: een
      // ontbrekend verlofproject of een periode zonder werkdagen moet de
      // aanvraag onaangeroerd laten in plaats van hem half goed te keuren.
      let projectId = "";
      let regels: Array<{ date: string; hours: number }> = [];

      if (data.status === "APPROVED") {
        const project = await findAbsenceProject(existing.type);
        if (!project.ok) return NextResponse.json({ error: project.error }, { status: 400 });
        projectId = project.projectId;

        const uitkomst = absenceLines(
          Number(existing.hours),
          toWeekSchedule(existing.pattern),
          existing.startDate.toISOString().slice(0, 10),
          existing.endDate.toISOString().slice(0, 10),
        );
        if (!uitkomst.ok) return NextResponse.json({ error: uitkomst.error }, { status: 400 });
        regels = uitkomst.entries;
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

    // Een admin mag elke aanvraag bewerken, ook een goedgekeurde en ook die van
    // een ander. De medewerker houdt zijn grens: alleen zijn eigen aanvraag, en
    // alleen zolang die nog in afwachting is.
    if (!isAdmin(role)) {
      if (existing.userId !== userId) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }
      if (existing.status !== "PENDING") {
        return NextResponse.json({ error: "Can only edit pending requests" }, { status: 400 });
      }
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

    // Wijzigt een admin een aanvraag die al goedgekeurd is, dan moeten de
    // urenregels mee. Zonder dit loopt de tijdlijn stilzwijgend uit de pas met
    // de aanvraag. De status blijft staan: bewerken is geen nieuwe beoordeling.
    let projectId = "";
    let regels: Array<{ date: string; hours: number }> = [];
    if (existing.status === "APPROVED") {
      // data.type ?? existing.type: het type mag bij het bewerken wijzigen, en
      // dan verhuizen de urenregels naar het project van het nieuwe type.
      const project = await findAbsenceProject(data.type ?? existing.type);
      if (!project.ok) return NextResponse.json({ error: project.error }, { status: 400 });
      projectId = project.projectId;

      const uitkomst = absenceLines(hours, data.pattern ?? null, data.startDate, data.endDate);
      if (!uitkomst.ok) return NextResponse.json({ error: uitkomst.error }, { status: 400 });
      regels = uitkomst.entries;
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
      const aanvraag = await tx.absenceRequest.update({
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

      // Verwijderen-en-opnieuw-maken, net als bij het goedkeuren: zo komen
      // gewijzigde datums vanzelf goed. Bij een aanvraag die niet goedgekeurd
      // is, is regels leeg en gebeurt er niets — die heeft geen urenregels.
      if (existing.status === "APPROVED") {
        await tx.timeEntry.deleteMany({ where: { absenceRequestId: id } });
        await tx.timeEntry.createMany({
          data: regels.map((r) => ({
            userId: existing.userId,
            projectId,
            date: new Date(`${r.date}T00:00:00Z`),
            hours: r.hours,
            description: data.description ?? null,
            absenceRequestId: id,
          })),
        });
      }
      return aanvraag;
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
