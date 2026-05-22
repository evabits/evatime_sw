import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { z } from "zod";
import { handleError } from "@/lib/api";
import { isAdmin } from "@/lib/roles";

const createSchema = z.object({
  userId: z.string().min(1),
  year: z.number().int().min(2000).max(2100),
  hours: z.number().positive(),
});

export async function GET(req: Request) {
  try {
    const session = await auth();
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const role = (session.user as any)?.role ?? "EMPLOYEE";
    const { searchParams } = new URL(req.url);
    const yearParam = searchParams.get("year");
    const userIdParam = searchParams.get("userId");

    const budgets = await prisma.vacationBudget.findMany({
      where: {
        ...(isAdmin(role) ? {} : { userId: session.user?.id }),
        ...(userIdParam && isAdmin(role) ? { userId: userIdParam } : {}),
        ...(yearParam ? { year: parseInt(yearParam) } : {}),
      },
      include: { user: { select: { id: true, name: true } } },
      orderBy: [{ year: "desc" }, { user: { name: "asc" } }],
    });

    return NextResponse.json(budgets.map((b) => ({ ...b, hours: Number(b.hours) })));
  } catch (e) { return handleError(e); }
}

export async function POST(req: Request) {
  try {
    const session = await auth();
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const role = (session.user as any)?.role ?? "EMPLOYEE";
    if (!isAdmin(role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const data = createSchema.parse(await req.json());
    const budget = await prisma.vacationBudget.upsert({
      where: { userId_year: { userId: data.userId, year: data.year } },
      update: { hours: data.hours },
      create: { userId: data.userId, year: data.year, hours: data.hours },
      include: { user: { select: { id: true, name: true } } },
    });
    return NextResponse.json({ ...budget, hours: Number(budget.hours) }, { status: 201 });
  } catch (e) { return handleError(e); }
}
