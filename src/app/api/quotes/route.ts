import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { z } from "zod";
import { handleError } from "@/lib/api";
import { isAdmin } from "@/lib/roles";

const lineSchema = z.object({
  description: z.string().min(1),
  quantity: z.number().positive(),
  unitPrice: z.number().positive(),
});

const schema = z.object({
  customerId: z.string().min(1),
  issueDate: z.string(),
  validUntil: z.string(),
  vatRate: z.number().min(0).max(100).default(21),
  reference: z.string().optional().nullable(),
  subject: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
  lines: z.array(lineSchema).min(1),
});

async function getNextQuoteNumber(): Promise<string> {
  const year = new Date().getFullYear();
  const count = await prisma.quote.count({
    where: { quoteNumber: { startsWith: `OFF-${year}-` } },
  });
  return `OFF-${year}-${String(count + 1).padStart(4, "0")}`;
}

export async function GET() {
  try {
    const session = await auth();
    if (!session || !isAdmin((session.user as any)?.role)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    const quotes = await prisma.quote.findMany({
      orderBy: { issueDate: "desc" },
      include: { customer: { select: { name: true } } },
    });
    return NextResponse.json(quotes);
  } catch (e) { return handleError(e); }
}

export async function POST(req: Request) {
  try {
    const session = await auth();
    if (!session || !isAdmin((session.user as any)?.role)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    const data = schema.parse(await req.json());
    const subtotal = data.lines.reduce((s, l) => s + l.quantity * l.unitPrice, 0);
    const vatAmount = (subtotal * data.vatRate) / 100;
    const total = subtotal + vatAmount;
    const quoteNumber = await getNextQuoteNumber();

    const quote = await prisma.quote.create({
      data: {
        quoteNumber,
        customerId: data.customerId,
        issueDate: new Date(data.issueDate),
        validUntil: new Date(data.validUntil),
        vatRate: data.vatRate,
        vatAmount,
        subtotal,
        total,
        reference: data.reference ?? null,
        subject: data.subject ?? null,
        notes: data.notes ?? null,
        lines: {
          create: data.lines.map((l) => ({
            description: l.description,
            quantity: l.quantity,
            unitPrice: l.unitPrice,
            total: l.quantity * l.unitPrice,
          })),
        },
      },
      include: { lines: { orderBy: { createdAt: "asc" } }, customer: true },
    });
    return NextResponse.json(quote, { status: 201 });
  } catch (e) { return handleError(e); }
}
