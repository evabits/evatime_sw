import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { z } from "zod";
import { handleError, projectMembershipError } from "@/lib/api";
import { canViewAllEntries, canViewReimbursements } from "@/lib/roles";
import { resolveEntryUserId } from "@/lib/entry-owner";

const schema = z.object({
  categoryId: z.string().min(1),
  projectId: z.string().optional().nullable(),
  date: z.string(),
  description: z.string().optional(),
  amount: z.number().positive(),
  vatRate: z.number().min(0).max(100).default(21),
  reimbursable: z.boolean().default(false),
  userId: z.string().optional().nullable(),
});

export async function GET(req: Request) {
  try {
    const session = await auth();
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const role = (session.user as any)?.role ?? "EMPLOYEE";
    const userId = session.user?.id!;
    const { searchParams } = new URL(req.url);
    const from = searchParams.get("from");
    const to = searchParams.get("to");
    const projectId = searchParams.get("projectId");
    const reimbursableOnly = searchParams.get("reimbursable") === "1";

    const dateFilter = from || to
      ? { date: { ...(from ? { gte: new Date(from) } : {}), ...(to ? { lte: new Date(to) } : {}) } }
      : {};

    let where: any = {
      ...dateFilter,
      ...(projectId ? { projectId } : {}),
    };

    if (canViewAllEntries(role)) {
      // admin: all expenses, optionally filter by reimbursable
      if (reimbursableOnly) where.reimbursable = true;
    } else if (canViewReimbursements(role) && reimbursableOnly) {
      // finance viewing reimbursements tab: all users' reimbursable expenses
      where.reimbursable = true;
    } else {
      // finance or employee: own expenses only
      where.userId = userId;
    }

    const expenses = await prisma.expense.findMany({
      where,
      orderBy: { date: "desc" },
      include: {
        category: { select: { id: true, name: true } },
        project: { select: { id: true, name: true, billable: true, customer: { select: { name: true } } } },
        user: { select: { id: true, name: true } },
      },
    });
    return NextResponse.json(expenses);
  } catch (e) { return handleError(e); }
}

export async function POST(req: Request) {
  try {
    const session = await auth();
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const userId = session.user?.id!;
    const role = (session.user as any)?.role ?? "EMPLOYEE";

    const data = schema.parse(await req.json());
    const { userId: requestedUserId, ...entryData } = data;
    const ownerId = resolveEntryUserId(role, userId, requestedUserId);
    if (ownerId !== userId) {
      const target = await prisma.user.findUnique({ where: { id: ownerId }, select: { id: true } });
      if (!target) return NextResponse.json({ error: "Onbekende medewerker" }, { status: 400 });
    }

    const memberError = await projectMembershipError(data.projectId ?? null, ownerId);
    if (memberError) return memberError;

    const expense = await prisma.expense.create({
      data: { ...entryData, date: new Date(data.date), userId: ownerId },
      include: {
        category: { select: { id: true, name: true } },
        project: { select: { id: true, name: true, billable: true, customer: { select: { name: true } } } },
        user: { select: { id: true, name: true } },
      },
    });
    return NextResponse.json(expense, { status: 201 });
  } catch (e) { return handleError(e); }
}
