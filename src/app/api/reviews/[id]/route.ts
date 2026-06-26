import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { handleError } from "@/lib/api";
import { reviewSelect, serializeReview } from "../route";
import { z } from "zod";
import { sanitizeAnswers, type ReviewDefinition } from "@/lib/reviews";
import { getEffectiveContract, fillSalary } from "@/lib/contracts";
import { contractSelect, serializeContract } from "@/app/api/contracts/route";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await auth();
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const { id } = await params;
    const review = await prisma.performanceReview.findUnique({ where: { id }, select: reviewSelect });
    if (!review) return NextResponse.json({ error: "Not found" }, { status: 404 });
    const me = session.user as any;
    if (me.role !== "ADMIN" && review.userId !== me.id)
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    return NextResponse.json(serializeReview(review));
  } catch (e) { return handleError(e); }
}

const agreementSchema = z.object({ action: z.string(), result: z.string() });
const putSchema = z.object({
  selfAnswers: z.record(z.string(), z.string()).optional(),
  submit: z.boolean().optional(),
  managerAnswers: z.record(z.string(), z.string()).optional(),
  agreements: z.array(agreementSchema).max(3).optional(),
  period: z.string().optional(),
  plannedDate: z.string().optional().or(z.literal("")),
  finalize: z.boolean().optional(),
  salaryMonthly: z.coerce.number().positive().optional().nullable(),
  effectiveDate: z.string().optional().or(z.literal("")),
});

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await auth();
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const { id } = await params;
    const me = session.user as any;
    const body = putSchema.parse(await req.json());

    const review = await prisma.performanceReview.findUnique({
      where: { id },
      select: { id: true, userId: true, status: true, formSnapshot: true },
    });
    if (!review) return NextResponse.json({ error: "Not found" }, { status: 404 });
    const def = review.formSnapshot as unknown as ReviewDefinition;
    const isAdmin = me.role === "ADMIN";
    const isSubject = review.userId === me.id;

    const data: any = {};

    if (isSubject && !isAdmin) {
      if (review.status === "COMPLETED")
        return NextResponse.json({ error: "Beoordeling is afgerond" }, { status: 403 });
      if (body.selfAnswers !== undefined) data.selfAnswers = sanitizeAnswers(def, "SELF", body.selfAnswers);
      if (body.submit && review.status === "PLANNED") {
        data.status = "SELF_COMPLETED";
        data.selfCompletedAt = new Date();
      }
    } else if (isAdmin) {
      if (body.managerAnswers !== undefined) data.managerAnswers = sanitizeAnswers(def, "MANAGER", body.managerAnswers);
      if (body.agreements !== undefined) data.agreements = body.agreements;
      if (body.period !== undefined && body.period !== "") data.period = body.period;
      if (body.plannedDate !== undefined) data.plannedDate = body.plannedDate ? new Date(body.plannedDate) : null;

      if (body.finalize) {
        data.status = "COMPLETED";
        data.completedAt = new Date();
        if (body.salaryMonthly != null && body.effectiveDate) {
          const contracts = await prisma.contract.findMany({ where: { userId: review.userId }, select: contractSelect });
          const current = getEffectiveContract(contracts.map(serializeContract), body.effectiveDate);
          const { salaryMonthly, salaryHourly } = fillSalary({
            salaryMonthly: body.salaryMonthly,
            salaryHourly: null,
            contractHours: current?.contractHours ?? null,
          });
          const newContract = await prisma.contract.create({
            data: {
              userId: review.userId,
              contractType: (current?.contractType ?? "PERMANENT") as any,
              contractHours: current?.contractHours ?? null,
              jobTitle: current?.jobTitle ?? null,
              ftePercentage: current?.ftePercentage ?? null,
              startDate: new Date(body.effectiveDate),
              endDate: null,
              salaryMonthly,
              salaryHourly,
              notes: `Salarisaanpassing n.a.v. beoordeling`,
            },
            select: { id: true },
          });
          data.resultingContractId = newContract.id;
        }
      }
    } else {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const updated = await prisma.performanceReview.update({ where: { id }, data, select: reviewSelect });
    return NextResponse.json(serializeReview(updated));
  } catch (e) { return handleError(e); }
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await auth();
    if ((session?.user as any)?.role !== "ADMIN")
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    const { id } = await params;
    await prisma.performanceReview.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (e) { return handleError(e); }
}
