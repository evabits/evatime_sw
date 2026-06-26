import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";

export async function POST(req: Request) {
  const { searchParams } = new URL(req.url);
  if (searchParams.get("key") !== process.env.SEED_KEY) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const users = await prisma.user.findMany({
    select: {
      id: true, contractType: true, contractHours: true, contractStart: true, contractEnd: true,
      _count: { select: { contracts: true } },
    },
  });

  let created = 0;
  for (const u of users) {
    if (u._count.contracts > 0) continue;
    await prisma.contract.create({
      data: {
        userId: u.id,
        contractType: u.contractType,
        contractHours: u.contractHours,
        startDate: u.contractStart,
        endDate: u.contractEnd,
      },
    });
    created++;
  }
  return NextResponse.json({ created, skipped: users.length - created });
}
