import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { z } from "zod";
import { hash } from "bcryptjs";
import { handleError } from "@/lib/api";
import { weeklyHoursField, workLevelField } from "@/lib/user-schema";
import { archivedWhere } from "@/lib/archive";
import type { WorkLevel } from "@prisma/client";

const createSchema = z.object({
  name: z.string().min(1),
  email: z.string().email(),
  password: z.string().min(8, "Minimaal 8 tekens"),
  role: z.enum(["ADMIN", "FINANCE", "TEAMLEAD", "EMPLOYEE"]).default("EMPLOYEE"),
  weeklyHours: weeklyHoursField,
  workLevel: workLevelField,
});

const userSelect = {
  id: true, name: true, email: true, role: true, weeklyHours: true, workLevel: true,
  createdAt: true, archivedAt: true,
} as const;

function serializeUser(u: { weeklyHours: any } & Record<string, any>) {
  return {
    ...u,
    weeklyHours: u.weeklyHours != null ? Number(u.weeklyHours) : null,
  };
}

export async function GET(req: Request) {
  try {
    const session = await auth();
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const includeArchived = new URL(req.url).searchParams.get("includeArchived") === "1";
    const users = await prisma.user.findMany({
      where: archivedWhere(includeArchived),
      orderBy: { name: "asc" },
      select: userSelect,
    });
    return NextResponse.json(users.map(serializeUser));
  } catch (e) { return handleError(e); }
}

export async function POST(req: Request) {
  try {
    const session = await auth();
    if (!session || (session.user as any)?.role !== "ADMIN") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { weeklyHours, workLevel, ...rest } = createSchema.parse(await req.json());
    const existing = await prisma.user.findUnique({ where: { email: rest.email } });
    if (existing) return NextResponse.json({ error: "E-mailadres al in gebruik" }, { status: 409 });

    const user = await prisma.user.create({
      data: {
        ...rest,
        password: await hash(rest.password, 12),
        weeklyHours: weeklyHours ?? null,
        workLevel: (workLevel ?? null) as WorkLevel | null,
      },
      select: userSelect,
    });
    return NextResponse.json(serializeUser(user), { status: 201 });
  } catch (e) { return handleError(e); }
}
