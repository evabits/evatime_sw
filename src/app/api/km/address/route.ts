import { auth } from "@/lib/auth";
import { NextResponse } from "next/server";
import { handleError } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { zoekAdressen } from "@/lib/photon";

/** Adressuggesties voor het van/naar-veld bij kilometers. */
export async function GET(req: Request) {
  try {
    const session = await auth();
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const q = new URL(req.url).searchParams.get("q")?.trim() ?? "";
    if (q.length < 3) return NextResponse.json([]);
    // Eigen klanten eerst: die staan er altijd in, ook als OpenStreetMap ze niet kent.
    const [klanten, osm] = await Promise.all([
      prisma.customer.findMany({
        where: { archivedAt: null, address: { not: null }, name: { contains: q, mode: "insensitive" } },
        select: { name: true, address: true, postalCode: true, city: true },
        orderBy: { name: "asc" },
        take: 5,
      }),
      zoekAdressen(q),
    ]);
    const eigen = klanten.map((k) => {
      const adres = [k.address, [k.postalCode, k.city].filter(Boolean).join(" ")].filter(Boolean).join(", ");
      return { label: `${k.name}, ${adres}`, punt: adres };
    });
    return NextResponse.json([...eigen, ...osm]);
  } catch (e) { return handleError(e); }
}
