import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { handleError } from "@/lib/api";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string; attachmentId: string }> }
) {
  try {
    const session = await auth();
    if ((session?.user as any)?.role !== "ADMIN")
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    const { attachmentId } = await params;

    const attachment = await prisma.contractAttachment.findUnique({ where: { id: attachmentId } });
    if (!attachment) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const blobRes = await fetch(attachment.url, {
      headers: { Authorization: `Bearer ${process.env.BLOB_READ_WRITE_TOKEN}` },
    });
    if (!blobRes.ok) return NextResponse.json({ error: "Blob niet beschikbaar" }, { status: 502 });

    const contentType = blobRes.headers.get("content-type") ?? "application/octet-stream";
    const body = await blobRes.arrayBuffer();

    return new Response(body, {
      headers: {
        "Content-Type": contentType,
        "Content-Disposition": `attachment; filename="${attachment.filename}"`,
        "Content-Length": String(body.byteLength),
      },
    });
  } catch (e) { return handleError(e); }
}
