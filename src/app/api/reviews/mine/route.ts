import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { handleError } from "@/lib/api";
import { reviewSelect, serializeReview } from "../route";

export async function GET() {
  try {
    const session = await auth();
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const userId = (session.user as any).id as string;
    const reviews = await prisma.performanceReview.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      select: reviewSelect,
    });
    return NextResponse.json(reviews.map(serializeReview));
  } catch (e) { return handleError(e); }
}
