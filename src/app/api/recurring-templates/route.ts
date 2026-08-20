import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { z } from "zod";
import { handleError } from "@/lib/api";
import { canManageRecurringTemplates } from "@/lib/roles";

const schema = z.object({
  name: z.string().trim().min(1),
  customerId: z.string().min(1),
  billing: z.enum(["PER_UNIT", "FIXED", "HOURS"]).default("PER_UNIT"),
  unitPrice: z.number().positive().optional().nullable(),
  defaultQuantity: z.number().positive().optional().nullable(),
  lineDescription: z.string().trim().min(1),
  invoiceSubject: z.string().trim().optional().nullable(),
  tracksQuality: z.boolean().default(false),
  referencePrefix: z.string().trim().optional().nullable(),
});

export async function GET() {
  try {
    const session = await auth();
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const role = (session.user as any)?.role ?? "EMPLOYEE";
    if (!canManageRecurringTemplates(role)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const templates = await prisma.recurringTemplate.findMany({
      where: { archivedAt: null },
      include: { customer: { select: { id: true, name: true } } },
      orderBy: { name: "asc" },
    });
    return NextResponse.json(templates);
  } catch (e) { return handleError(e); }
}

export async function POST(req: Request) {
  try {
    const session = await auth();
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const role = (session.user as any)?.role ?? "EMPLOYEE";
    if (!canManageRecurringTemplates(role)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const data = schema.parse(await req.json());
    const template = await prisma.recurringTemplate.create({ data });
    return NextResponse.json(template, { status: 201 });
  } catch (e) { return handleError(e); }
}
