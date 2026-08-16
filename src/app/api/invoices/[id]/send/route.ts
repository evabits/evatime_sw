import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { handleError } from "@/lib/api";
import { sendInvoiceEmail } from "@/lib/email";
import { canEditInvoices } from "@/lib/roles";

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await auth();
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    // Verzenden is een handeling naar buiten. De andere factuurroutes eisen dit
    // recht al; deze deed het niet, waardoor elke ingelogde medewerker een
    // factuur naar een klant kon sturen.
    const role = (session.user as any)?.role ?? "EMPLOYEE";
    if (!canEditInvoices(role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    const { id } = await params;

    const [invoice, settings] = await Promise.all([
      prisma.invoice.findUnique({
        where: { id },
        include: {
          customer: true,
          lines: { orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }] },
          attachments: { orderBy: { createdAt: "asc" } },
        },
      }),
      prisma.companySettings.findFirst(),
    ]);

    if (!invoice) return NextResponse.json({ error: "Not found" }, { status: 404 });
    if (!invoice.customer.email) return NextResponse.json({ error: "Klant heeft geen e-mailadres" }, { status: 400 });

    try {
      await sendInvoiceEmail(invoice, settings);
    } catch (e) {
      // De reden van de mailserver komt hier terug in plaats van een kale
      // "Internal server error": zonder die tekst is er niets te zoeken, en dit
      // is een beheerdersscherm.
      console.error("Factuur verzenden mislukt", e);
      const reden = e instanceof Error ? e.message : String(e);
      return NextResponse.json({ error: `Verzenden mislukt: ${reden}` }, { status: 502 });
    }

    const updated = await prisma.invoice.update({
      where: { id },
      data: {
        sentAt: new Date(),
        ...(invoice.status === "DRAFT" ? { status: "SENT" } : {}),
      },
    });

    return NextResponse.json({ sentAt: updated.sentAt, status: updated.status });
  } catch (e) { return handleError(e); }
}
