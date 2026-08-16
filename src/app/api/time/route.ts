import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { z } from "zod";
import { handleError, projectMembershipError } from "@/lib/api";
import { canViewAllEntries, canEditInvoices, isAdmin } from "@/lib/roles";
import { resolveEntryUserId } from "@/lib/entry-owner";
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

export async function GET(req: Request) {
  try {
    const session = await auth();
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const { searchParams } = new URL(req.url);
    const projectId = searchParams.get("projectId");
    const userId = searchParams.get("userId");
    const customerId = searchParams.get("customerId");
    const from = searchParams.get("from");
    const to = searchParams.get("to");

    const role = (session.user as any)?.role ?? "EMPLOYEE";
    const ownerId = canViewAllEntries(role) ? null : session.user?.id;

    // The per-level rate card (and workLevel, which reveals colleagues' levels
    // once combined with it) is only consumed by the invoice builder, which is
    // admin-only. Every other caller of this shared endpoint — the /time list,
    // for any role — never resolves a rate from its response, so withhold both
    // rather than leak the company's rate table to employees via devtools.
    const canSeeRates = canEditInvoices(role);

    const entries = await prisma.timeEntry.findMany({
      where: {
        ...(ownerId ? { userId: ownerId } : {}),
        ...(projectId ? { projectId } : {}),
        ...(userId && canViewAllEntries(role) ? { userId } : {}),
        ...(customerId ? { project: { customerId } } : {}),
        ...(from || to ? { date: { ...(from ? { gte: new Date(from) } : {}), ...(to ? { lte: new Date(to) } : {}) } } : {}),
      },
      orderBy: { date: "desc" },
      include: {
        project: canSeeRates
          ? {
              select: {
                id: true, name: true,
                billable: true,
                levelRates: true,
                customer: { select: { id: true, name: true, levelRates: true } },
              },
            }
          : { select: { id: true, name: true, billable: true, customer: { select: { id: true, name: true } } } },
        user: canSeeRates
          ? { select: { id: true, name: true, workLevel: true } }
          : { select: { id: true, name: true } },
      },
    });
    return NextResponse.json(entries);
  } catch (e) { return handleError(e); }
}

export async function POST(req: Request) {
  try {
    const session = await auth();
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const userId = session.user?.id;
    if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const role = (session.user as any)?.role ?? "EMPLOYEE";
    const data = schema.parse(await req.json());

    let { rateOverride } = data;
    if (!isAdmin(role)) rateOverride = null;

    const { userId: requestedUserId, ...entryData } = data;
    const ownerId = resolveEntryUserId(role, userId, requestedUserId);
    const owner = await prisma.user.findUnique({
      where: { id: ownerId },
      select: { id: true, workLevel: true },
    });
    if (!owner) return NextResponse.json({ error: "Onbekende medewerker" }, { status: 400 });

    const memberError = await projectMembershipError(data.projectId, ownerId);
    if (memberError) return memberError;

    const entry = await prisma.timeEntry.create({
      data: { ...entryData, rateOverride, date: new Date(data.date),
        // "" betekent "niet ingevuld"; dat hoort als NULL in de database te
        // staan, anders is een leeg tijdvak niet te onderscheiden van een
        // ingevuld tijdvak dat toevallig leeg is.
        startTime: data.startTime || null,
        endTime: data.endTime || null,
        breakMinutes: data.breakMinutes ?? null,
        userId: ownerId, workLevel: owner.workLevel },
      include: {
        project: { select: { name: true, billable: true, customer: { select: { id: true, name: true } } } },
        user: { select: { id: true, name: true } },
      },
    });
    return NextResponse.json(entry, { status: 201 });
  } catch (e) { return handleError(e); }
}
