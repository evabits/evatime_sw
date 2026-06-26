import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { handleError } from "@/lib/api";
import { buildPayrollRows, weeksInMonth, type PayrollUser } from "@/lib/payroll";

export async function GET(req: Request) {
  try {
    const session = await auth();
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if ((session.user as any)?.role !== "ADMIN") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { searchParams } = new URL(req.url);
    const monthParam = searchParams.get("month"); // "YYYY-MM"
    const now = new Date();
    const [year, month] = monthParam
      ? monthParam.split("-").map(Number)
      : [now.getFullYear(), now.getMonth() + 1];

    if (!year || !month || month < 1 || month > 12) {
      return NextResponse.json({ error: "invalid month" }, { status: 400 });
    }

    // [from, to) — first day of month to first day of next month (date columns, UTC)
    const from = new Date(Date.UTC(year, month - 1, 1));
    const to = new Date(Date.UTC(year, month, 1));
    const date = { gte: from, lt: to };

    const [users, worked, wbso, km] = await Promise.all([
      prisma.user.findMany({
        orderBy: { name: "asc" },
        select: { id: true, name: true, contractType: true, contractHours: true },
      }),
      prisma.timeEntry.groupBy({ by: ["userId"], where: { date }, _sum: { hours: true } }),
      prisma.timeEntry.groupBy({
        by: ["userId"],
        where: {
          date,
          project: { tags: { some: { name: { equals: "wbso", mode: "insensitive" } } } },
        },
        _sum: { hours: true },
      }),
      prisma.kmEntry.groupBy({ by: ["userId"], where: { date }, _sum: { km: true } }),
    ]);

    const workedMap = new Map(worked.map((a) => [a.userId, Number(a._sum.hours ?? 0)]));
    const wbsoMap = new Map(wbso.map((a) => [a.userId, Number(a._sum.hours ?? 0)]));
    const kmMap = new Map(km.map((a) => [a.userId, Number(a._sum.km ?? 0)]));

    const payrollUsers: PayrollUser[] = users.map((u) => ({
      id: u.id,
      name: u.name,
      contractType: u.contractType,
      contractHours: u.contractHours != null ? Number(u.contractHours) : null,
    }));

    const rows = buildPayrollRows(payrollUsers, workedMap, wbsoMap, kmMap, weeksInMonth(year, month));
    return NextResponse.json(rows);
  } catch (e) {
    return handleError(e);
  }
}
