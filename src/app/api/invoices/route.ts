import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { z } from "zod";

const lineSchema = z.object({
  description: z.string().min(1),
  quantity: z.number().positive(),
  unitPrice: z.number().positive(),
  lineType: z.enum(["HOURS", "KM", "OTHER"]),
  timeEntryIds: z.array(z.string()).optional(),
  kmEntryIds: z.array(z.string()).optional(),
});

const schema = z.object({
  customerId: z.string().min(1),
  issueDate: z.string(),
  dueDate: z.string(),
  vatRate: z.number().min(0).max(100).default(21),
  notes: z.string().optional(),
  lines: z.array(lineSchema).min(1),
});

async function getNextInvoiceNumber(): Promise<string> {
  const year = new Date().getFullYear();
  const count = await prisma.invoice.count({
    where: { invoiceNumber: { startsWith: `${year}-` } },
  });
  return `${year}-${String(count + 1).padStart(4, "0")}`;
}

export async function GET() {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const invoices = await prisma.invoice.findMany({
    orderBy: { issueDate: "desc" },
    include: { customer: { select: { name: true } } },
  });
  return NextResponse.json(invoices);
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const data = schema.parse(body);

  const subtotal = data.lines.reduce((sum, l) => sum + l.quantity * l.unitPrice, 0);
  const vatAmount = (subtotal * data.vatRate) / 100;
  const total = subtotal + vatAmount;
  const invoiceNumber = await getNextInvoiceNumber();

  const invoice = await prisma.$transaction(async (tx) => {
    const inv = await tx.invoice.create({
      data: {
        invoiceNumber,
        customerId: data.customerId,
        issueDate: new Date(data.issueDate),
        dueDate: new Date(data.dueDate),
        vatRate: data.vatRate,
        vatAmount,
        subtotal,
        total,
        notes: data.notes,
        lines: {
          create: data.lines.map((l) => ({
            description: l.description,
            quantity: l.quantity,
            unitPrice: l.unitPrice,
            total: l.quantity * l.unitPrice,
            lineType: l.lineType,
          })),
        },
      },
      include: { lines: true },
    });

    for (const line of data.lines) {
      const createdLine = inv.lines.find(
        (l) => l.description === line.description && l.lineType === line.lineType
      );
      if (!createdLine) continue;

      if (line.timeEntryIds?.length) {
        await tx.timeEntry.updateMany({
          where: { id: { in: line.timeEntryIds } },
          data: { invoiced: true, invoiceLineId: createdLine.id },
        });
      }
      if (line.kmEntryIds?.length) {
        await tx.kmEntry.updateMany({
          where: { id: { in: line.kmEntryIds } },
          data: { invoiced: true, invoiceLineId: createdLine.id },
        });
      }
    }

    return inv;
  });

  return NextResponse.json(invoice, { status: 201 });
}
