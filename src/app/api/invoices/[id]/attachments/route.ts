import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { put } from "@vercel/blob";
import { handleError } from "@/lib/api";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await auth();
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const { id } = await params;

    const invoice = await prisma.invoice.findUnique({ where: { id }, select: { id: true } });
    if (!invoice) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const formData = await req.formData();
    const file = formData.get("file") as File | null;
    if (!file) return NextResponse.json({ error: "Geen bestand" }, { status: 400 });

    const blob = await put(`invoices/${id}/${file.name}`, file, { access: "private" });

    const attachment = await prisma.invoiceAttachment.create({
      data: {
        invoiceId: id,
        filename: file.name,
        url: blob.url,
        size: file.size,
      },
    });

    return NextResponse.json(attachment, { status: 201 });
  } catch (e) { return handleError(e); }
}
