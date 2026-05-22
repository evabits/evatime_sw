import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { z } from "zod";
import { handleError } from "@/lib/api";
import { isAdmin } from "@/lib/roles";

const createSchema = z.object({
  type: z.enum(["VACATION", "SICK", "SPECIAL_LEAVE", "UNPAID_LEAVE"]).default("VACATION"),
  startDate: z.string(),
  endDate: z.string(),
  hours: z.number().positive(),
  description: z.string().optional(),
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
      },
      orderBy: { startDate: "desc" },
    });

    return NextResponse.json(requests.map((r) => ({ ...r, hours: Number(r.hours) })));
  } catch (e) { return handleError(e); }
}

export async function POST(req: Request) {
  try {
    const session = await auth();
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const userId = session.user?.id;
    if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const data = createSchema.parse(await req.json());
    const request = await prisma.absenceRequest.create({
      data: {
        userId,
        type: data.type,
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
    return NextResponse.json({ ...request, hours: Number(request.hours) }, { status: 201 });
  } catch (e) { return handleError(e); }
}
