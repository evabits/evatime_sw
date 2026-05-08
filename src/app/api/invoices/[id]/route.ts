import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { z } from "zod";

const updateSchema = z.object({
  status: z.enum(["DRAFT", "SENT", "PAID", "CANCELLED"]),
  notes: z.string().optional(),
  dueDate: z.string().optional(),
});

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;

  const invoice = await prisma.invoice.findUnique({
    where: { id },
    include: {
      customer: true,
      lines: {
        include: {
          timeEntries: { include: { user: { select: { name: true } }, project: { select: { name: true } } } },
          kmEntries: { include: { user: { select: { name: true } }, project: { select: { name: true } } } },
        },
      },
    },
  });
  if (!invoice) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(invoice);
}

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;

  const body = await req.json();
  const data = updateSchema.parse(body);
  const invoice = await prisma.invoice.update({
    where: { id },
    data: {
      status: data.status,
      notes: data.notes,
      ...(data.dueDate ? { dueDate: new Date(data.dueDate) } : {}),
    },
  });
  return NextResponse.json(invoice);
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;

  const invoice = await prisma.invoice.findUnique({ where: { id }, select: { lines: { select: { id: true } } } });
  if (invoice) {
    await prisma.timeEntry.updateMany({
      where: { invoiceLineId: { in: invoice.lines.map((l) => l.id) } },
      data: { invoiced: false, invoiceLineId: null },
    });
    await prisma.kmEntry.updateMany({
      where: { invoiceLineId: { in: invoice.lines.map((l) => l.id) } },
      data: { invoiced: false, invoiceLineId: null },
    });
  }
  await prisma.invoice.delete({ where: { id } });
  return NextResponse.json({ success: true });
}
