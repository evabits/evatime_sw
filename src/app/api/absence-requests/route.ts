import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { z } from "zod";
import { handleError } from "@/lib/api";
import { isAdmin } from "@/lib/roles";
import { patternSummary } from "@/lib/absence-entries";
import { weekTotal, toWeekSchedule } from "@/lib/work-schedule";

const patternSchema = z.object({
  monday: z.number().min(0).max(24),
  tuesday: z.number().min(0).max(24),
  wednesday: z.number().min(0).max(24),
  thursday: z.number().min(0).max(24),
  friday: z.number().min(0).max(24),
});

const createSchema = z.object({
  type: z.enum(["VACATION", "SICK", "PARENTAL_LEAVE", "SPECIAL_LEAVE", "UNPAID_LEAVE"]).default("VACATION"),
  startDate: z.string(),
  endDate: z.string(),
  hours: z.number().positive(),
  description: z.string().optional(),
  // null én ontbrekend betekenen allebei "geen patroon". Dat wijkt af van de
  // *Known-guard bij levelRates en memberIds, waar ontbrekend "niet aanraken"
  // betekent — die bestaat daar omdat meerdere schermen dezelfde route
  // aanroepen. Hier is het afwezigheidsdialoog de enige client, het laadt de
  // aanvraag altijd volledig inclusief patroon, en de goedkeuringstak loopt
  // door een andere vertakking. Ontbrekend kan hier alleen "vinkje uit" zijn.
  pattern: patternSchema.nullable().optional(),
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

    const data = createSchema.parse(await req.json());

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

    const request = await prisma.absenceRequest.create({
      data: {
        userId,
        type: data.type,
        startDate: new Date(data.startDate),
        endDate: new Date(data.endDate),
        hours,
        description: data.description ?? null,
        ...(data.pattern ? { pattern: { create: data.pattern } } : {}),
      },
      include: {
        user: { select: { id: true, name: true } },
        reviewer: { select: { id: true, name: true } },
        pattern: true,
      },
    });
    return NextResponse.json(
      { ...request, hours: Number(request.hours), pattern: toWeekSchedule(request.pattern) },
      { status: 201 },
    );
  } catch (e) { return handleError(e); }
}
