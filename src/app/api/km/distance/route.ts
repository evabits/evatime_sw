import { auth } from "@/lib/auth";
import { NextResponse } from "next/server";
import { handleError } from "@/lib/api";

// Publieke OpenStreetMap-diensten, zonder sleutel. Nominatim eist een
// herkenbare User-Agent en hooguit één verzoek per seconde.
// ponytail: publieke demoservers zonder SLA; eigen OSRM of betaalde dienst als dat gaat haperen.
const UA = { "User-Agent": "EVAtime/1.0 (time.evabits.work)" };

async function geocode(adres: string): Promise<[number, number] | null> {
  const url = `https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(adres)}`;
  const res = await fetch(url, { headers: UA });
  if (!res.ok) return null;
  const [hit] = await res.json();
  return hit ? [Number(hit.lon), Number(hit.lat)] : null;
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

    const van = await geocode(from);
    if (!van) return NextResponse.json({ error: `Adres niet gevonden: ${from}` }, { status: 404 });
    const naar = await geocode(to);
    if (!naar) return NextResponse.json({ error: `Adres niet gevonden: ${to}` }, { status: 404 });

    const res = await fetch(`https://router.project-osrm.org/route/v1/driving/${van.join(",")};${naar.join(",")}?overview=false`, { headers: UA });
    const route = res.ok ? (await res.json()).routes?.[0] : null;
    if (!route) return NextResponse.json({ error: "Geen route gevonden" }, { status: 502 });

    return NextResponse.json({ km: Math.round(route.distance / 100) / 10 });
  } catch (e) { return handleError(e); }
}
