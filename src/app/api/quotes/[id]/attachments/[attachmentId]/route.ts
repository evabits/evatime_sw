import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { del } from "@vercel/blob";
import { handleError } from "@/lib/api";
import { isAdmin } from "@/lib/roles";

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string; attachmentId: string }> }
) {
  try {
    const session = await auth();
    if (!session || !isAdmin((session.user as any)?.role)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    const { attachmentId } = await params;

    const attachment = await prisma.quoteAttachment.findUnique({ where: { id: attachmentId } });
    if (!attachment) return NextResponse.json({ error: "Not found" }, { status: 404 });

    await del(attachment.url);
    await prisma.quoteAttachment.delete({ where: { id: attachmentId } });

    return NextResponse.json({ success: true });
  } catch (e) { return handleError(e); }
}
