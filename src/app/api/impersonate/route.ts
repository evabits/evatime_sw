import { auth, unstable_update } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { z } from "zod";
import { handleError } from "@/lib/api";

const schema = z.object({
  userId: z.string().min(1).optional(),
  stop: z.boolean().optional(),
});

export async function POST(req: Request) {
  try {
    const session = await auth();
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const data = schema.parse(await req.json());

    if (data.stop) {
      await unstable_update({ impersonate: null } as any);
      return NextResponse.json({ ok: true });
    }

    // Alleen een echte beheerder mag beginnen. Wie al meekijkt heeft de rol
    // van de medewerker in de sessie staan, dus daar valt niets uit af te
    // leiden — die zit hier per definitie al in en gaat door de jwt-callback,
    // die dezelfde controle op realRole nog eens doet.
    if ((session.user as any)?.role !== "ADMIN" && !(session as any).impersonating) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    if (!data.userId) {
      return NextResponse.json({ error: "Geen medewerker opgegeven" }, { status: 400 });
    }

    const doel = await prisma.user.findFirst({
      where: { id: data.userId, archivedAt: null },
      select: { id: true },
    });
    if (!doel) return NextResponse.json({ error: "Onbekende medewerker" }, { status: 400 });

    await unstable_update({ impersonate: data.userId } as any);
    return NextResponse.json({ ok: true });
  } catch (e) { return handleError(e); }
}
