import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { z } from "zod";
import { handleError } from "@/lib/api";
import { REVIEW_TEMPLATE_SEED } from "@/lib/reviews";

const questionSchema = z.object({
  key: z.string().min(1),
  label: z.string().min(1),
  hint: z.string().optional(),
  respondent: z.enum(["SELF", "MANAGER"]),
});
const definitionSchema = z.object({
  sections: z.array(z.object({ title: z.string().min(1), questions: z.array(questionSchema) })),
});

async function getOrSeed() {
  const existing = await prisma.reviewTemplate.findFirst();
  if (existing) return existing;
  return prisma.reviewTemplate.create({ data: { definition: REVIEW_TEMPLATE_SEED as object } });
}

export async function GET() {
  try {
    const session = await auth();
    if ((session?.user as any)?.role !== "ADMIN")
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    const tpl = await getOrSeed();
    return NextResponse.json({ definition: tpl.definition });
  } catch (e) { return handleError(e); }
}

export async function PUT(req: Request) {
  try {
    const session = await auth();
    if ((session?.user as any)?.role !== "ADMIN")
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    const definition = definitionSchema.parse(await req.json());
    const existing = await prisma.reviewTemplate.findFirst();
    const tpl = existing
      ? await prisma.reviewTemplate.update({ where: { id: existing.id }, data: { definition } })
      : await prisma.reviewTemplate.create({ data: { definition } });
    return NextResponse.json({ definition: tpl.definition });
  } catch (e) { return handleError(e); }
}
