import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { z } from "zod";
import { handleError } from "@/lib/api";
import { isAdmin } from "@/lib/roles";

const employeeUpdateSchema = z.object({
  type: z.enum(["VACATION", "SICK", "SPECIAL_LEAVE", "UNPAID_LEAVE"]).optional(),
  startDate: z.string(),
  endDate: z.string(),
  hours: z.number().positive(),
  description: z.string().optional(),
});

const adminUpdateSchema = z.object({
  status: z.enum(["APPROVED", "REJECTED"]),
});

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await auth();
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const userId = session.user?.id;
    if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const role = (session.user as any)?.role ?? "EMPLOYEE";
    const { id } = await params;

    const existing = await prisma.absenceRequest.findUnique({ where: { id } });
    if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const body = await req.json();

    if (isAdmin(role) && "status" in body) {
      const data = adminUpdateSchema.parse(body);
      const updated = await prisma.absenceRequest.update({
        where: { id },
        data: { status: data.status, reviewedBy: userId, reviewedAt: new Date() },
        include: {
          user: { select: { id: true, name: true } },
          reviewer: { select: { id: true, name: true } },
        },
      });
      return NextResponse.json({ ...updated, hours: Number(updated.hours) });
    }

    if (existing.userId !== userId) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    if (existing.status !== "PENDING") {
      return NextResponse.json({ error: "Can only edit pending requests" }, { status: 400 });
    }

    const data = employeeUpdateSchema.parse(body);
    const updated = await prisma.absenceRequest.update({
      where: { id },
      data: {
        ...(data.type ? { type: data.type } : {}),
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
    return NextResponse.json({ ...updated, hours: Number(updated.hours) });
  } catch (e) { return handleError(e); }
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await auth();
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const userId = session.user?.id;
    if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const role = (session.user as any)?.role ?? "EMPLOYEE";
    const { id } = await params;

    const existing = await prisma.absenceRequest.findUnique({ where: { id } });
    if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

    if (!isAdmin(role)) {
      if (existing.userId !== userId) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      if (existing.status !== "PENDING") return NextResponse.json({ error: "Can only delete pending requests" }, { status: 400 });
    }

    await prisma.absenceRequest.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (e) { return handleError(e); }
}
