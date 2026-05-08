import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { handleError } from "@/lib/api";
import { sendReminderEmail } from "@/lib/email";

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await auth();
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const { id } = await params;

    const [invoice, settings] = await Promise.all([
      prisma.invoice.findUnique({
        where: { id },
        include: { customer: true },
      }),
      prisma.companySettings.findFirst(),
    ]);

    if (!invoice) return NextResponse.json({ error: "Not found" }, { status: 404 });
    if (!invoice.customer.email) return NextResponse.json({ error: "Klant heeft geen e-mailadres" }, { status: 400 });

    await sendReminderEmail(invoice, settings);

    const updated = await prisma.invoice.update({
      where: { id },
      data: { reminderSentAt: new Date() },
    });

    return NextResponse.json({ reminderSentAt: updated.reminderSentAt });
  } catch (e) { return handleError(e); }
}
