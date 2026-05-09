import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { z } from "zod";
import { handleError } from "@/lib/api";
import { canViewInvoices, canEditInvoices } from "@/lib/roles";

const lineSchema = z.object({
  id: z.string().optional(),
  description: z.string().min(1),
  quantity: z.number(),
  unitPrice: z.number(),
  lineType: z.enum(["HOURS", "KM", "OTHER"]),
});

const updateSchema = z.object({
  status: z.enum(["DRAFT", "SENT", "PAID", "CANCELLED"]).optional(),
  notes: z.string().optional().nullable(),
  reference: z.string().optional().nullable(),
  subject: z.string().optional().nullable(),
  issueDate: z.string().optional(),
  dueDate: z.string().optional(),
  vatRate: z.number().min(0).max(100).optional(),
  lines: z.array(lineSchema).optional(),
  lineIdsToDelete: z.array(z.string()).optional(),
  sentAt: z.string().optional().nullable(),
  reminderSentAt: z.string().optional().nullable(),
});

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await auth();
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const role = (session.user as any)?.role ?? "EMPLOYEE";
    if (!canViewInvoices(role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    const { id } = await params;

    const invoice = await prisma.invoice.findUnique({
      where: { id },
      include: {
        customer: true,
        lines: { orderBy: { createdAt: "asc" } },
        attachments: { orderBy: { createdAt: "asc" } },
      },
    });
    if (!invoice) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json(invoice);
  } catch (e) { return handleError(e); }
}

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await auth();
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const role = (session.user as any)?.role ?? "EMPLOYEE";
    if (!canEditInvoices(role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    const { id } = await params;

    const data = updateSchema.parse(await req.json());
    const existing = await prisma.invoice.findUnique({ where: { id }, select: { status: true, vatRate: true, lines: { select: { id: true } } } });
    if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

    if (data.lines !== undefined && existing.status !== "DRAFT") {
      return NextResponse.json({ error: "Alleen concept facturen kunnen worden bewerkt" }, { status: 400 });
    }

    const invoice = await prisma.$transaction(async (tx) => {
      // Delete removed lines and unlink their entries
      if (data.lineIdsToDelete?.length) {
        await tx.timeEntry.updateMany({
          where: { invoiceLineId: { in: data.lineIdsToDelete } },
          data: { invoiced: false, invoiceLineId: null },
        });
        await tx.kmEntry.updateMany({
          where: { invoiceLineId: { in: data.lineIdsToDelete } },
          data: { invoiced: false, invoiceLineId: null },
        });
        await tx.invoiceLine.deleteMany({ where: { id: { in: data.lineIdsToDelete } } });
      }

      // Upsert lines
      if (data.lines) {
        for (const line of data.lines) {
          const lineData = {
            description: line.description,
            quantity: line.quantity,
            unitPrice: line.unitPrice,
            total: line.quantity * line.unitPrice,
            lineType: line.lineType,
          };
          if (line.id) {
            await tx.invoiceLine.update({ where: { id: line.id }, data: lineData });
          } else {
            await tx.invoiceLine.create({ data: { ...lineData, invoiceId: id } });
          }
        }
      }

      // Recompute totals if lines changed
      let subtotal: number | undefined;
      let vatAmount: number | undefined;
      let total: number | undefined;
      if (data.lines !== undefined || data.lineIdsToDelete?.length) {
        const allLines = await tx.invoiceLine.findMany({ where: { invoiceId: id } });
        const vatRate = data.vatRate ?? Number(existing.vatRate);
        subtotal = allLines.reduce((s, l) => s + Number(l.total), 0);
        vatAmount = (subtotal * vatRate) / 100;
        total = subtotal + vatAmount;
      }

      return tx.invoice.update({
        where: { id },
        data: {
          ...(data.status !== undefined ? { status: data.status } : {}),
          ...(data.notes !== undefined ? { notes: data.notes } : {}),
          ...(data.reference !== undefined ? { reference: data.reference } : {}),
          ...(data.subject !== undefined ? { subject: data.subject } : {}),
          ...(data.issueDate ? { issueDate: new Date(data.issueDate) } : {}),
          ...(data.dueDate ? { dueDate: new Date(data.dueDate) } : {}),
          ...(data.vatRate !== undefined ? { vatRate: data.vatRate } : {}),
          ...(subtotal !== undefined ? { subtotal, vatAmount, total } : {}),
          ...(data.sentAt !== undefined ? { sentAt: data.sentAt ? new Date(data.sentAt) : null } : {}),
          ...(data.reminderSentAt !== undefined ? { reminderSentAt: data.reminderSentAt ? new Date(data.reminderSentAt) : null } : {}),
        },
        include: { lines: { orderBy: { createdAt: "asc" } }, customer: true, attachments: { orderBy: { createdAt: "asc" } } },
      });
    });

    return NextResponse.json(invoice);
  } catch (e) { return handleError(e); }
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await auth();
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const role = (session.user as any)?.role ?? "EMPLOYEE";
    if (!canEditInvoices(role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    const { id } = await params;

    const invoice = await prisma.invoice.findUnique({ where: { id }, select: { lines: { select: { id: true } } } });
    if (invoice) {
      const lineIds = invoice.lines.map((l) => l.id);
      await prisma.timeEntry.updateMany({ where: { invoiceLineId: { in: lineIds } }, data: { invoiced: false, invoiceLineId: null } });
      await prisma.kmEntry.updateMany({ where: { invoiceLineId: { in: lineIds } }, data: { invoiced: false, invoiceLineId: null } });
      await prisma.expense.updateMany({ where: { invoiceLineId: { in: lineIds } }, data: { invoiced: false, invoiceLineId: null } });
    }
    await prisma.invoice.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (e) { return handleError(e); }
}
