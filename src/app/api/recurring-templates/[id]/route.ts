import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { z } from "zod";
import { handleError } from "@/lib/api";
import { canManageRecurringTemplates } from "@/lib/roles";

const schema = z.object({
  name: z.string().trim().min(1),
  customerId: z.string().min(1),
  // Geen .default() zoals bij het aanmaken: bij een wijziging zou een veld dat
  // het scherm niet meestuurt stilzwijgend terugvallen op de standaard, en dan
  // verliest een sjabloon zijn facturatiemanier zodra iemand alleen het tarief
  // aanpast. Ontbrekend moet hier "laat staan" betekenen.
  billing: z.enum(["PER_UNIT", "FIXED", "HOURS"]).optional(),
  unitPrice: z.number().positive().optional().nullable(),
  defaultQuantity: z.number().positive().optional().nullable(),
  lineDescription: z.string().trim().min(1),
  invoiceSubject: z.string().trim().optional().nullable(),
  tracksQuality: z.boolean().optional(),
  referencePrefix: z.string().trim().optional().nullable(),
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

    // Elk optioneel veld is hier .optional() zonder default, dus wat het scherm
    // niet meestuurt blijft undefined na schema.parse. Prisma slaat undefined
    // over bij een update: alleen wat expliciet meekomt verandert. Een
    // meegestuurde null wist wel, en dat is de bedoeling.
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
