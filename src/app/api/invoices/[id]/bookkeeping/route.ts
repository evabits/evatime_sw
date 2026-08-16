import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { handleError } from "@/lib/api";
import { sendBookkeepingEmail } from "@/lib/email";
import { canEditInvoices } from "@/lib/roles";

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await auth();
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const role = (session.user as any)?.role ?? "EMPLOYEE";
    if (!canEditInvoices(role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const to = process.env.BOOKKEEPING_EMAIL;
    if (!to) return NextResponse.json({ error: "BOOKKEEPING_EMAIL niet geconfigureerd" }, { status: 500 });

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
    if (invoice.status !== "SENT" && invoice.status !== "PAID")
      return NextResponse.json({ error: "Factuur moet Verzonden of Betaald zijn" }, { status: 400 });

    try {
      await sendBookkeepingEmail(invoice, settings);
    } catch (e) {
      console.error("Verkoopboeking versturen mislukt", e);
      const reden = e instanceof Error ? e.message : String(e);
      return NextResponse.json({ error: `Versturen mislukt: ${reden}` }, { status: 502 });
    }
    return NextResponse.json({ ok: true });
  } catch (e) { return handleError(e); }
}
