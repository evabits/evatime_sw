import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { handleError } from "@/lib/api";
import { buildPayrollRows, weeksInMonth, type PayrollUser } from "@/lib/payroll";
import { getEffectiveContract } from "@/lib/contracts";
import { serializeContract, contractSelect } from "@/app/api/contracts/route";
import { RESERVED_TAG_NAME } from "@/lib/tags";
import { overtimeLedgerFor } from "@/lib/overtime-saldo";

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
        // active users, plus archived users who still have entries in this month
        where: {
          OR: [
            { archivedAt: null },
            { timeEntries: { some: { date } } },
            { kmEntries: { some: { date } } },
          ],
        },
        orderBy: { name: "asc" },
        select: {
          id: true, name: true, contracts: { select: contractSelect },
          overtimeOpeningDate: true, overtimeOpeningHours: true,
          overtimeAdjustments: { select: { id: true, date: true, hours: true, reason: true } },
        },
      }),
      // Verlofregels tellen niet mee als gewerkte uren (en dus niet als bron
      // van overwerk) — dat is precies waarvoor /uren-overzicht en de
      // uren-reminder ze wel meetellen, maar hier gaat het om geld.
      prisma.timeEntry.groupBy({
        by: ["userId"],
        where: { date, absenceRequestId: null },
        _sum: { hours: true },
      }),
      prisma.timeEntry.groupBy({
        by: ["userId"],
        where: {
          date,
          project: { tags: { some: { name: { equals: RESERVED_TAG_NAME, mode: "insensitive" } } } },
        },
        _sum: { hours: true },
      }),
      prisma.kmEntry.groupBy({ by: ["userId"], where: { date }, _sum: { km: true } }),
    ]);

    const workedMap = new Map(worked.map((a) => [a.userId, Number(a._sum.hours ?? 0)]));
    const wbsoMap = new Map(wbso.map((a) => [a.userId, Number(a._sum.hours ?? 0)]));
    const kmMap = new Map(km.map((a) => [a.userId, Number(a._sum.km ?? 0)]));

    const monthEnd = new Date(Date.UTC(year, month, 0)).toISOString().slice(0, 10);
    const payrollUsers: PayrollUser[] = users.map((u) => {
      const current = getEffectiveContract(u.contracts.map(serializeContract), monthEnd);
      return {
        id: u.id,
        name: u.name,
        contractType: (current?.contractType ?? "PERMANENT") as PayrollUser["contractType"],
        contractHours: current?.contractHours ?? null,
      };
    });

    const rows = buildPayrollRows(payrollUsers, workedMap, wbsoMap, kmMap, weeksInMonth(year, month));

    // Het overurensaldo aan het eind van deze maand: tekorten gaan eraf,
    // uitbetalingen ook. Een maand die nog loopt telt niet mee, net als op de
    // personeelspagina.
    const peil = to < now ? to : now;
    const saldi = new Map(await Promise.all(users.map(async (u) => {
      if (!u.overtimeOpeningDate) return [u.id, null] as const;
      const ledger = await overtimeLedgerFor({ ...u, contracts: u.contracts.map(serializeContract) }, peil, monthEnd);
      return [u.id, ledger.saldo] as const;
    })));

    return NextResponse.json(rows.map((r) => ({ ...r, saldo: saldi.get(r.userId) ?? null })));
  } catch (e) {
    return handleError(e);
  }
}
