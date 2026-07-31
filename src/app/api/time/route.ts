import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { z } from "zod";
import { handleError } from "@/lib/api";
import { canViewAllEntries, canEditInvoices, isAdmin } from "@/lib/roles";
import { resolveEntryUserId } from "@/lib/entry-owner";

const schema = z.object({
  projectId: z.string().min(1),
  activityTypeId: z.string().optional().nullable(),
  date: z.string(),
  hours: z.number().positive(),
  description: z.string().optional(),
  rateOverride: z.number().positive().optional().nullable(),
  billable: z.boolean().optional(),
  userId: z.string().optional().nullable(),
});

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
                levelRates: true,
                customer: { select: { id: true, name: true, levelRates: true } },
              },
            }
          : { select: { id: true, name: true, customer: { select: { id: true, name: true } } } },
        activityType: { select: { id: true, name: true, defaultRate: true } },
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
    const ownerId = resolveEntryUserId(role, userId, requestedUserId);
    const owner = await prisma.user.findUnique({
      where: { id: ownerId },
      select: { id: true, workLevel: true },
    });
    if (!owner) return NextResponse.json({ error: "Onbekende medewerker" }, { status: 400 });

    const entry = await prisma.timeEntry.create({
      data: { ...entryData, rateOverride, billable: billable ?? true, date: new Date(data.date), userId: ownerId, workLevel: owner.workLevel },
      include: {
        project: { select: { name: true, customer: { select: { id: true, name: true } } } },
        activityType: { select: { name: true } },
        user: { select: { id: true, name: true } },
      },
    });
    return NextResponse.json(entry, { status: 201 });
  } catch (e) { return handleError(e); }
}
