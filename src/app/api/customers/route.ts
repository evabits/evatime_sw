import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { z } from "zod";
import { handleError } from "@/lib/api";
import { archivedWhere } from "@/lib/archive";
import { levelRatesField } from "@/lib/rates";
import { canEditInvoices, isAdmin } from "@/lib/roles";

const schema = z.object({
  name: z.string().min(1),
  customerNumber: z.string().optional(),
  email: z.string().email().optional().or(z.literal("")),
  phone: z.string().optional(),
  attention: z.string().optional(),
  address: z.string().optional(),
  city: z.string().optional(),
  postalCode: z.string().optional(),
  country: z.string().optional(),
  vatNumber: z.string().optional(),
  notes: z.string().optional(),
  levelRates: levelRatesField,
});

export async function GET(req: Request) {
  try {
    const session = await auth();
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const role = (session.user as any)?.role ?? "EMPLOYEE";

    // Het tarievenkaartje per niveau is alleen voor de rekening van de
    // factuurbouwer, admin-only. Zelfde gate als GET /api/time.
    const canSeeRates = canEditInvoices(role);

    const includeArchived = new URL(req.url).searchParams.get("includeArchived") === "1";
    const customers = await prisma.customer.findMany({
      where: archivedWhere(includeArchived),
      orderBy: { name: "asc" },
      include: {
        _count: { select: { projects: true, invoices: true } },
        ...(canSeeRates ? { levelRates: true } : {}),
      },
    });
    return NextResponse.json(customers);
  } catch (e) {
    return handleError(e);
  }
}

export async function POST(req: Request) {
  try {
    const session = await auth();
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const role = (session.user as any)?.role ?? "EMPLOYEE";
    // Klanten (met hun tarievenkaartje) worden alleen aangemaakt vanaf de
    // admin-only /customers pagina; er is geen medewerkersflow die deze
    // route raakt, dus de hele route is admin-only (anders dan
    // POST /api/projects, waar medewerkers kale conceptprojecten mogen
    // aanmaken).
    if (!isAdmin(role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const body = await req.json();
    const { levelRates, ...data } = schema.parse(body);
    const customer = await prisma.customer.create({
      data: {
        ...data,
        email: data.email || null,
        // Leeg moet NULL worden: twee klanten met een lege string botsen
        // op de unieke sleutel, twee met NULL niet.
        customerNumber: data.customerNumber?.trim() || null,
      },
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
    return NextResponse.json({ ...customer, ...(levelRates ? { levelRates } : {}) }, { status: 201 });
  } catch (e) {
    return handleError(e);
  }
}
