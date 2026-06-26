import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { sendContractExpiryEmail } from "@/lib/email";

// ponytail: 30-day window, tunable; promote to CompanySettings if it ever needs configuring
const CONTRACT_EXPIRY_REMINDER_DAYS = 30;

export async function GET(req: Request) {
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && req.headers.get("x-vercel-cron-secret") !== cronSecret) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const today = new Date();
  const from = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()));
  const until = new Date(from);
  until.setUTCDate(until.getUTCDate() + CONTRACT_EXPIRY_REMINDER_DAYS);

  const contracts = await prisma.contract.findMany({
    where: { endDate: { gte: from, lte: until }, expiryReminderSentAt: null },
    select: {
      id: true, contractType: true, jobTitle: true, endDate: true,
      user: { select: { name: true } },
    },
  });
  if (contracts.length === 0) return NextResponse.json({ reminded: 0 });

  const admins = await prisma.user.findMany({
    where: { role: "ADMIN" },
    select: { name: true, email: true },
  });
  const settings = await prisma.companySettings.findFirst();

  let reminded = 0;
  for (const c of contracts) {
    const endDate = c.endDate!.toISOString().slice(0, 10);
    for (const admin of admins) {
      if (!admin.email) continue;
      try {
        await sendContractExpiryEmail(
          admin,
          { jobTitle: c.jobTitle, contractType: c.contractType, endDate },
          { name: c.user.name },
          settings,
        );
      } catch (e) {
        console.error("contract-expiry email failed", c.id, e);
      }
    }
    await prisma.contract.update({ where: { id: c.id }, data: { expiryReminderSentAt: new Date() } });
    reminded++;
  }
  return NextResponse.json({ reminded });
}
