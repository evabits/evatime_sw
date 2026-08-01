import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { z } from "zod";
import { handleError } from "@/lib/api";
import { archivedWhere } from "@/lib/archive";

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
});

export async function GET(req: Request) {
  try {
    const session = await auth();
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const includeArchived = new URL(req.url).searchParams.get("includeArchived") === "1";
    const customers = await prisma.customer.findMany({
      where: archivedWhere(includeArchived),
      orderBy: { name: "asc" },
      include: { _count: { select: { projects: true, invoices: true } } },
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

    const body = await req.json();
    const data = schema.parse(body);
    const customer = await prisma.customer.create({
      data: { ...data, email: data.email || null },
    });
    return NextResponse.json(customer, { status: 201 });
  } catch (e) {
    return handleError(e);
  }
}
