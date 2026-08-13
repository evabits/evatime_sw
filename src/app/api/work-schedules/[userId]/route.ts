import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { z } from "zod";
import { handleError } from "@/lib/api";
import { isAdmin } from "@/lib/roles";
import { weekTotal } from "@/lib/work-schedule";
import { isQuarter, NOT_A_QUARTER } from "@/lib/quarter-hours";

// Het rooster voedt voortaan het urenveld van het verlofdialoog (via
// patternSummary), dat zelf alleen kwartieren toelaat; een rooster met 7,6 uur
// zou dus een getal voorstellen dat de invoercontrole meteen weer weigert.
const dag = z.number().min(0).max(24).refine(isQuarter, NOT_A_QUARTER);

const schema = z.object({
  monday: dag,
  tuesday: dag,
  wednesday: dag,
  thursday: dag,
  friday: dag,
});

export async function PUT(req: Request, { params }: { params: Promise<{ userId: string }> }) {
  try {
    const session = await auth();
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const role = (session.user as any)?.role ?? "EMPLOYEE";
    if (!isAdmin(role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    const { userId } = await params;

    const data = schema.parse(await req.json());
    if (weekTotal(data) === 0) {
      return NextResponse.json(
        { error: "Een rooster van alleen nullen bestaat niet — verwijder het rooster in plaats daarvan." },
        { status: 400 },
      );
    }

    const user = await prisma.user.findUnique({ where: { id: userId }, select: { id: true } });
    if (!user) return NextResponse.json({ error: "Onbekende medewerker" }, { status: 400 });

    const rooster = await prisma.workSchedule.upsert({
      where: { userId },
      create: { userId, ...data },
      update: data,
    });

    // Decimals worden als object geserialiseerd; de client rekent met getallen.
    return NextResponse.json({
      monday: Number(rooster.monday),
      tuesday: Number(rooster.tuesday),
      wednesday: Number(rooster.wednesday),
      thursday: Number(rooster.thursday),
      friday: Number(rooster.friday),
    });
  } catch (e) { return handleError(e); }
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ userId: string }> }) {
  try {
    const session = await auth();
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const role = (session.user as any)?.role ?? "EMPLOYEE";
    if (!isAdmin(role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    const { userId } = await params;

    // deleteMany, niet delete: een rooster verwijderen dat er niet is hoort
    // geen fout te geven maar een no-op te zijn.
    await prisma.workSchedule.deleteMany({ where: { userId } });
    return NextResponse.json({ success: true });
  } catch (e) { return handleError(e); }
}
