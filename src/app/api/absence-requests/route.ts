import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { z } from "zod";
import { handleError } from "@/lib/api";
import { isAdmin } from "@/lib/roles";
import { patternSummary, absenceLines } from "@/lib/absence-entries";
import { resolveEntryUserId } from "@/lib/entry-owner";
import { findAbsenceProject } from "@/lib/absence-project";
import { weekTotal, toWeekSchedule } from "@/lib/work-schedule";
import { isQuarter, NOT_A_QUARTER } from "@/lib/quarter-hours";

// De vijf waarden zijn urenregistratie zodra de aanvraag goedgekeurd wordt, dus
// ze vallen onder dezelfde kwartierregel. Nul mag: dat betekent "die dag niet".
const patroonUren = z.number().min(0).max(24).refine(isQuarter, NOT_A_QUARTER);

const patternSchema = z.object({
  monday: patroonUren,
  tuesday: patroonUren,
  wednesday: patroonUren,
  thursday: patroonUren,
  friday: patroonUren,
});

const createSchema = z.object({
  type: z.enum(["VACATION", "SICK", "PARENTAL_LEAVE", "SPECIAL_LEAVE", "UNPAID_LEAVE"]).default("VACATION"),
  startDate: z.string(),
  endDate: z.string(),
  hours: z.number().positive().refine(isQuarter, NOT_A_QUARTER),
  description: z.string().optional(),
  // null én ontbrekend betekenen allebei "geen patroon". Dat wijkt af van de
  // *Known-guard bij levelRates en memberIds, waar ontbrekend "niet aanraken"
  // betekent — die bestaat daar omdat meerdere schermen dezelfde route
  // aanroepen. Hier is het afwezigheidsdialoog de enige client, het laadt de
  // aanvraag altijd volledig inclusief patroon, en de goedkeuringstak loopt
  // door een andere vertakking. Ontbrekend kan hier alleen "vinkje uit" zijn.
  pattern: patternSchema.nullable().optional(),
  // Alleen een admin mag hiermee een andere medewerker opgeven; bij iedereen
  // anders negeert resolveEntryUserId het veld. Zelfde patroon als op
  // POST /api/time.
  userId: z.string().optional().nullable(),
});

export async function GET(req: Request) {
  try {
    const session = await auth();
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const role = (session.user as any)?.role ?? "EMPLOYEE";
    const { searchParams } = new URL(req.url);
    const yearParam = searchParams.get("year");
    const userIdParam = searchParams.get("userId");
    const statusParam = searchParams.get("status");
    const typeParam = searchParams.get("type");

    const year = yearParam ? parseInt(yearParam) : null;
    const yearStart = year ? new Date(year, 0, 1) : null;
    const yearEnd = year ? new Date(year, 11, 31) : null;

    const requests = await prisma.absenceRequest.findMany({
      where: {
        ...(isAdmin(role) ? {} : { userId: session.user?.id }),
        ...(userIdParam && isAdmin(role) ? { userId: userIdParam } : {}),
        ...(statusParam ? { status: statusParam as any } : {}),
        ...(typeParam ? { type: typeParam as any } : {}),
        ...(yearStart && yearEnd ? { startDate: { gte: yearStart, lte: yearEnd } } : {}),
      },
      include: {
        user: { select: { id: true, name: true } },
        reviewer: { select: { id: true, name: true } },
        pattern: true,
      },
      orderBy: { startDate: "desc" },
    });

    return NextResponse.json(
      requests.map((r) => ({ ...r, hours: Number(r.hours), pattern: toWeekSchedule(r.pattern) })),
    );
  } catch (e) { return handleError(e); }
}

export async function POST(req: Request) {
  try {
    const session = await auth();
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const userId = session.user?.id;
    if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const role = (session.user as any)?.role ?? "EMPLOYEE";
    const data = createSchema.parse(await req.json());

    const ownerId = resolveEntryUserId(role, userId, data.userId);
    if (ownerId !== userId) {
      const owner = await prisma.user.findUnique({ where: { id: ownerId }, select: { id: true } });
      if (!owner) return NextResponse.json({ error: "Onbekende medewerker" }, { status: 400 });
    }

    // Een admin die een aanvraag aanmaakt keurt hem daarmee goed — ook voor
    // zichzelf. Hij ís de goedkeurder, dus een tussenstap waarin hij zijn eigen
    // invoer nog moet goedkeuren voegt niets toe.
    const meteenGoedgekeurd = isAdmin(role);

    // Met een patroon bepaalt de server het totaal en negeert hij wat de
    // client stuurde. Mocht de client een getal mogen opgeven dat niet klopt
    // met wat er gegenereerd wordt, dan lopen het vakantiesaldo, de lijst en
    // de tijdlijn uit elkaar zonder dat iets klaagt.
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

    // Bij een meteen goedgekeurde aanvraag eerst alles uitrekenen en pas daarna
    // schrijven: een ontbrekend verlofproject of een periode zonder werkdagen
    // moet niets achterlaten in plaats van een halve aanvraag.
    let projectId = "";
    let regels: Array<{ date: string; hours: number }> = [];
    if (meteenGoedgekeurd) {
      const project = await findAbsenceProject(data.type);
      if (!project.ok) return NextResponse.json({ error: project.error }, { status: 400 });
      projectId = project.projectId;

      const uitkomst = absenceLines(hours, data.pattern ?? null, data.startDate, data.endDate);
      if (!uitkomst.ok) return NextResponse.json({ error: uitkomst.error }, { status: 400 });
      regels = uitkomst.entries;
    }

    const request = await prisma.$transaction(async (tx) => {
      const aanvraag = await tx.absenceRequest.create({
        data: {
          userId: ownerId,
          type: data.type,
          startDate: new Date(data.startDate),
          endDate: new Date(data.endDate),
          hours,
          description: data.description ?? null,
          ...(meteenGoedgekeurd
            ? { status: "APPROVED" as const, reviewedBy: userId, reviewedAt: new Date() }
            : {}),
          ...(data.pattern ? { pattern: { create: data.pattern } } : {}),
        },
        include: {
          user: { select: { id: true, name: true } },
          reviewer: { select: { id: true, name: true } },
          pattern: true,
        },
      });

      if (regels.length > 0) {
        await tx.timeEntry.createMany({
          data: regels.map((r) => ({
            userId: ownerId,
            projectId,
            date: new Date(`${r.date}T00:00:00Z`),
            hours: r.hours,
            description: data.description ?? null,
            absenceRequestId: aanvraag.id,
          })),
        });
      }
      return aanvraag;
    });
    return NextResponse.json(
      { ...request, hours: Number(request.hours), pattern: toWeekSchedule(request.pattern) },
      { status: 201 },
    );
  } catch (e) { return handleError(e); }
}
