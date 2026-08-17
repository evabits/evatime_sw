import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { del } from "@vercel/blob";
import { handleError } from "@/lib/api";

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string; attachmentId: string }> }
) {
  try {
    const session = await auth();
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const { attachmentId } = await params;

    const attachment = await prisma.invoiceAttachment.findUnique({ where: { id: attachmentId } });
    if (!attachment) return NextResponse.json({ error: "Not found" }, { status: 404 });

    // Een bijlage die uit een uitgave komt wijst naar hetzelfde bestand als
    // het bonnetje daar. Het bestand wissen zou dat bonnetje meenemen, en dan
    // is een uitgave zijn bewijs kwijt door een handeling op een heel ander
    // scherm. Sinds een factuur te kopiëren is geldt hetzelfde tussen facturen
    // onderling: de kopie wijst naar dezelfde bestanden als de bron. Alleen
    // wissen als niemand er meer naar wijst.
    const [bijUitgaven, bijAndereFacturen] = await Promise.all([
      prisma.expense.count({ where: { receiptUrl: attachment.url } }),
      prisma.invoiceAttachment.count({ where: { url: attachment.url, id: { not: attachmentId } } }),
    ]);
    if (bijUitgaven + bijAndereFacturen === 0) await del(attachment.url);
    await prisma.invoiceAttachment.delete({ where: { id: attachmentId } });

    return NextResponse.json({ success: true });
  } catch (e) { return handleError(e); }
}
