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
    // Het adres uit de bedrijfsinstellingen; de omgevingsvariabele is wat er
    // vóór dat veld was, en blijft werken tot het veld is ingevuld.
    const to = settings?.bookkeepingEmail?.trim() || process.env.BOOKKEEPING_EMAIL;
    if (!to) {
      return NextResponse.json(
        { error: "Vul eerst het e-mailadres voor verkoopboekingen in bij de bedrijfsinstellingen" },
        { status: 400 },
      );
    }
    if (invoice.status !== "SENT" && invoice.status !== "PAID")
      return NextResponse.json({ error: "Factuur moet Verzonden of Betaald zijn" }, { status: 400 });

    try {
      await sendBookkeepingEmail(invoice, settings, to);
    } catch (e) {
      console.error("Verkoopboeking versturen mislukt", e);
      const reden = e instanceof Error ? e.message : String(e);
      return NextResponse.json({ error: `Versturen mislukt: ${reden}` }, { status: 502 });
    }
    const bijgewerkt = await prisma.invoice.update({
      where: { id },
      data: { bookkeepingSentAt: new Date() },
      select: { bookkeepingSentAt: true },
    });
    return NextResponse.json({ ok: true, ...bijgewerkt });
  } catch (e) { return handleError(e); }
}
