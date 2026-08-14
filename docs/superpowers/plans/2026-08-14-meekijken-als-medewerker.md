# Meekijken als medewerker — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Een beheerder kan de app bekijken zoals een medewerker hem ziet, alleen-lezen, met een balk die zegt dat het aanstaat.

**Architecture:** De identiteit gaat in de sessie zelf: het JWT krijgt de id en rol van de medewerker, en houdt daarnaast vast wie je werkelijk bent. Omdat elke pagina en route al `session.user.id` en `role` uit `auth()` leest, volgt de hele app vanzelf en hoeft geen enkel scherm aangepast. `src/proxy.ts` weigert intussen elke aanvraag die geen GET is, zodat meekijken niet kan schrijven.

**Tech Stack:** Next.js 16 (App Router, `proxy.ts` in plaats van middleware), NextAuth v5 met JWT-sessies, Prisma, React 19, vitest.

**Spec:** `docs/superpowers/specs/2026-08-14-meekijken-als-medewerker-design.md`

## Global Constraints

- Testen zijn in deze repo uitsluitend voor pure functies, in `src/lib/*.test.ts`. Er is geen DOM-testomgeving (`vitest.config.mts` draait `environment: "node"`); schrijf geen component-, route- of middlewaretests.
- Geen schemawijziging, geen migratie.
- Verbind niets met de database. `npm test`, `npx tsc --noEmit` en `npm run build` zijn genoeg.
- De rolcontrole steunt altijd op de **echte** rol: wie al meekijkt heeft in `token.role` de rol van de medewerker staan. Gebruik `token.realRole ?? token.role`.
- Deze app gebruikt nergens `SessionProvider` of `useSession`; sessies komen uit `auth()` in servercomponenten. Introduceer die alleen als taak 2 aantoont dat het niet anders kan.
- Deze repo augmenteert de NextAuth-types niet; bestaande code doet `(session.user as any).role`. Volg die stijl in plaats van een `next-auth.d.ts` toe te voegen.
- Next.js 16 noemt middleware `proxy`. Lees bij twijfel `node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/proxy.md`.
- `npx` en `npm test` hebben het voorvoegsel `PATH="$HOME/.nvm/versions/node/v20.20.1/bin:$PATH"` nodig; `npm run build` daarnaast `DATABASE_URL="postgresql://x:x@localhost:5432/x"`.
- Commit-berichten in het Nederlands, met de trailer `Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>`.
- Commentaar in het Nederlands, dat uitlegt wáárom.

---

## Bestandsoverzicht

| Bestand | Verantwoordelijkheid | Taak |
|---|---|---|
| `src/lib/impersonation.ts` | Nieuw. De pure beslissingen: mag deze aanvraag schrijven, en hoe ziet het token eruit na starten of stoppen. | 1 |
| `src/lib/impersonation.test.ts` | Nieuw. Testen daarvan. | 1 |
| `src/lib/auth.ts` | De `jwt`- en `session`-callbacks, en `unstable_update` exporteren. | 2 |
| `src/app/api/impersonate/route.ts` | Nieuw. Starten en stoppen. | 2 |
| `src/proxy.ts` | De alleen-lezen grendel. | 3 |
| `src/components/layout/impersonation-banner.tsx` | Nieuw. De balk met de stopknop. | 4 |
| `src/app/(app)/layout.tsx` | Toont de balk. | 4 |
| `src/components/personeel/personeel-list-client.tsx` | De knop "Bekijk als". | 4 |

---

### Task 1: De pure beslissingen

**Files:**
- Create: `src/lib/impersonation.ts`
- Create: `src/lib/impersonation.test.ts`

**Interfaces:**
- Produces:
  - `type SessieToken = { id: string; role: string; name?: string | null; email?: string | null; realId?: string; realRole?: string; realName?: string; realEmail?: string }`
  - `type Medewerker = { id: string; role: string; name: string; email: string }`
  - `const IMPERSONATION_PAD = "/api/impersonate"`
  - `mayWrite(method: string, pathname: string, meekijkend: boolean): boolean`
  - `startImpersonation(token: SessieToken, doel: Medewerker): SessieToken | null` — `null` betekent: niet toegestaan.
  - `stopImpersonation(token: SessieToken): SessieToken`

