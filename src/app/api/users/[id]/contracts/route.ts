import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { handleError } from "@/lib/api";
import { contractSelect, serializeContract } from "@/app/api/contracts/route";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await auth();
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if ((session.user as any)?.role !== "ADMIN")
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    const { id } = await params;
    const contracts = await prisma.contract.findMany({
      where: { userId: id },
      orderBy: [{ startDate: "desc" }, { createdAt: "desc" }],
      select: contractSelect,
    });
    return NextResponse.json(contracts.map(serializeContract));
  } catch (e) { return handleError(e); }
}
