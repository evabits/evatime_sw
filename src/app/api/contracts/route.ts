import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { z } from "zod";
import { handleError } from "@/lib/api";
import { fillSalary } from "@/lib/contracts";

export const contractSelect = {
  id: true, userId: true, contractType: true, contractHours: true,
  startDate: true, endDate: true, salaryMonthly: true, salaryHourly: true,
  jobTitle: true, ftePercentage: true, notes: true, expiryReminderSentAt: true,
  createdAt: true,
  attachments: { select: { id: true, filename: true, url: true, size: true, createdAt: true } },
} as const;

export function serializeContract(c: any) {
  const d = (v: Date | null) => (v ? v.toISOString().slice(0, 10) : null);
  return {
    ...c,
    contractHours: c.contractHours != null ? Number(c.contractHours) : null,
    salaryMonthly: c.salaryMonthly != null ? Number(c.salaryMonthly) : null,
    salaryHourly: c.salaryHourly != null ? Number(c.salaryHourly) : null,
    ftePercentage: c.ftePercentage != null ? Number(c.ftePercentage) : null,
    startDate: d(c.startDate),
    endDate: d(c.endDate),
    expiryReminderSentAt: c.expiryReminderSentAt ? c.expiryReminderSentAt.toISOString() : null,
    createdAt: c.createdAt.toISOString(),
  };
}

const num = z.coerce.number().positive().optional().nullable();
const dateStr = z.string().optional().or(z.literal(""));

export const contractBodySchema = z.object({
  contractType: z.enum(["PERMANENT", "FIXED_TERM", "ZERO_HOURS"]).default("PERMANENT"),
  contractHours: num,
  startDate: dateStr,
  endDate: dateStr,
  salaryMonthly: num,
  salaryHourly: num,
  jobTitle: z.string().optional().or(z.literal("")),
  ftePercentage: num,
  notes: z.string().optional().or(z.literal("")),
});

const createSchema = contractBodySchema.extend({ userId: z.string().min(1) });

export function toContractData(b: z.infer<typeof contractBodySchema>) {
  const contractHours = b.contractHours ?? null;
  const { salaryMonthly, salaryHourly } = fillSalary({
    salaryMonthly: b.salaryMonthly ?? null,
    salaryHourly: b.salaryHourly ?? null,
    contractHours,
  });
  return {
    contractType: b.contractType,
    contractHours,
    startDate: b.startDate ? new Date(b.startDate) : null,
    endDate: b.endDate ? new Date(b.endDate) : null,
    salaryMonthly,
    salaryHourly,
    jobTitle: b.jobTitle || null,
    ftePercentage: b.ftePercentage ?? null,
    notes: b.notes || null,
  };
}

async function requireAdmin() {
  const session = await auth();
  if (!session) return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  if ((session.user as any)?.role !== "ADMIN")
    return { error: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
  return { error: null };
}

export async function POST(req: Request) {
  try {
    const { error } = await requireAdmin();
    if (error) return error;
    const { userId, ...body } = createSchema.parse(await req.json());
    const contract = await prisma.contract.create({
      data: { userId, ...toContractData(body) },
      select: contractSelect,
    });
    return NextResponse.json(serializeContract(contract), { status: 201 });
  } catch (e) { return handleError(e); }
}