**Achtergrond:** het JWT draagt tijdens het meekijken twee identiteiten. `id`, `role`, `name` en `email` zijn de medewerker die bekeken wordt — daar leest de rest van de app uit, dus die moeten kloppen. De vier `real*`-velden houden vast wie je werkelijk bent; hun aanwezigheid ís het teken dat je meekijkt.

- [ ] **Step 1: Schrijf de falende testen**

Maak `src/lib/impersonation.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import {
  mayWrite,
  startImpersonation,
  stopImpersonation,
  IMPERSONATION_PAD,
  type SessieToken,
} from "./impersonation";

const beheerder: SessieToken = {
  id: "admin1", role: "ADMIN", name: "Arjen", email: "arjen@evabits.com",
};
const merlijn = { id: "u2", role: "EMPLOYEE", name: "Merlijn", email: "merlijn@evabits.com" };
const paul = { id: "u3", role: "EMPLOYEE", name: "Paul", email: "paul@evabits.com" };

describe("mayWrite", () => {
  it("allows anything when not looking on", () => {
    expect(mayWrite("POST", "/api/time", false)).toBe(true);
    expect(mayWrite("DELETE", "/api/time/1", false)).toBe(true);
  });

  it("allows a GET while looking on", () => {
    expect(mayWrite("GET", "/api/time", true)).toBe(true);
    expect(mayWrite("HEAD", "/time", true)).toBe(true);
  });

  it("refuses a POST while looking on", () => {
    expect(mayWrite("POST", "/api/time", true)).toBe(false);
  });

  it("refuses PUT, PATCH and DELETE just the same", () => {
    expect(mayWrite("PUT", "/api/time/1", true)).toBe(false);
    expect(mayWrite("PATCH", "/api/time/1", true)).toBe(false);
    expect(mayWrite("DELETE", "/api/time/1", true)).toBe(false);
  });

  it("refuses a POST to a page, which is how a server action arrives", () => {
    expect(mayWrite("POST", "/time", true)).toBe(false);
  });

  it("lets the route that switches it off through", () => {
    // Anders kom je er niet meer uit.
    expect(mayWrite("POST", IMPERSONATION_PAD, true)).toBe(true);
  });

  it("does not let a path that merely starts with the same text through", () => {
    // /api/impersonateer bestaat niet, maar een prefixvergelijking zonder
    // grens zou hem toelaten.
    expect(mayWrite("POST", `${IMPERSONATION_PAD}er`, true)).toBe(false);
  });
});

describe("startImpersonation", () => {
  it("swaps the identity and remembers who you really are", () => {
    expect(startImpersonation(beheerder, merlijn)).toEqual({
      id: "u2", role: "EMPLOYEE", name: "Merlijn", email: "merlijn@evabits.com",
      realId: "admin1", realRole: "ADMIN", realName: "Arjen", realEmail: "arjen@evabits.com",
    });
  });

  it("refuses when the real role is not ADMIN", () => {
    const medewerker: SessieToken = { id: "u2", role: "EMPLOYEE", name: "Merlijn", email: "m@x.nl" };
    expect(startImpersonation(medewerker, paul)).toBeNull();
  });

  it("refuses when the impersonated role is ADMIN but the real one is not", () => {
    // Wie meekijkt met een beheerder heeft ADMIN in role staan. Alleen realRole
    // telt, anders kan een medewerker zich omhoog werken zodra hij ooit
    // meekeek met een beheerder.
    const geleend: SessieToken = {
      id: "admin1", role: "ADMIN", name: "Arjen", email: "a@x.nl",
      realId: "u2", realRole: "EMPLOYEE", realName: "Merlijn", realEmail: "m@x.nl",
    };
    expect(startImpersonation(geleend, paul)).toBeNull();
  });

  it("keeps the original real identity when switching to another employee", () => {
    const bijMerlijn = startImpersonation(beheerder, merlijn)!;
    const bijPaul = startImpersonation(bijMerlijn, paul)!;
    expect(bijPaul.id).toBe("u3");
    expect(bijPaul.realId).toBe("admin1");
    expect(bijPaul.realName).toBe("Arjen");
  });
});

describe("stopImpersonation", () => {
  it("puts everything back and leaves no real fields behind", () => {
    const bijMerlijn = startImpersonation(beheerder, merlijn)!;
    expect(stopImpersonation(bijMerlijn)).toEqual(beheerder);
  });

  it("changes nothing when you were not looking on", () => {
    expect(stopImpersonation(beheerder)).toEqual(beheerder);
  });
});
```

