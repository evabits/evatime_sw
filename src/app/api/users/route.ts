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
  contractType: z.enum(["PERMANENT", "FIXED_TERM", "ZERO_HOURS"]).default("PERMANENT"),
  contractHours: z.coerce.number().positive().optional().nullable(),
  contractStart: z.string().optional(),
  contractEnd: z.string().optional(),
});

const userSelect = {
  id: true, name: true, email: true, role: true, weeklyHours: true,
  contractType: true, contractHours: true, contractStart: true, contractEnd: true,
  createdAt: true,
} as const;

function serializeUser(u: {
  weeklyHours: any; contractHours: any; contractStart: Date | null; contractEnd: Date | null;
} & Record<string, any>) {
  return {
    ...u,
    weeklyHours: u.weeklyHours != null ? Number(u.weeklyHours) : null,
    contractHours: u.contractHours != null ? Number(u.contractHours) : null,
    contractStart: u.contractStart ? u.contractStart.toISOString().slice(0, 10) : null,
    contractEnd: u.contractEnd ? u.contractEnd.toISOString().slice(0, 10) : null,
  };
}

export async function GET() {
  try {
    const session = await auth();
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const users = await prisma.user.findMany({ orderBy: { name: "asc" }, select: userSelect });
    return NextResponse.json(users.map(serializeUser));
  } catch (e) { return handleError(e); }
}

export async function POST(req: Request) {
  try {
    const session = await auth();
    if (!session || (session.user as any)?.role !== "ADMIN") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { weeklyHours, contractHours, contractStart, contractEnd, ...rest } =
      createSchema.parse(await req.json());
    const existing = await prisma.user.findUnique({ where: { email: rest.email } });
    if (existing) return NextResponse.json({ error: "E-mailadres al in gebruik" }, { status: 409 });

    const user = await prisma.user.create({
      data: {
        ...rest,
        password: await hash(rest.password, 12),
        weeklyHours: weeklyHours ?? null,
        contractHours: contractHours ?? null,
        contractStart: contractStart ? new Date(contractStart) : null,
        contractEnd: contractEnd ? new Date(contractEnd) : null,
      },
      select: userSelect,
    });
    return NextResponse.json(serializeUser(user), { status: 201 });
  } catch (e) { return handleError(e); }
}
