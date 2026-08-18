import { auth } from "@/lib/auth";
import { canViewReports } from "@/lib/roles";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { handleError } from "@/lib/api";
import { projectWhereForRequiredProject, projectWhereForOptionalProject, invoicedWhere } from "@/lib/report-filters";

export async function GET(req: Request) {
  try {
    const session = await auth();
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const role = (session.user as any)?.role ?? "EMPLOYEE";
    if (!canViewReports(role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const { searchParams } = new URL(req.url);
    const from = searchParams.get("from");
    const to = searchParams.get("to");
    const customerId = searchParams.get("customerId");
    const projectId = searchParams.get("projectId");
    const userId = searchParams.get("userId");
    const billable = searchParams.get("billable");
    const invoicedFilter = invoicedWhere(searchParams.get("invoiced"));
    const tagIds = searchParams.get("tags")?.split(",").filter(Boolean) ?? [];

    const dateFilter = {
      ...(from ? { gte: new Date(from) } : {}),
      ...(to ? { lte: new Date(to) } : {}),
    };

    const filterParams = { projectId, customerId, tagIds, billable };

    const [timeEntries, kmEntries, expenses] = await Promise.all([
      prisma.timeEntry.findMany({
        where: {
          ...(from || to ? { date: dateFilter } : {}),
          ...(userId ? { userId } : {}),
          ...invoicedFilter,
          ...projectWhereForRequiredProject(filterParams),
        },
        include: {
          project: {
            select: {
              id: true, name: true,
              billable: true,
              levelRates: true,
              customer: { select: { id: true, name: true, levelRates: true } },
            },
          },
          user: { select: { id: true, name: true, workLevel: true } },
        },
        orderBy: { date: "desc" },
      }),
      prisma.kmEntry.findMany({
        where: {
          ...(from || to ? { date: dateFilter } : {}),
          ...(userId ? { userId } : {}),
          ...invoicedFilter,
          ...projectWhereForRequiredProject(filterParams),
        },
        include: {
          project: { select: { id: true, name: true, billable: true, defaultKmRate: true, customer: { select: { id: true, name: true } } } },
          user: { select: { id: true, name: true } },
        },
        orderBy: { date: "desc" },
      }),
      prisma.expense.findMany({
        where: {
          ...(from || to ? { date: dateFilter } : {}),
          ...(userId ? { userId } : {}),
          ...invoicedFilter,
          ...projectWhereForOptionalProject(filterParams),
        },
        include: {
          category: { select: { id: true, name: true } },
          project: { select: { id: true, name: true, billable: true, customer: { select: { id: true, name: true } } } },
          user: { select: { id: true, name: true } },
        },
        orderBy: { date: "desc" },
      }),
    ]);

    return NextResponse.json({ timeEntries, kmEntries, expenses });
  } catch (e) { return handleError(e); }
}
