import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { handleError } from "@/lib/api";
import { reviewSelect, serializeReview } from "../route";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await auth();
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const { id } = await params;
    const review = await prisma.performanceReview.findUnique({ where: { id }, select: reviewSelect });
    if (!review) return NextResponse.json({ error: "Not found" }, { status: 404 });
    const me = session.user as any;
    if (me.role !== "ADMIN" && review.userId !== me.id)
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    return NextResponse.json(serializeReview(review));
  } catch (e) { return handleError(e); }
}
