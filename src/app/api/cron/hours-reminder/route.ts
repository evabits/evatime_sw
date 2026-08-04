import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { sendHoursReminderEmail } from "@/lib/email";
import { startOfWeek, endOfWeek } from "date-fns";
import { targetSoFar, weekTotal, toWeekSchedule } from "@/lib/work-schedule";

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
  // UTC, net als de rest van de datumberekeningen in deze codebase. De cron
  // draait op vrijdag 14:00 UTC, dus dit is dezelfde dag als lokaal.
  const vandaag = now.toISOString().slice(0, 10);

  const users = await prisma.user.findMany({
    // Wie een rooster heeft doet mee, ook zonder weeklyHours: het rooster
    // vertelt precies wat er van hem verwacht wordt. Zonder deze OR zouden de
    // medewerkers die wél een rooster krijgen maar geen weeklyHours hebben
    // nooit een herinnering ontvangen.
    where: {
      archivedAt: null,
      OR: [{ weeklyHours: { not: null } }, { workSchedule: { isNot: null } }],
    },
    select: { id: true, name: true, email: true, weeklyHours: true, workSchedule: true },
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
    // Met rooster: het doel is de som van de verstreken weekdagen. Zonder
    // rooster blijft het exact zoals het was — weekuren gedeeld over vijf
    // dagen. Negen van de veertien medewerkers hebben geen rooster en mogen
    // hier niets van merken.
    const rooster = toWeekSchedule(user.workSchedule);
    const weeklyHours = rooster ? weekTotal(rooster) : Number(user.weeklyHours!);
    const proratedTarget = rooster
      ? targetSoFar(rooster, vandaag)
      : weeklyHours * (elapsedDays / 5);
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
