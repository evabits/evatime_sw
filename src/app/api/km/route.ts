import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { z } from "zod";
import { handleError } from "@/lib/api";
import { canViewAllEntries } from "@/lib/roles";

const schema = z.object({
  projectId: z.string().min(1),
  date: z.string(),
  km: z.number().positive(),
  description: z.string().optional(),
  rateOverride: z.number().positive().optional().nullable(),
  billable: z.boolean().default(true),
});

export async function GET(req: Request) {
  try {
    const session = await auth();
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const { searchParams } = new URL(req.url);
    const projectId = searchParams.get("projectId");
    const customerId = searchParams.get("customerId");
    const from = searchParams.get("from");
    const to = searchParams.get("to");

    const role = (session.user as any)?.role ?? "EMPLOYEE";
    const ownerId = canViewAllEntries(role) ? null : session.user?.id;

    const entries = await prisma.kmEntry.findMany({
      where: {
        ...(ownerId ? { userId: ownerId } : {}),
        ...(projectId ? { projectId } : {}),
        ...(customerId ? { project: { customerId } } : {}),
        ...(from || to ? { date: { ...(from ? { gte: new Date(from) } : {}), ...(to ? { lte: new Date(to) } : {}) } } : {}),
      },
      orderBy: { date: "desc" },
      include: {
        project: { select: { id: true, name: true, defaultKmRate: true, customer: { select: { name: true } } } },
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

    const data = schema.parse(await req.json());
    const entry = await prisma.kmEntry.create({
      data: { ...data, date: new Date(data.date), userId },
      include: {
        project: { select: { name: true, customer: { select: { name: true } } } },
      },
    });
    return NextResponse.json(entry, { status: 201 });
  } catch (e) { return handleError(e); }
}
