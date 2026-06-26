import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { z } from "zod";
import { hash } from "bcryptjs";
import { handleError } from "@/lib/api";

const updateSchema = z.object({
  name: z.string().min(1),
  email: z.string().email(),
  role: z.enum(["ADMIN", "FINANCE", "EMPLOYEE"]),
  password: z.string().min(8).optional().or(z.literal("")),
  weeklyHours: z.coerce.number().positive().optional().nullable(),
  contractType: z.enum(["PERMANENT", "FIXED_TERM", "ZERO_HOURS"]).optional(),
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

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await auth();
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { id } = await params;
    const currentUser = session.user as any;
    const isSelf = currentUser?.id === id;
    const isAdmin = currentUser?.role === "ADMIN";

    if (!isAdmin && !isSelf) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const data = updateSchema.parse(await req.json());
    if (!isAdmin && data.role !== (currentUser?.role)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const updateData: any = { name: data.name, email: data.email };
    if (isAdmin) {
      updateData.role = data.role;
      updateData.weeklyHours = data.weeklyHours ?? null;
      if (data.contractType) updateData.contractType = data.contractType;
      updateData.contractHours = data.contractHours ?? null;
      updateData.contractStart = data.contractStart ? new Date(data.contractStart) : null;
      updateData.contractEnd = data.contractEnd ? new Date(data.contractEnd) : null;
    }
    if (data.password) updateData.password = await hash(data.password, 12);

    const user = await prisma.user.update({
      where: { id },
      data: updateData,
      select: userSelect,
    });
    return NextResponse.json(serializeUser(user));
  } catch (e) { return handleError(e); }
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await auth();
    if (!session || (session.user as any)?.role !== "ADMIN") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    const { id } = await params;
    if ((session.user as any)?.id === id) {
      return NextResponse.json({ error: "Kan eigen account niet verwijderen" }, { status: 400 });
    }
    await prisma.user.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (e) { return handleError(e); }
}
