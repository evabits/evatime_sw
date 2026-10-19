import { auth } from "@/lib/auth";
import { NextResponse } from "next/server";
import { handleError } from "@/lib/api";
import { zoekAdressen } from "@/lib/photon";

/** Adressuggesties voor het van/naar-veld bij kilometers. */
export async function GET(req: Request) {
  try {
    const session = await auth();
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const q = new URL(req.url).searchParams.get("q")?.trim() ?? "";
    if (q.length < 3) return NextResponse.json([]);
    return NextResponse.json(await zoekAdressen(q));
  } catch (e) { return handleError(e); }
}
