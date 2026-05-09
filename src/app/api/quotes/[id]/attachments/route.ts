import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { put } from "@vercel/blob";
import { handleError } from "@/lib/api";
import { isAdmin } from "@/lib/roles";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await auth();
    if (!session || !isAdmin((session.user as any)?.role)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    const { id } = await params;

    const quote = await prisma.quote.findUnique({ where: { id }, select: { id: true } });
    if (!quote) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const formData = await req.formData();
    const file = formData.get("file") as File | null;
    if (!file) return NextResponse.json({ error: "Geen bestand" }, { status: 400 });

    const blob = await put(`quotes/${id}/${file.name}`, file, { access: "private" });

    const attachment = await prisma.quoteAttachment.create({
      data: { quoteId: id, filename: file.name, url: blob.url, size: file.size },
    });

    return NextResponse.json(attachment, { status: 201 });
  } catch (e) { return handleError(e); }
}
