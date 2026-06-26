import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { z } from "zod";
import { handleError } from "@/lib/api";
import { currentQuarter, REVIEW_TEMPLATE_SEED } from "@/lib/reviews";
import { sendReviewPlannedEmail } from "@/lib/email";

export const reviewSelect = {
  id: true, userId: true, reviewedBy: true, period: true, plannedDate: true, status: true,
  formSnapshot: true, selfAnswers: true, managerAnswers: true, agreements: true,
  resultingContractId: true, selfCompletedAt: true, completedAt: true, plannedEmailSentAt: true,
  createdAt: true,
  user: { select: { id: true, name: true, email: true } },
  reviewer: { select: { id: true, name: true } },
} as const;

export function serializeReview(r: any) {
  const dDate = (v: Date | null) => (v ? v.toISOString().slice(0, 10) : null);
  const dTime = (v: Date | null) => (v ? v.toISOString() : null);
  return {
    ...r,
    plannedDate: dDate(r.plannedDate),
    selfCompletedAt: dTime(r.selfCompletedAt),
    completedAt: dTime(r.completedAt),
    plannedEmailSentAt: dTime(r.plannedEmailSentAt),
    createdAt: r.createdAt.toISOString(),
  };
}

const createSchema = z.object({
  userId: z.string().min(1),
  period: z.string().optional().or(z.literal("")),
  plannedDate: z.string().optional().or(z.literal("")),
});

export async function GET(req: Request) {
  try {
    const session = await auth();
    if ((session?.user as any)?.role !== "ADMIN")
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    const { searchParams } = new URL(req.url);
    const userId = searchParams.get("userId") ?? undefined;
    const reviews = await prisma.performanceReview.findMany({
      where: userId ? { userId } : undefined,
      orderBy: { createdAt: "desc" },
      select: reviewSelect,
    });
    return NextResponse.json(reviews.map(serializeReview));
  } catch (e) { return handleError(e); }
}

export async function POST(req: Request) {
  try {
    const session = await auth();
    if ((session?.user as any)?.role !== "ADMIN")
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    const adminId = (session!.user as any).id as string;
    const { userId, period, plannedDate } = createSchema.parse(await req.json());

    const tpl = await prisma.reviewTemplate.findFirst();
    const definition = (tpl?.definition ?? REVIEW_TEMPLATE_SEED) as object;

    const review = await prisma.performanceReview.create({
      data: {
        userId,
        reviewedBy: adminId,
        period: period || currentQuarter(),
        plannedDate: plannedDate ? new Date(plannedDate) : null,
        formSnapshot: definition,
      },
      select: reviewSelect,
    });

    const employee = review.user;
    const settings = await prisma.companySettings.findFirst();
    if (employee.email) {
      try {
        await sendReviewPlannedEmail(
          { name: employee.name, email: employee.email },
          { period: review.period, plannedDate: review.plannedDate ? review.plannedDate.toISOString().slice(0, 10) : null },
          settings,
        );
        await prisma.performanceReview.update({ where: { id: review.id }, data: { plannedEmailSentAt: new Date() } });
      } catch (e) {
        console.error("review planned email failed", review.id, e);
      }
    }

    const fresh = await prisma.performanceReview.findUnique({ where: { id: review.id }, select: reviewSelect });
    return NextResponse.json(serializeReview(fresh), { status: 201 });
  } catch (e) { return handleError(e); }
}
