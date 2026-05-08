import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";

export async function GET(req: Request) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const from = searchParams.get("from");
  const to = searchParams.get("to");
  const customerId = searchParams.get("customerId");
  const projectId = searchParams.get("projectId");
  const userId = searchParams.get("userId");
  const billable = searchParams.get("billable");

  const dateFilter = {
    ...(from ? { gte: new Date(from) } : {}),
    ...(to ? { lte: new Date(to) } : {}),
  };

  const [timeEntries, kmEntries] = await Promise.all([
    prisma.timeEntry.findMany({
      where: {
        ...(from || to ? { date: dateFilter } : {}),
        ...(projectId ? { projectId } : customerId ? { project: { customerId } } : {}),
        ...(userId ? { userId } : {}),
        ...(billable !== null ? { billable: billable === "true" } : {}),
      },
      include: {
        project: { select: { id: true, name: true, customer: { select: { id: true, name: true } } } },
        activityType: { select: { id: true, name: true, defaultRate: true } },
        user: { select: { id: true, name: true } },
      },
      orderBy: { date: "desc" },
    }),
    prisma.kmEntry.findMany({
      where: {
        ...(from || to ? { date: dateFilter } : {}),
        ...(projectId ? { projectId } : customerId ? { project: { customerId } } : {}),
        ...(userId ? { userId } : {}),
        ...(billable !== null ? { billable: billable === "true" } : {}),
      },
      include: {
        project: { select: { id: true, name: true, defaultKmRate: true, customer: { select: { id: true, name: true } } } },
        user: { select: { id: true, name: true } },
      },
      orderBy: { date: "desc" },
    }),
  ]);

  return NextResponse.json({ timeEntries, kmEntries });
}
