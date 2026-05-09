import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { z } from "zod";
import { hash } from "bcryptjs";
import { handleError } from "@/lib/api";

const createSchema = z.object({
  name: z.string().min(1),
  email: z.string().email(),
  password: z.string().min(8, "Minimaal 8 tekens"),
  role: z.enum(["ADMIN", "FINANCE", "EMPLOYEE"]).default("EMPLOYEE"),
  weeklyHours: z.coerce.number().positive().optional().nullable(),
});

const userSelect = { id: true, name: true, email: true, role: true, weeklyHours: true, createdAt: true } as const;

export async function GET() {
  try {
    const session = await auth();
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const users = await prisma.user.findMany({ orderBy: { name: "asc" }, select: userSelect });
    return NextResponse.json(users.map((u) => ({ ...u, weeklyHours: u.weeklyHours ? Number(u.weeklyHours) : null })));
  } catch (e) { return handleError(e); }
}

export async function POST(req: Request) {
  try {
    const session = await auth();
    if (!session || (session.user as any)?.role !== "ADMIN") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { weeklyHours, ...rest } = createSchema.parse(await req.json());
    const existing = await prisma.user.findUnique({ where: { email: rest.email } });
    if (existing) return NextResponse.json({ error: "E-mailadres al in gebruik" }, { status: 409 });

    const user = await prisma.user.create({
      data: { ...rest, password: await hash(rest.password, 12), weeklyHours: weeklyHours ?? null },
      select: userSelect,
    });
    return NextResponse.json({ ...user, weeklyHours: user.weeklyHours ? Number(user.weeklyHours) : null }, { status: 201 });
  } catch (e) { return handleError(e); }
}
