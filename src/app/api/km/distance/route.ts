import { auth } from "@/lib/auth";
import { NextResponse } from "next/server";
import { handleError } from "@/lib/api";
import { OSM_UA, zoekAdressen } from "@/lib/photon";

const COORD = /^-?\d+(\.\d+)?,-?\d+(\.\d+)?$/;

/** "lon,lat" van een gekozen suggestie, of anders de beste treffer voor de tekst. */
async function punt(invoer: string): Promise<string | null> {
  if (COORD.test(invoer)) return invoer;
  const [hit] = await zoekAdressen(invoer, 1);
  return hit?.coord ?? null;
}

/** Rijafstand in km tussen twee adressen, enkele reis. */
export async function GET(req: Request) {
  try {
    const session = await auth();
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const { searchParams } = new URL(req.url);
    const from = searchParams.get("from")?.trim();
    const to = searchParams.get("to")?.trim();
    if (!from || !to) return NextResponse.json({ error: "Vul zowel van als naar in" }, { status: 400 });

    const van = await punt(from);
    if (!van) return NextResponse.json({ error: `Adres niet gevonden: ${from}` }, { status: 404 });
    const naar = await punt(to);
    if (!naar) return NextResponse.json({ error: `Adres niet gevonden: ${to}` }, { status: 404 });

    // Openbare OSRM-demoserver van OpenStreetMap.
    // ponytail: geen SLA; eigen OSRM of betaalde dienst als dat gaat haperen.
    const res = await fetch(`https://router.project-osrm.org/route/v1/driving/${van};${naar}?overview=false`, { headers: OSM_UA });
    const route = res.ok ? (await res.json()).routes?.[0] : null;
    if (!route) return NextResponse.json({ error: "Geen route gevonden" }, { status: 502 });

    return NextResponse.json({ km: Math.round(route.distance / 100) / 10 });
  } catch (e) { return handleError(e); }
}
