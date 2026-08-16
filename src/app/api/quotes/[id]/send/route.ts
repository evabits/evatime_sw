import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { handleError } from "@/lib/api";
import { isAdmin } from "@/lib/roles";
import { sendQuoteEmail } from "@/lib/email";

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await auth();
    if (!session || !isAdmin((session.user as any)?.role)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    const { id } = await params;

    const [quote, settings] = await Promise.all([
      prisma.quote.findUnique({
        where: { id },
        include: {
          customer: true,
          lines: { orderBy: { createdAt: "asc" } },
          attachments: { orderBy: { createdAt: "asc" } },
        },
      }),
      prisma.companySettings.findFirst(),
    ]);

    if (!quote) return NextResponse.json({ error: "Not found" }, { status: 404 });
    if (!quote.customer.email) return NextResponse.json({ error: "Klant heeft geen e-mailadres" }, { status: 400 });

    try {
      await sendQuoteEmail(quote, settings);
    } catch (e) {
      // Net als bij de factuur: de reden van de mailserver in beeld in plaats
      // van een kale "Internal server error".
      console.error("Offerte verzenden mislukt", e);
      const reden = e instanceof Error ? e.message : String(e);
      return NextResponse.json({ error: `Verzenden mislukt: ${reden}` }, { status: 502 });
    }

    const updated = await prisma.quote.update({
      where: { id },
      data: {
        sentAt: new Date(),
        ...(quote.status === "DRAFT" ? { status: "SENT" } : {}),
      },
    });

    return NextResponse.json({ sentAt: updated.sentAt, status: updated.status });
  } catch (e) { return handleError(e); }
}
