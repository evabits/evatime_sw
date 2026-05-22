import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { z } from "zod";
import { handleError } from "@/lib/api";
import { canViewAllEntries, isAdmin } from "@/lib/roles";

const schema = z.object({
  projectId: z.string().min(1),
  activityTypeId: z.string().optional().nullable(),
  date: z.string(),
  hours: z.number().positive(),
  description: z.string().optional(),
  rateOverride: z.number().positive().optional().nullable(),
  billable: z.boolean().optional(),
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
        project: { select: { id: true, name: true, defaultHourlyRate: true, customer: { select: { id: true, name: true } } } },
        activityType: { select: { id: true, name: true, defaultRate: true } },
        user: { select: { id: true, name: true } },
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

    const entry = await prisma.timeEntry.create({
      data: { ...data, rateOverride, billable: billable ?? true, date: new Date(data.date), userId },
      include: {
        project: { select: { name: true, customer: { select: { id: true, name: true } } } },
        activityType: { select: { name: true } },
      },
    });
    return NextResponse.json(entry, { status: 201 });
  } catch (e) { return handleError(e); }
}
