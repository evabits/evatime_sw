import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { handleError } from "@/lib/api";
import { isAdmin } from "@/lib/roles";
import { nextInvoiceNumber } from "@/lib/invoice-number";
import { invoiceFromQuote, quoteConvertDenial, vandaagInAmsterdam } from "@/lib/quote-invoice";

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

    const weigering = quoteConvertDenial(quote.status);
    if (weigering) return NextResponse.json({ error: weigering }, { status: 400 });

    // Het gedeelde nummer, dat naar het hoogste bestaande kijkt. Tellen hoeveel
    // facturen er zijn gaf na een verwijderde factuur een nummer dat al bestond.
    const invoiceNumber = await nextInvoiceNumber();
    const { lines, ...factuur } = invoiceFromQuote(quote, vandaagInAmsterdam());

    const invoice = await prisma.$transaction(async (tx) => {
      const inv = await tx.invoice.create({
        data: { ...factuur, invoiceNumber, lines: { create: lines } },
      });
      // Wie factureert, heeft een akkoord. Staat de offerte nog op concept of
      // verzonden, dan is dat akkoord buiten de goedkeurknop om gekomen.
      if (quote.status !== "APPROVED") {
        await tx.quote.update({
          where: { id: quote.id },
          data: { status: "APPROVED", approvedAt: new Date() },
        });
      }
      return inv;
    });

    return NextResponse.json({ invoiceId: invoice.id }, { status: 201 });
  } catch (e) { return handleError(e); }
}
