import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { z } from "zod";
import { handleError } from "@/lib/api";
import { levelRatesField } from "@/lib/rates";
import { isAdmin } from "@/lib/roles";

const schema = z.object({
  name: z.string().min(1),
  email: z.string().email().optional().or(z.literal("")),
  phone: z.string().optional(),
  address: z.string().optional(),
  city: z.string().optional(),
  postalCode: z.string().optional(),
  country: z.string().optional(),
  vatNumber: z.string().optional(),
  notes: z.string().optional(),
  levelRates: levelRatesField,
});

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await auth();
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const { id } = await params;
    const customer = await prisma.customer.findUnique({
      where: { id },
      include: {
        projects: { orderBy: { name: "asc" } },
        invoices: { orderBy: { issueDate: "desc" } },
        levelRates: true,
      },
    });
    if (!customer) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json(customer);
  } catch (e) { return handleError(e); }
}

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await auth();
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const role = (session.user as any)?.role ?? "EMPLOYEE";
    // Same reasoning as POST /api/customers: only the admin-only /customers
    // page edits customers, so the whole route is admin-only.
    if (!isAdmin(role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    const { id } = await params;
    const { levelRates, ...data } = schema.parse(await req.json());
    const customer = await prisma.customer.update({
      where: { id },
      data: { ...data, email: data.email || null },
    });
    if (levelRates) {
      await prisma.$transaction([
        prisma.customerLevelRate.deleteMany({ where: { customerId: customer.id } }),
        ...levelRates.map((r) =>
          prisma.customerLevelRate.create({
            data: { customerId: customer.id, level: r.level as any, rate: r.rate },
          }),
        ),
      ]);
    }
    return NextResponse.json({ ...customer, ...(levelRates ? { levelRates } : {}) });
  } catch (e) { return handleError(e); }
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await auth();
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const role = (session.user as any)?.role ?? "EMPLOYEE";
    if (!isAdmin(role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    const { id } = await params;
    await prisma.customer.update({ where: { id }, data: { archivedAt: new Date() } });
    return NextResponse.json({ success: true });
  } catch (e) { return handleError(e); }
}

export async function PATCH(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await auth();
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const role = (session.user as any)?.role ?? "EMPLOYEE";
    if (!isAdmin(role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    const { id } = await params;
    await prisma.customer.update({ where: { id }, data: { archivedAt: null } });
    return NextResponse.json({ success: true });
  } catch (e) { return handleError(e); }
}
