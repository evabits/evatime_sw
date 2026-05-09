import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { sendHoursReminderEmail } from "@/lib/email";
import { startOfWeek, endOfWeek } from "date-fns";

export async function GET(req: Request) {
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && req.headers.get("x-vercel-cron-secret") !== cronSecret) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const now = new Date();
  const weekStart = startOfWeek(now, { weekStartsOn: 1 });
  const weekEnd = endOfWeek(now, { weekStartsOn: 1 });

  const dayOfWeek = now.getDay();
  // 1=Mon, 5=Fri — calculate elapsed working days this week (Mon–Fri)
  const elapsedDays = Math.min(Math.max(dayOfWeek === 0 ? 5 : dayOfWeek, 1), 5);

  const users = await prisma.user.findMany({
    where: { weeklyHours: { not: null } },
    select: { id: true, name: true, email: true, weeklyHours: true },
  });

  const aggregates = await prisma.timeEntry.groupBy({
    by: ["userId"],
    where: {
      userId: { in: users.map((u) => u.id) },
      date: { gte: weekStart, lte: weekEnd },
    },
    _sum: { hours: true },
  });

  const hoursMap = new Map<string, number>();
  for (const agg of aggregates) {
    hoursMap.set(agg.userId, Number(agg._sum.hours ?? 0));
  }

  const settings = await prisma.companySettings.findFirst();

  const weekLabel = weekStart.toLocaleDateString("nl-NL", { day: "numeric", month: "long" }) +
    " – " + weekEnd.toLocaleDateString("nl-NL", { day: "numeric", month: "long", year: "numeric" });

  let reminded = 0;
  for (const user of users) {
    const weeklyHours = Number(user.weeklyHours!);
    // Pro-rate target based on elapsed working days
    const proratedTarget = weeklyHours * (elapsedDays / 5);
    const loggedHours = hoursMap.get(user.id) ?? 0;

    if (loggedHours < proratedTarget && user.email) {
      try {
        await sendHoursReminderEmail(
          { name: user.name, email: user.email },
          { label: weekLabel },
          loggedHours,
          weeklyHours,
          settings
        );
        reminded++;
      } catch {
        // continue sending to others even if one fails
      }
    }
  }

  return NextResponse.json({ reminded, week: weekLabel });
}
