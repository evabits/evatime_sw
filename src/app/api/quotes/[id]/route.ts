import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { z } from "zod";
import { handleError } from "@/lib/api";
import { isAdmin } from "@/lib/roles";

const lineSchema = z.object({
  id: z.string().optional(),
  description: z.string().min(1),
  quantity: z.number(),
  unitPrice: z.number(),
});

const updateSchema = z.object({
  customerId: z.string().optional(),
  issueDate: z.string().optional(),
  validUntil: z.string().optional(),
  vatRate: z.number().min(0).max(100).optional(),
  reference: z.string().optional().nullable(),
  subject: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
  status: z.enum(["DRAFT", "SENT", "APPROVED", "CANCELLED"]).optional(),
  lines: z.array(lineSchema).optional(),
  lineIdsToDelete: z.array(z.string()).optional(),
  sentAt: z.string().optional().nullable(),
  approvedAt: z.string().optional().nullable(),
});

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await auth();
    if (!session || !isAdmin((session.user as any)?.role)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    const { id } = await params;
    const quote = await prisma.quote.findUnique({
      where: { id },
      include: {
        customer: true,
        lines: { orderBy: { createdAt: "asc" } },
        attachments: { orderBy: { createdAt: "asc" } },
      },
    });
    if (!quote) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json(quote);
  } catch (e) { return handleError(e); }
}

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await auth();
    if (!session || !isAdmin((session.user as any)?.role)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    const { id } = await params;
    const existing = await prisma.quote.findUnique({ where: { id }, select: { status: true, vatRate: true } });
    if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });
    if (existing.status === "APPROVED" || existing.status === "CANCELLED") {
      return NextResponse.json({ error: "Kan goedgekeurde of geannuleerde offertes niet bewerken" }, { status: 400 });
    }

    const data = updateSchema.parse(await req.json());

    const quote = await prisma.$transaction(async (tx) => {
      if (data.lineIdsToDelete?.length) {
        await tx.quoteLine.deleteMany({ where: { id: { in: data.lineIdsToDelete } } });
      }

      if (data.lines) {
        for (const line of data.lines) {
          const lineData = {
            description: line.description,
            quantity: line.quantity,
            unitPrice: line.unitPrice,
            total: line.quantity * line.unitPrice,
          };
          if (line.id) {
            await tx.quoteLine.update({ where: { id: line.id }, data: lineData });
          } else {
            await tx.quoteLine.create({ data: { ...lineData, quoteId: id } });
          }
        }
      }

      let subtotal: number | undefined;
      let vatAmount: number | undefined;
      let total: number | undefined;
      if (data.lines !== undefined || data.lineIdsToDelete?.length || data.vatRate !== undefined) {
        const allLines = await tx.quoteLine.findMany({ where: { quoteId: id } });
        const vatRate = data.vatRate ?? Number(existing.vatRate);
        subtotal = allLines.reduce((s, l) => s + Number(l.total), 0);
        vatAmount = (subtotal * vatRate) / 100;
        total = subtotal + vatAmount;
      }

      return tx.quote.update({
        where: { id },
        data: {
          ...(data.customerId ? { customerId: data.customerId } : {}),
          ...(data.issueDate ? { issueDate: new Date(data.issueDate) } : {}),
          ...(data.validUntil ? { validUntil: new Date(data.validUntil) } : {}),
          ...(data.vatRate !== undefined ? { vatRate: data.vatRate } : {}),
          ...(data.reference !== undefined ? { reference: data.reference } : {}),
          ...(data.subject !== undefined ? { subject: data.subject } : {}),
          ...(data.notes !== undefined ? { notes: data.notes } : {}),
          ...(data.status !== undefined ? { status: data.status } : {}),
          ...(data.sentAt !== undefined ? { sentAt: data.sentAt ? new Date(data.sentAt) : null } : {}),
          ...(data.approvedAt !== undefined ? { approvedAt: data.approvedAt ? new Date(data.approvedAt) : null } : {}),
          ...(subtotal !== undefined ? { subtotal, vatAmount, total } : {}),
        },
        include: {
          lines: { orderBy: { createdAt: "asc" } },
          customer: true,
          attachments: { orderBy: { createdAt: "asc" } },
        },
      });
    });

    return NextResponse.json(quote);
  } catch (e) { return handleError(e); }
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await auth();
    if (!session || !isAdmin((session.user as any)?.role)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    const { id } = await params;
    const existing = await prisma.quote.findUnique({ where: { id }, select: { status: true } });
    if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });
    if (existing.status === "APPROVED") {
      return NextResponse.json({ error: "Goedgekeurde offertes kunnen niet worden verwijderd" }, { status: 400 });
    }
    await prisma.quote.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (e) { return handleError(e); }
}
