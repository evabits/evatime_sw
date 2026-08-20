import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { z } from "zod";
import { handleError, projectMembershipError } from "@/lib/api";
import { canViewAllEntries } from "@/lib/roles";
import {
  pickCommuteTemplate, commuteDates, commuteEntryData, commuteToggleDenial,
} from "@/lib/commute";

const schema = z.object({
  // Een regex en niet alleen `.min(1)`: elke niet-lege string kwam anders
  // ongezien bij `new Date(...)` en Prisma terecht, en een onparseerbare
  // waarde daar levert een 500 "Internal server error" op in plaats van een
  // nette 400. Zelfde patroon als src/lib/user-schema.ts.
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Datum als jjjj-mm-dd"),
  present: z.boolean(),
});

/**
 * Welke dagen in een venster al een woon-werkrit hebben.
 *
 * `userId` wordt alleen gehonoreerd voor wie andermans registraties mag zien,
 * en dan uitsluitend lezend: een beheerder ziet de vinkjes van een medewerker,
 * maar zet ze niet. Zo is er geen twijfel wie wat heeft aangezet.
 */
export async function GET(req: Request) {
  try {
    const session = await auth();
    const userId = session?.user?.id;
    if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { searchParams } = new URL(req.url);
    const from = searchParams.get("from");
    const to = searchParams.get("to");
    const role = (session.user as any)?.role ?? "EMPLOYEE";
    const gevraagd = searchParams.get("userId");
    const eigenaar = gevraagd && canViewAllEntries(role) ? gevraagd : userId;

    const ritten = await prisma.kmEntry.findMany({
      where: {
        userId: eigenaar,
        commute: true,
        ...(from || to
          ? { date: { ...(from ? { gte: new Date(from) } : {}), ...(to ? { lte: new Date(to) } : {}) } }
          : {}),
      },
      select: { date: true, commute: true },
    });

    return NextResponse.json({ dates: commuteDates(ritten) });
  } catch (e) { return handleError(e); }
}

/** Zet één dag aan of uit. Altijd voor de ingelogde gebruiker zelf. */
export async function POST(req: Request) {
  try {
    const session = await auth();
    const userId = session?.user?.id;
    if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { date, present } = schema.parse(await req.json());
    const dag = new Date(date);

    const [sjablonen, bestaand] = await Promise.all([
      prisma.kmTemplate.findMany({ where: { userId } }),
      prisma.kmEntry.findFirst({ where: { userId, date: dag, commute: true } }),
    ]);
    const template = pickCommuteTemplate(sjablonen as any);

    const weigering = commuteToggleDenial({ template, bestaand, present });
    if (weigering) return NextResponse.json({ error: weigering }, { status: 400 });

    // Al in de gevraagde stand: niets doen. Twee keer aanvinken maakt geen
    // tweede rit, en twee keer uitvinken is geen fout.
    if (present && bestaand) return NextResponse.json({ present: true });
    if (!present && !bestaand) return NextResponse.json({ present: false });

    if (!present) {
      await prisma.kmEntry.delete({ where: { id: (bestaand as { id: string }).id } });
      return NextResponse.json({ present: false });
    }

    const gegevens = commuteEntryData(template as NonNullable<typeof template>);

    // Dezelfde grendel als de gewone km-route: op een project waar je geen
    // deelnemer van bent hoor je niet te kunnen boeken, ook niet via een
    // snelknop.
    const lidFout = await projectMembershipError(gegevens.projectId, userId);
    if (lidFout) return lidFout;

    await prisma.kmEntry.create({
      data: {
        userId,
        projectId: gegevens.projectId,
        date: dag,
        km: gegevens.km,
        description: gegevens.description,
        commute: true,
      },
    });

    return NextResponse.json({ present: true, km: gegevens.km, description: gegevens.description });
  } catch (e) { return handleError(e); }
}
