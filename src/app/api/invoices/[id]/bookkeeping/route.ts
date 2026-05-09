import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { handleError } from "@/lib/api";
import { sendBookkeepingEmail } from "@/lib/email";

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await auth();
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const to = process.env.BOOKKEEPING_EMAIL;
    if (!to) return NextResponse.json({ error: "BOOKKEEPING_EMAIL niet geconfigureerd" }, { status: 500 });

    const { id } = await params;
    const [invoice, settings] = await Promise.all([
      prisma.invoice.findUnique({
        where: { id },
        include: {
          customer: true,
          lines: { orderBy: { createdAt: "asc" } },
          attachments: { orderBy: { createdAt: "asc" } },
        },
      }),
      prisma.companySettings.findFirst(),
    ]);

    if (!invoice) return NextResponse.json({ error: "Not found" }, { status: 404 });
    if (invoice.status !== "SENT" && invoice.status !== "PAID")
      return NextResponse.json({ error: "Factuur moet Verzonden of Betaald zijn" }, { status: 400 });

    await sendBookkeepingEmail(invoice, settings);
    return NextResponse.json({ ok: true });
  } catch (e) { return handleError(e); }
}
