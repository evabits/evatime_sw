import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { handleError } from "@/lib/api";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await auth();
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const { id } = await params;

    const expense = await prisma.expense.findUnique({ where: { id }, select: { receiptUrl: true } });
    if (!expense?.receiptUrl) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const blobRes = await fetch(expense.receiptUrl, {
      headers: { Authorization: `Bearer ${process.env.BLOB_READ_WRITE_TOKEN}` },
    });
    if (!blobRes.ok) return NextResponse.json({ error: "Bestand niet beschikbaar" }, { status: 502 });

    const contentType = blobRes.headers.get("content-type") ?? "application/octet-stream";
    const body = await blobRes.arrayBuffer();
    const filename = expense.receiptUrl.split("/").pop() ?? "bon";

    return new Response(body, {
      headers: {
        "Content-Type": contentType,
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    });
  } catch (e) { return handleError(e); }
}
