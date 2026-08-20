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
  // Voor wie de dag gezet wordt. Alleen gehonoreerd voor wie andermans
  // registraties mag beheren; een medewerker die hier een ander id invult
  // krijgt gewoon zijn eigen dag.
  userId: z.string().optional().nullable(),
});

/**
 * Welke dagen in een venster al een woon-werkrit hebben.
 *
 * `userId` wordt alleen gehonoreerd voor wie andermans registraties mag zien.
 * Het antwoord bevat ook het woon-werksjabloon van díé medewerker, zodat het
 * scherm niet de afstand van de ingelogde beheerder toont.
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

    const sjablonen = await prisma.kmTemplate.findMany({ where: { userId: eigenaar } });
    const sjabloon = pickCommuteTemplate(sjablonen as any);

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

    // Het sjabloon hoort bij de bekeken medewerker en niet bij de ingelogde
    // gebruiker: een beheerder die naar iemand anders kijkt moet diens afstand
    // zien staan, niet die van zichzelf.
    return NextResponse.json({
      dates: commuteDates(ritten),
      template: sjabloon ? { name: sjabloon.name, km: Number(sjabloon.km), projectId: sjabloon.projectId } : null,
    });
  } catch (e) { return handleError(e); }
}

/**
 * Zet één dag aan of uit.
 *
 * Standaard voor de ingelogde gebruiker; een beheerder mag het ook voor een
 * medewerker doen. Dat was eerder bewust niet zo — de gedachte was dat er geen
 * twijfel mocht bestaan over wie een kantoordag had aangezet — maar in de
 * praktijk moet een beheerder een vergeten dag kunnen bijzetten.
 */
export async function POST(req: Request) {
  try {
    const session = await auth();
    const userId = session?.user?.id;
    if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { date, present, userId: gevraagd } = schema.parse(await req.json());
    const role = (session.user as any)?.role ?? "EMPLOYEE";
    const eigenaar = gevraagd && canViewAllEntries(role) ? gevraagd : userId;
    const dag = new Date(date);

    const [sjablonen, bestaand] = await Promise.all([
      prisma.kmTemplate.findMany({ where: { userId: eigenaar } }),
      prisma.kmEntry.findFirst({ where: { userId: eigenaar, date: dag, commute: true } }),
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
    const lidFout = await projectMembershipError(gegevens.projectId, eigenaar);
    if (lidFout) return lidFout;

    await prisma.kmEntry.create({
      data: {
        userId: eigenaar,
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
