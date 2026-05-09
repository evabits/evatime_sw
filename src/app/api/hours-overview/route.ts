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

    if (!from || !to) return NextResponse.json({ error: "from and to required" }, { status: 400 });

    const currentUser = session.user as any;
    const isAdmin = currentUser?.role === "ADMIN";

    const fromDate = new Date(from);
    const toDate = new Date(to);
    const days = Math.round((toDate.getTime() - fromDate.getTime()) / 86_400_000) + 1;
    const weeks = days / 7;

    const users = await prisma.user.findMany({
      where: isAdmin ? {} : { id: currentUser.id },
      orderBy: { name: "asc" },
      select: { id: true, name: true, email: true, weeklyHours: true },
    });

    const aggregates = await prisma.timeEntry.groupBy({
      by: ["userId"],
      where: {
        userId: isAdmin ? undefined : currentUser.id,
        date: { gte: fromDate, lte: toDate },
      },
      _sum: { hours: true },
    });

    const hoursMap = new Map<string, number>();
    for (const agg of aggregates) {
      hoursMap.set(agg.userId, Number(agg._sum.hours ?? 0));
    }

    const result = users.map((u) => {
      const weeklyHours = u.weeklyHours ? Number(u.weeklyHours) : null;
      const targetHours = weeklyHours != null ? Math.round(weeklyHours * weeks * 10) / 10 : null;
      const loggedHours = Math.round((hoursMap.get(u.id) ?? 0) * 10) / 10;
      return {
        userId: u.id,
        userName: u.name,
        userEmail: u.email,
        weeklyHours,
        targetHours,
        loggedHours,
        delta: targetHours != null ? Math.round((loggedHours - targetHours) * 10) / 10 : null,
      };
    });

    return NextResponse.json(result);
  } catch (e) { return handleError(e); }
}
