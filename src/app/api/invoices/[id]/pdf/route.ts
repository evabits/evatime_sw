import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { handleError } from "@/lib/api";
import { renderToBuffer } from "@react-pdf/renderer";
import { createElement } from "react";
import { InvoicePdf } from "@/components/invoices/invoice-pdf";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await auth();
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const { id } = await params;

    const [invoice, settings] = await Promise.all([
      prisma.invoice.findUnique({
        where: { id },
        include: { customer: true, lines: { orderBy: { createdAt: "asc" } } },
      }),
      prisma.companySettings.findFirst(),
    ]);

    if (!invoice) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const buffer = await renderToBuffer(createElement(InvoicePdf, { invoice, settings }) as any);

    return new Response(buffer.buffer as ArrayBuffer, {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="Factuur-${invoice.invoiceNumber}.pdf"`,
        "Content-Length": String(buffer.byteLength),
      },
    });
  } catch (e) { return handleError(e); }
}