- [ ] **Step 2: Draai de testen en controleer dat ze falen**

Run: `PATH="$HOME/.nvm/versions/node/v20.20.1/bin:$PATH" npm test -- impersonation`
Verwacht: FAIL — `src/lib/impersonation.ts` bestaat nog niet.

- [ ] **Step 3: Schrijf de module**

Maak `src/lib/impersonation.ts`:

```ts
/**
 * Meekijken als medewerker: een beheerder ziet de app met de identiteit van
 * iemand anders, maar mag niets wijzigen.
 *
 * De identiteit zit in het JWT. `id`, `role`, `name` en `email` zijn de
 * medewerker die bekeken wordt — daar leest de rest van de app uit, en juist
 * daardoor is wat je ziet echt wat zij ziet. De vier `real*`-velden houden
 * vast wie je werkelijk bent; dát ze er staan is het teken dat je meekijkt.
 */
export type SessieToken = {
  id: string;
  role: string;
  name?: string | null;
  email?: string | null;
  realId?: string;
  realRole?: string;
  realName?: string;
  realEmail?: string;
};

export type Medewerker = { id: string; role: string; name: string; email: string };

/** De route die het meekijken aan- en uitzet. */
export const IMPERSONATION_PAD = "/api/impersonate";

/**
 * Mag deze aanvraag schrijven?
 *
 * Meekijken is alleen-lezen, dus alles wat geen GET is gaat eruit — ook een
 * POST naar een pagina, want zo komt een server action binnen. De route die
 * het meekijken omzet is uitgezonderd; zonder die uitzondering kun je er niet
 * meer uit.
 */
export function mayWrite(method: string, pathname: string, meekijkend: boolean): boolean {
  if (!meekijkend) return true;
  if (method === "GET" || method === "HEAD" || method === "OPTIONS") return true;
  return pathname === IMPERSONATION_PAD || pathname.startsWith(`${IMPERSONATION_PAD}/`);
}

/**
 * Het token na het starten van het meekijken, of null als het niet mag.
 *
 * Alleen de échte rol telt. Wie meekijkt met een beheerder heeft ADMIN in
 * `role` staan; zou dat volstaan, dan kon een medewerker zich daarmee omhoog
 * werken. En wie al meekijkt en overstapt naar een andere medewerker houdt de
 * oorspronkelijke `real*`-velden: je wordt nooit "de beheerder die je aan het
 * bekijken was".
 */
export function startImpersonation(token: SessieToken, doel: Medewerker): SessieToken | null {
  const echteRol = token.realRole ?? token.role;
  if (echteRol !== "ADMIN") return null;

  return {
    ...token,
    id: doel.id,
    role: doel.role,
    name: doel.name,
    email: doel.email,
    realId: token.realId ?? token.id,
    realRole: echteRol,
    realName: token.realName ?? token.name ?? "",
    realEmail: token.realEmail ?? token.email ?? "",
  };
}

/**
 * Het token na het stoppen. De `real*`-velden verdwijnen: hun aanwezigheid is
 * het teken dat je meekijkt, dus ze laten staan zou de balk laten hangen.
 */
export function stopImpersonation(token: SessieToken): SessieToken {
  if (!token.realId) return token;
  const { realId, realRole, realName, realEmail, ...rest } = token;
  return {
    ...rest,
    id: realId,
    role: realRole ?? token.role,
    name: realName ?? token.name,
    email: realEmail ?? token.email,
  };
}
```

