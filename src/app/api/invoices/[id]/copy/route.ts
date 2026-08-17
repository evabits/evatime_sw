import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { canEditInvoices } from "@/lib/roles";
import { handleError } from "@/lib/api";
import { invoiceCopyData } from "@/lib/invoice-copy";
import { nextInvoiceNumber } from "@/lib/invoice-number";

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await auth();
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const role = (session.user as any)?.role ?? "EMPLOYEE";
    if (!canEditInvoices(role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const { id } = await params;
    const bron = await prisma.invoice.findUnique({
      where: { id },
      include: {
        lines: { orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }] },
        attachments: { orderBy: { createdAt: "asc" } },
      },
    });
    if (!bron) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const { invoice, lines } = invoiceCopyData(bron as any, new Date());

    const kopie = await prisma.invoice.create({
      data: {
        ...invoice,
        invoiceNumber: await nextInvoiceNumber(),
        lines: { create: lines },
        // Dezelfde bestanden, geen nieuwe upload. De verwijderroute van bijlagen
        // telt inmiddels ook de bijlagen van andere facturen, zodat een bijlage
        // weggooien bij de kopie het bestand bij de bron laat staan.
        attachments: {
          create: bron.attachments.map((a) => ({ filename: a.filename, url: a.url, size: a.size })),
        },
      },
      include: { lines: true, customer: true, attachments: true },
    });

    return NextResponse.json(kopie, { status: 201 });
  } catch (e) { return handleError(e); }
}
