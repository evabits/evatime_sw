import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { handleError } from "@/lib/api";
import { isAdmin } from "@/lib/roles";
import { renderToBuffer } from "@react-pdf/renderer";
import { createElement } from "react";
import { QuotePdf } from "@/components/quotes/quote-pdf";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await auth();
    if (!session || !isAdmin((session.user as any)?.role)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    const { id } = await params;

    const [quote, settings] = await Promise.all([
      prisma.quote.findUnique({
        where: { id },
        include: { customer: true, lines: { orderBy: { createdAt: "asc" } } },
      }),
      prisma.companySettings.findFirst(),
    ]);

    if (!quote) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const buffer = await renderToBuffer(createElement(QuotePdf, { quote, settings }) as any);

    return new Response(buffer.buffer as ArrayBuffer, {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="Offerte-${quote.quoteNumber}.pdf"`,
        "Content-Length": String(buffer.byteLength),
      },
    });
  } catch (e) { return handleError(e); }
}
