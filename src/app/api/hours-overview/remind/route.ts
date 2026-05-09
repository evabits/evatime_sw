import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { z } from "zod";
import { handleError } from "@/lib/api";
import { sendHoursReminderEmail } from "@/lib/email";

const schema = z.object({
  userId: z.string().min(1),
  periodLabel: z.string().min(1),
  hoursLogged: z.number(),
  hoursExpected: z.number(),
});

export async function POST(req: Request) {
  try {
    const session = await auth();
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const currentUser = session.user as any;
    if (currentUser?.role !== "ADMIN") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const data = schema.parse(await req.json());

    const [user, settings] = await Promise.all([
      prisma.user.findUnique({ where: { id: data.userId }, select: { name: true, email: true } }),
      prisma.companySettings.findFirst(),
    ]);

    if (!user) return NextResponse.json({ error: "Gebruiker niet gevonden" }, { status: 404 });
    if (!user.email) return NextResponse.json({ error: "Gebruiker heeft geen e-mailadres" }, { status: 400 });

    await sendHoursReminderEmail(
      user,
      { label: data.periodLabel },
      data.hoursLogged,
      data.hoursExpected,
      settings
    );

    return NextResponse.json({ ok: true });
  } catch (e) { return handleError(e); }
}
