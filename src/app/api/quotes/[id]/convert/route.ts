import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { handleError } from "@/lib/api";
import { isAdmin } from "@/lib/roles";

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await auth();
    if (!session || !isAdmin((session.user as any)?.role)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    const { id } = await params;

    const quote = await prisma.quote.findUnique({
      where: { id },
      include: { lines: { orderBy: { createdAt: "asc" } } },
    });
    if (!quote) return NextResponse.json({ error: "Not found" }, { status: 404 });
    if (quote.status !== "APPROVED") {
      return NextResponse.json({ error: "Alleen goedgekeurde offertes kunnen worden omgezet" }, { status: 400 });
    }

    const year = new Date().getFullYear();
    const count = await prisma.invoice.count({
      where: { invoiceNumber: { startsWith: `${year}-` } },
    });
    const invoiceNumber = `${year}-${String(count + 1).padStart(4, "0")}`;
    const today = new Date();
    const dueDate = new Date(today);
    dueDate.setDate(dueDate.getDate() + 30);

    const invoice = await prisma.invoice.create({
      data: {
        invoiceNumber,
        customerId: quote.customerId,
        issueDate: today,
        dueDate,
        vatRate: quote.vatRate,
        vatAmount: quote.vatAmount,
        subtotal: quote.subtotal,
        total: quote.total,
        reference: quote.reference,
        subject: quote.subject,
        notes: quote.notes,
        lines: {
          create: quote.lines.map((l) => ({
            description: l.description,
            quantity: l.quantity,
            unitPrice: l.unitPrice,
            total: l.total,
            lineType: "OTHER" as const,
          })),
        },
      },
    });

    return NextResponse.json({ invoiceId: invoice.id }, { status: 201 });
  } catch (e) { return handleError(e); }
}
