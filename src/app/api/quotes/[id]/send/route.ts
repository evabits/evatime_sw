import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { handleError } from "@/lib/api";
import { z } from "zod";
import { isAdmin } from "@/lib/roles";
import { sendQuoteEmail } from "@/lib/email";

// Een offerte gaat niet altijd naar het adres in de klantgegevens: soms naar een
// projectleider, soms naar een inkoopafdeling. Dit geldt alleen voor deze
// verzending en wordt niet bewaard.
const schema = z.object({ email: z.string().trim().optional() });

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await auth();
    if (!session || !isAdmin((session.user as any)?.role)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    const { id } = await params;
    // Een verzoek zonder body is een verzending naar het adres van de klant,
    // zoals het altijd al ging.
    const { email } = schema.parse(await req.json().catch(() => ({})));

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
    // Eigen controle en geen zod .email(): handleError noemt wel het veld, maar
    // "Controleer de invoer: email" zegt niet dat het adres zelf ongeldig is.
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return NextResponse.json({ error: "Geen geldig e-mailadres" }, { status: 400 });
    }

    const naar = email || quote.customer.email;
    if (!naar) return NextResponse.json({ error: "Klant heeft geen e-mailadres" }, { status: 400 });

    try {
      await sendQuoteEmail(quote, settings, naar);
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
