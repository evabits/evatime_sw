import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { handleError } from "@/lib/api";

export async function GET() {
  try {
    const session = await auth();
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const tags = await prisma.tag.findMany({ orderBy: { name: "asc" } });
    return NextResponse.json(tags);
  } catch (e) { return handleError(e); }
}
