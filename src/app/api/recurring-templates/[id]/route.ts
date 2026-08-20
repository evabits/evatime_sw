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
});

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await auth();
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const role = (session.user as any)?.role ?? "EMPLOYEE";
    if (!canManageRecurringTemplates(role)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    const { id } = await params;

    // Velden die het scherm niet meestuurt blijven undefined na schema.parse
    // (zod vult ze niet aan met null), en Prisma slaat undefined-velden bij
    // een update over — dus alleen wat expliciet wordt meegestuurd verandert.
    const data = schema.parse(await req.json());
    const template = await prisma.recurringTemplate.update({ where: { id }, data });
    return NextResponse.json(template);
  } catch (e) { return handleError(e); }
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await auth();
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const role = (session.user as any)?.role ?? "EMPLOYEE";
    if (!canManageRecurringTemplates(role)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    const { id } = await params;

    // Archiveren, niet verwijderen: bestaande batches verwijzen naar dit
    // sjabloon en zouden hun herkomst kwijtraken. Ze blijven werken, er
    // kunnen alleen geen nieuwe batches meer uit dit sjabloon ontstaan.
    await prisma.recurringTemplate.update({ where: { id }, data: { archivedAt: new Date() } });
    return NextResponse.json({ success: true });
  } catch (e) { return handleError(e); }
}
