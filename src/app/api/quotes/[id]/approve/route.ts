import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { handleError } from "@/lib/api";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const { searchParams } = new URL(req.url);
    const token = searchParams.get("token");

    if (!token) return NextResponse.json({ error: "Token vereist" }, { status: 400 });

    const quote = await prisma.quote.findUnique({
      where: { id },
      select: { status: true, viewToken: true },
    });

    if (!quote) return NextResponse.json({ error: "Not found" }, { status: 404 });
    if (quote.viewToken !== token) return NextResponse.json({ error: "Ongeldig token" }, { status: 403 });
    if (quote.status !== "SENT") {
      return NextResponse.json({ error: "Offerte kan niet worden goedgekeurd" }, { status: 400 });
    }

    const updated = await prisma.quote.update({
      where: { id },
      data: { status: "APPROVED", approvedAt: new Date() },
      select: { status: true, approvedAt: true },
    });

    return NextResponse.json(updated);
  } catch (e) { return handleError(e); }
}
