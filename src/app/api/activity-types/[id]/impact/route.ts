import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { handleError } from "@/lib/api";
import { isAdmin } from "@/lib/roles";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await auth();
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const role = (session.user as any)?.role ?? "EMPLOYEE";
    if (!isAdmin(role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const { id } = await params;
    const [timeAgg, kmCount, timeProjects, kmProjects] = await Promise.all([
      prisma.timeEntry.aggregate({ where: { activityTypeId: id }, _count: true, _sum: { hours: true } }),
      prisma.kmEntry.count({ where: { activityTypeId: id } }),
      prisma.timeEntry.findMany({ where: { activityTypeId: id }, distinct: ["projectId"], select: { projectId: true } }),
      prisma.kmEntry.findMany({ where: { activityTypeId: id }, distinct: ["projectId"], select: { projectId: true } }),
    ]);

    const projectIds = Array.from(
      new Set([...timeProjects, ...kmProjects].map((p) => p.projectId)),
    );

    return NextResponse.json({
      timeEntries: timeAgg._count,
      kmEntries: kmCount,
      hours: Number(timeAgg._sum.hours ?? 0),
      projectIds,
    });
  } catch (e) { return handleError(e); }
}