- [ ] **Step 4: Draai de testen en controleer dat ze slagen**

Run: `PATH="$HOME/.nvm/versions/node/v20.20.1/bin:$PATH" npm test -- impersonation`
Verwacht: PASS, alle testen in dit bestand.

- [ ] **Step 5: Draai de hele suite en de typecontrole**

Run: `PATH="$HOME/.nvm/versions/node/v20.20.1/bin:$PATH" npm test`
Verwacht: PASS.

Run: `PATH="$HOME/.nvm/versions/node/v20.20.1/bin:$PATH" npx tsc --noEmit`
Verwacht: geen uitvoer.

- [ ] **Step 6: Commit**

```bash
git add src/lib/impersonation.ts src/lib/impersonation.test.ts
git commit -m "feat: pure beslissingen voor meekijken als medewerker

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 2: De sessie omzetten

**Files:**
- Modify: `src/lib/auth.ts` — de `NextAuth(...)`-export, de `jwt`-callback en de `session`-callback
- Create: `src/app/api/impersonate/route.ts`

**Interfaces:**
- Consumes: `startImpersonation(token, doel)`, `stopImpersonation(token)` en het type `SessieToken` uit `@/lib/impersonation` (taak 1).
- Produces:
  - `unstable_update` uit `@/lib/auth`.
  - `session.impersonating` — `{ realName: string } | null`. Taak 3 leest alleen of het gezet is; taak 4 toont `realName`.
  - `POST /api/impersonate` met body `{ userId: string }` om te starten en `{ stop: true }` om te stoppen; antwoordt `{ ok: true }` of een `{ error }` met 400/401/403.

**Achtergrond:** `src/lib/auth.ts` doet nu `export const { handlers, auth, signIn, signOut } = NextAuth({...})`. De `jwt`-callback vult bij het inloggen `token.id` en `token.role`; de `session`-callback zet die op de sessie. Daar komt het omzetten bij.

NextAuth roept de `jwt`-callback aan met `trigger === "update"` en het meegegeven object als `session` zodra `unstable_update(...)` wordt aangeroepen. De rolcontrole zit in die callback, want daar is het token de waarheid — de route eromheen weigert alleen alvast netjes.

- [ ] **Step 1: Exporteer `unstable_update`**

In `src/lib/auth.ts`, vervang de exportregel:

```ts
export const { handlers, auth, signIn, signOut, unstable_update } = NextAuth({
```

- [ ] **Step 2: Importeer de pure functies**

Bovenaan `src/lib/auth.ts`, bij de andere imports:

```ts
import { startImpersonation, stopImpersonation, type SessieToken } from "@/lib/impersonation";
```

- [ ] **Step 3: Laat de jwt-callback het omzetten doen**

Vervang de `jwt`-callback. Het bestaande `if (user) { ... }`-blok blijft ongewijzigd; er komt een blok achter:

```ts
    async jwt({ token, user, account, trigger, session }) {
      if (user) {
        if (account?.provider === "google") {
          const dbUser = await prisma.user.upsert({
            where: { email: user.email! },
            update: {},
            create: {
              email: user.email!,
              name: user.name ?? user.email!,
              role: "EMPLOYEE",
              password: null,
            },
          });
          token.id = dbUser.id;
          token.role = dbUser.role;
        } else {
          token.id = user.id;
          token.role = (user as any).role;
        }
      }

      // Meekijken aan- of uitzetten. De rolcontrole hoort hier: het token is
      // servergetekend, dus dit is de enige plek waar niet te sjoemelen valt.
      if (trigger === "update") {
        const wens = session as { impersonate?: string | null } | undefined;

        if (wens?.impersonate === null) {
          return stopImpersonation(token as unknown as SessieToken) as any;
        }

        if (typeof wens?.impersonate === "string") {
          const doel = await prisma.user.findFirst({
            where: { id: wens.impersonate, archivedAt: null },
            select: { id: true, role: true, name: true, email: true },
          });
          if (!doel) return token;
          const nieuw = startImpersonation(token as unknown as SessieToken, doel);
          return (nieuw ?? token) as any;
        }
      }

      return token;
    },
```

- [ ] **Step 4: Geef de balk zijn gegevens mee**

Vervang de `session`-callback:

```ts
    session({ session, token }) {
      session.user.id = token.id as string;
      (session.user as any).role = token.role;
      // De balk moet weten dát je meekijkt en als wie je werkelijk bent. De
      // aanwezigheid van realId is het teken; realName staat in de balk.
      (session as any).impersonating = token.realId
        ? { realName: (token.realName as string) ?? "" }
        : null;
      return session;
    },
```

- [ ] **Step 5: Maak de route**

Maak `src/app/api/impersonate/route.ts`:

```ts
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
```

- [ ] **Step 6: Typecontrole en build**

Run: `PATH="$HOME/.nvm/versions/node/v20.20.1/bin:$PATH" npx tsc --noEmit`
Verwacht: geen uitvoer.

Run: `PATH="$HOME/.nvm/versions/node/v20.20.1/bin:$PATH" npm test`
Verwacht: PASS. Er komen geen testen bij: routes en sessiebedrading worden in deze repo niet automatisch getest.

Run: `DATABASE_URL="postgresql://x:x@localhost:5432/x" PATH="$HOME/.nvm/versions/node/v20.20.1/bin:$PATH" npm run build`
Verwacht: "Compiled successfully".

- [ ] **Step 7: Controleer dat `unstable_update` bestaat in deze versie**

Run: `grep -n "unstable_update" node_modules/next-auth/index.d.ts`
Verwacht: minstens één regel. Komt er niets terug, of klaagt `tsc` in stap 6 dat `unstable_update` niet bestaat op het resultaat van `NextAuth(...)`, meld dat dan als BLOCKED in plaats van zelf een `SessionProvider` op te tuigen — de spec noemt die terugvaloptie, maar die keuze is niet van deze taak.

- [ ] **Step 8: Commit**

```bash
git add src/lib/auth.ts src/app/api/impersonate/route.ts
git commit -m "feat: sessie omzetten om als medewerker mee te kijken

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 3: De alleen-lezen grendel

**Files:**
- Modify: `src/proxy.ts`

**Interfaces:**
- Consumes: `mayWrite(method: string, pathname: string, meekijkend: boolean): boolean` uit `@/lib/impersonation` (taak 1), en `session.impersonating` uit taak 2 — dat is `{ realName } | null` en hier telt alleen of het gezet is.
- Produces: niets voor latere taken.

**Achtergrond:** `src/proxy.ts` is nu één regel: `export { auth as proxy } from "@/lib/auth";`. Dat zet `req.auth` klaar en laat alles door — het omleiden naar /login gebeurt in de app-layout, niet hier. De wrapper-vorm `auth((req) => ...)` behoudt dat: geef je niets terug, dan gaat de aanvraag gewoon verder.

De matcher blijft ongewijzigd. Hij laat `api/auth`, `login`, `invoice/<token>` en `quote/<token>` erlangs; de eerste twee gaan over de sessie zelf en de laatste twee zijn openbare leespagina's.

Let op: deze grendel hangt eraan dat `req.auth` in de proxy hetzelfde object is dat de `session`-callback oplevert, inclusief `impersonating`. Is dat niet zo, dan vuurt de controle stilzwijgend nooit — een gat dat je niet ziet omdat alles blijft werken. Dat valt hier niet te testen (geen route- of middlewaretests in deze repo); stap 3 van de handmatige controle onderaan dit plan is de enige plek waar het aan het licht komt. Meld het als DONE_WITH_CONCERNS zodat die controle niet wordt overgeslagen.

- [ ] **Step 1: Schrijf de grendel**

Vervang de inhoud van `src/proxy.ts` door:

```ts
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { mayWrite } from "@/lib/impersonation";

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
  const meekijkend = Boolean((req.auth as any)?.impersonating);
  if (!mayWrite(req.method, req.nextUrl.pathname, meekijkend)) {
    return NextResponse.json({ error: "Meekijken is alleen-lezen" }, { status: 403 });
  }
});

export const config = {
  matcher: ["/((?!api/auth|_next/static|_next/image|favicon.ico|login|invoice/|quote/).*)"],
};
```

- [ ] **Step 2: Typecontrole en build**

Run: `PATH="$HOME/.nvm/versions/node/v20.20.1/bin:$PATH" npx tsc --noEmit`
Verwacht: geen uitvoer.

Run: `DATABASE_URL="postgresql://x:x@localhost:5432/x" PATH="$HOME/.nvm/versions/node/v20.20.1/bin:$PATH" npm run build`
Verwacht: "Compiled successfully", en in het overzicht onderaan nog steeds een regel `Proxy (Middleware)`. Ontbreekt die, dan is het bestand niet meer als proxy herkend.

Run: `PATH="$HOME/.nvm/versions/node/v20.20.1/bin:$PATH" npm test`
Verwacht: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/proxy.ts
git commit -m "feat: meekijken is alleen-lezen

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 4: De balk en de knop

**Files:**
- Create: `src/components/layout/impersonation-banner.tsx`
- Modify: `src/app/(app)/layout.tsx`
- Modify: `src/components/personeel/personeel-list-client.tsx`

**Interfaces:**
- Consumes: `session.impersonating` uit taak 2 — `{ realName: string } | null`; en `POST /api/impersonate` met `{ userId }` of `{ stop: true }`, dat `{ ok: true }` of `{ error }` teruggeeft.
- Produces: niets voor latere taken; dit is de laatste.

**Achtergrond:** `src/app/(app)/layout.tsx` is een servercomponent die `auth()` aanroept en `<Sidebar>` plus `<main>` rendert. De balk moet op elk scherm staan, dus hij hoort daar. De knop hoort in de personeelslijst, die per rij al een potloodknop heeft.

Na het omzetten van de sessie moet de pagina helemaal opnieuw geladen worden: elke servercomponent heeft zijn data als de oude gebruiker opgehaald. `router.refresh()` is daarvoor niet genoeg — gebruik `window.location`.

- [ ] **Step 1: Maak de balk**

Maak `src/components/layout/impersonation-banner.tsx`:

```tsx
"use client";
import { useState } from "react";
import { Eye } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * Blijft staan zolang het meekijken aanstaat, op elk scherm. Niet weg te
 * klikken: vergeten dat je met andermans ogen kijkt is precies wat je hier
 * niet wilt.
 */
export function ImpersonationBanner({ naam, realName }: { naam: string; realName: string }) {
  const [bezig, setBezig] = useState(false);

  async function stoppen() {
    setBezig(true);
    const res = await fetch("/api/impersonate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ stop: true }),
    });
    if (!res.ok) {
      setBezig(false);
      alert("Stoppen is niet gelukt");
      return;
    }
    // Volledig herladen: elke servercomponent heeft zijn data nog als de
    // medewerker opgehaald.
    window.location.href = "/personeel";
  }

  return (
    <div className="sticky top-0 z-50 flex flex-wrap items-center justify-between gap-2 bg-amber-500 px-4 py-2 text-sm text-amber-950">
      <span className="flex items-center gap-2">
        <Eye className="h-4 w-4" />
        Je kijkt mee als <strong>{naam}</strong> — alleen-lezen. Je bent ingelogd als {realName}.
      </span>
      <Button size="sm" variant="secondary" onClick={stoppen} disabled={bezig}>
        {bezig ? "Bezig..." : "Stoppen"}
      </Button>
    </div>
  );
}
```

- [ ] **Step 2: Zet de balk in de layout**

In `src/app/(app)/layout.tsx`, voeg de import toe:

```ts
import { ImpersonationBanner } from "@/components/layout/impersonation-banner";
```

En vervang de `return` door:

```tsx
  const impersonating = (session as any).impersonating as { realName: string } | null;

  return (
    <div className="flex h-full">
      <Sidebar user={session.user ?? {}} role={(session.user as any)?.role ?? "EMPLOYEE"} />
      <main className="flex-1 overflow-auto bg-muted/30 pt-14 md:pt-0">
        {impersonating && (
          <ImpersonationBanner
            naam={session.user?.name ?? ""}
            realName={impersonating.realName}
          />
        )}
        <div className="container mx-auto p-6 max-w-7xl">{children}</div>
      </main>
    </div>
  );
```

- [ ] **Step 3: Zet de knop in de personeelslijst**

In `src/components/personeel/personeel-list-client.tsx`, breid de lucide-import uit:

```ts
import { Pencil, Eye } from "lucide-react";
```

Vervang de cel met de potloodknop door:

```tsx
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          title="Bekijk als"
                          onClick={() => bekijkAls(row.id)}
                        >
                          <Eye className="h-3.5 w-3.5" />
                        </Button>
                        <Button asChild variant="ghost" size="icon">
                          <Link href={`/personeel/${row.id}`} aria-label="Bewerken">
                            <Pencil className="h-3.5 w-3.5" />
                          </Link>
                        </Button>
                      </div>
                    </TableCell>
```

En zet boven de `return` van `PersoneelListClient`:

```tsx
  async function bekijkAls(userId: string) {
    const res = await fetch("/api/impersonate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      alert(err.error ?? "Meekijken is niet gelukt");
      return;
    }
    // Naar het dashboard, en volledig herladen: de servercomponenten moeten
    // hun data opnieuw ophalen, nu als deze medewerker.
    window.location.href = "/";
  }
```

- [ ] **Step 4: Typecontrole, testen en build**

Run: `PATH="$HOME/.nvm/versions/node/v20.20.1/bin:$PATH" npx tsc --noEmit`
Verwacht: geen uitvoer.

Run: `PATH="$HOME/.nvm/versions/node/v20.20.1/bin:$PATH" npm test`
Verwacht: PASS. Er komen geen testen bij: dit is React en dat wordt hier niet automatisch getest.

Run: `DATABASE_URL="postgresql://x:x@localhost:5432/x" PATH="$HOME/.nvm/versions/node/v20.20.1/bin:$PATH" npm run build`
Verwacht: "Compiled successfully".

- [ ] **Step 5: Commit**

```bash
git add src/components/layout/impersonation-banner.tsx "src/app/(app)/layout.tsx" src/components/personeel/personeel-list-client.tsx
git commit -m "feat: balk en knop om als medewerker mee te kijken

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Handmatige controle na afloop

Sessiebedrading en React worden hier niet automatisch getest; loop dit in de draaiende app na, en bij voorkeur vóór de merge:

1. Klik op /personeel bij Merlijn Kunst op het oogje: je komt op het dashboard, de balk staat bovenaan, en het vakantiesaldo en de weekweergave zijn die van haar.
2. Loop een paar schermen langs (/time, /absence, /km): de balk blijft staan en de zijbalk toont de menu-items van een medewerker, niet die van jou.
3. Probeer uren toe te voegen: er verschijnt "Meekijken is alleen-lezen" en er wordt niets opgeslagen.
4. Klik op Stoppen: je bent terug als jezelf, met je eigen menu en je eigen rechten, en de balk is weg.
5. Kijk mee met de één en klik daarna, zonder te stoppen, op het oogje van een ander: de balk noemt de nieuwe medewerker en zegt nog steeds dat jíj ingelogd bent.
6. Controleer als niet-beheerder dat `POST /api/impersonate` met een willekeurige `userId` een 403 geeft — bijvoorbeeld door in te loggen als een medewerker en het vanuit de console te proberen.
