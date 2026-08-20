import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { z } from "zod";
import { isAdmin } from "@/lib/roles";
import { handleError } from "@/lib/api";

const schema = z.object({
  userId: z.string().min(1),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Datum als jjjj-mm-dd"),
  // Mag negatief zijn — uitbetalen haalt uren van het saldo af — maar nul is
  // geen mutatie.
  hours: z.number().refine((n) => n !== 0, "Vul een aantal uren in"),
  reason: z.string().trim().min(1, "Vul een reden in"),
});

export async function POST(req: Request) {
  try {
    const session = await auth();
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const role = (session.user as any)?.role ?? "EMPLOYEE";
    if (!isAdmin(role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const data = schema.parse(await req.json());

    const gebruiker = await prisma.user.findUnique({
      where: { id: data.userId },
      select: { id: true },
    });
    if (!gebruiker) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const mutatie = await prisma.overtimeAdjustment.create({
      data: {
        userId: data.userId,
        date: new Date(`${data.date}T00:00:00Z`),
        hours: data.hours,
        reason: data.reason,
        // Wie hem invoerde, voor de navolgbaarheid.
        createdById: session.user?.id ?? null,
      },
    });

    return NextResponse.json(mutatie, { status: 201 });
  } catch (e) { return handleError(e); }
}
