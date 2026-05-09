import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { z } from "zod";
import { handleError } from "@/lib/api";
import { isAdmin } from "@/lib/roles";

const schema = z.object({
  categoryId: z.string().min(1),
  projectId: z.string().optional().nullable(),
  date: z.string(),
  description: z.string().optional(),
  amount: z.number().positive(),
  vatRate: z.number().min(0).max(100),
  billable: z.boolean(),
  reimbursable: z.boolean(),
});

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await auth();
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const { id } = await params;
    const role = (session.user as any)?.role ?? "EMPLOYEE";
    const userId = session.user?.id!;

    const existing = await prisma.expense.findUnique({ where: { id }, select: { userId: true, invoiced: true } });
    if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });
    if (!isAdmin(role) && existing.userId !== userId) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    if (existing.invoiced) return NextResponse.json({ error: "Gefactureerde onkosten kunnen niet worden bewerkt" }, { status: 400 });

    const data = schema.parse(await req.json());
    const expense = await prisma.expense.update({
      where: { id },
      data: { ...data, date: new Date(data.date) },
      include: {
        category: { select: { id: true, name: true } },
        project: { select: { id: true, name: true, customer: { select: { name: true } } } },
        user: { select: { id: true, name: true } },
      },
    });
    return NextResponse.json(expense);
  } catch (e) { return handleError(e); }
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await auth();
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const { id } = await params;
    const role = (session.user as any)?.role ?? "EMPLOYEE";
    const userId = session.user?.id!;

    const existing = await prisma.expense.findUnique({ where: { id }, select: { userId: true, invoiced: true, receiptUrl: true } });
    if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });
    if (!isAdmin(role) && existing.userId !== userId) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    if (existing.invoiced) return NextResponse.json({ error: "Gefactureerde onkosten kunnen niet worden verwijderd" }, { status: 400 });

    await prisma.expense.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (e) { return handleError(e); }
}
