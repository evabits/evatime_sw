import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { z } from "zod";
import { handleError } from "@/lib/api";

const schema = z.object({
  name: z.string().min(1),
  email: z.string().email().optional().or(z.literal("")),
  phone: z.string().optional(),
  address: z.string().optional(),
  city: z.string().optional(),
  postalCode: z.string().optional(),
  country: z.string().optional(),
  vatNumber: z.string().optional(),
  kvkNumber: z.string().optional(),
  iban: z.string().optional(),
  logoUrl: z.string().optional().nullable(),
  reminderDays: z.number().int().min(1).optional(),
});

export async function GET() {
  try {
    const session = await auth();
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const settings = await prisma.companySettings.findFirst();
    return NextResponse.json(settings);
  } catch (e) { return handleError(e); }
}

export async function PUT(req: Request) {
  try {
    const session = await auth();
    if (!session || (session.user as any)?.role !== "ADMIN") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const data = schema.parse(await req.json());
    const existing = await prisma.companySettings.findFirst();
    const settings = existing
      ? await prisma.companySettings.update({
          where: { id: existing.id },
          data: { ...data, email: data.email || null },
        })
      : await prisma.companySettings.create({
          data: { ...data, email: data.email || null },
        });
    return NextResponse.json(settings);
  } catch (e) { return handleError(e); }
}
