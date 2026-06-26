import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { currentQuarter, usersMissingReview } from "@/lib/reviews";
import { sendReviewReminderEmail } from "@/lib/email";

export async function GET(req: Request) {
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && req.headers.get("x-vercel-cron-secret") !== cronSecret) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const quarter = currentQuarter();

  const [users, reviewed] = await Promise.all([
    prisma.user.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }),
    prisma.performanceReview.findMany({ where: { period: quarter }, select: { userId: true } }),
  ]);

  const missing = usersMissingReview(users, new Set(reviewed.map((r) => r.userId)));
  if (missing.length === 0) return NextResponse.json({ reminded: 0, missing: 0 });

  const admins = await prisma.user.findMany({ where: { role: "ADMIN" }, select: { name: true, email: true } });
  const settings = await prisma.companySettings.findFirst();

  let reminded = 0;
  for (const admin of admins) {
    if (!admin.email) continue;
    try {
      await sendReviewReminderEmail(admin, missing, quarter, settings);
      reminded++;
    } catch (e) {
      console.error("review reminder email failed", admin.email, e);
    }
  }
  return NextResponse.json({ reminded, missing: missing.length });
}
