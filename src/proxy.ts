import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { mayWrite, isImpersonating } from "@/lib/impersonation";

/**
 * Elke aanvraag komt hier langs, ook die naar de API. Zolang een beheerder
 * meekijkt als een medewerker mag er niets geschreven worden: één controle
 * dekt zo alle schermen en alle routes tegelijk, inclusief server actions —
 * die komen als POST naar een pagina binnen.
 *
 * Geen antwoord teruggeven betekent: gewoon doorlaten. Het omleiden naar
 * /login gebeurt in de app-layout, niet hier.
 */
export const proxy = auth((req) => {
  const meekijkend = isImpersonating(req.auth);
  if (!mayWrite(req.method, req.nextUrl.pathname, meekijkend)) {
    return NextResponse.json({ error: "Meekijken is alleen-lezen" }, { status: 403 });
  }
});

export const config = {
  matcher: ["/((?!api/auth|_next/static|_next/image|favicon.ico|login|invoice/|quote/).*)"],
};
