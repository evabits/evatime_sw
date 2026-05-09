import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { handleError } from "@/lib/api";

export async function GET(req: Request) {
  try {
    const session = await auth();
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { searchParams } = new URL(req.url);
    const from = searchParams.get("from");
    const to = searchParams.get("to");
    const customerId = searchParams.get("customerId");
    const projectId = searchParams.get("projectId");
    const userId = searchParams.get("userId");
    const billable = searchParams.get("billable");
    const tagIds = searchParams.get("tags")?.split(",").filter(Boolean) ?? [];

    const dateFilter = {
      ...(from ? { gte: new Date(from) } : {}),
      ...(to ? { lte: new Date(to) } : {}),
    };

    const projectFilter = projectId
      ? { projectId }
      : customerId || tagIds.length > 0
      ? {
          project: {
            ...(customerId ? { customerId } : {}),
            ...(tagIds.length > 0 ? { tags: { some: { id: { in: tagIds } } } } : {}),
          },
        }
      : {};

    const [timeEntries, kmEntries, expenses] = await Promise.all([
      prisma.timeEntry.findMany({
        where: {
          ...(from || to ? { date: dateFilter } : {}),
          ...projectFilter,
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
          ...projectFilter,
          ...(userId ? { userId } : {}),
          ...(billable !== null ? { billable: billable === "true" } : {}),
        },
        include: {
          project: { select: { id: true, name: true, defaultKmRate: true, customer: { select: { id: true, name: true } } } },
          user: { select: { id: true, name: true } },
        },
        orderBy: { date: "desc" },
      }),
      prisma.expense.findMany({
        where: {
          ...(from || to ? { date: dateFilter } : {}),
          ...projectFilter,
          ...(userId ? { userId } : {}),
          ...(billable !== null ? { billable: billable === "true" } : {}),
        },
        include: {
          category: { select: { id: true, name: true } },
          project: { select: { id: true, name: true, customer: { select: { id: true, name: true } } } },
          user: { select: { id: true, name: true } },
        },
        orderBy: { date: "desc" },
      }),
    ]);

    return NextResponse.json({ timeEntries, kmEntries, expenses });
  } catch (e) { return handleError(e); }
}
