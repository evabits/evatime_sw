# Kantoordag met automatische woon-werkrit — Implementatieplan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Eén vinkje per dag in het weekoverzicht van het urenscherm zet de woon-werkrit van die dag klaar, en haalt hem weer weg.

**Architecture:** Eén boolean op `KmEntry` markeert de woon-werkrit. Geen nieuwe tabel: de kilometerregistratie is de enige waarheid en het vinkje weerspiegelt haar. Alle keuzes en weigeringen zitten als pure functies in `src/lib/commute.ts` met vitest-dekking. Eén nieuwe route zet een dag aan of uit; de bestaande aanmaakroute leert het sjabloon herkennen.

**Tech Stack:** Next.js 16 (App Router), React 19, Prisma 6 + PostgreSQL (Neon), zod, date-fns, Tailwind, shadcn-componenten uit `src/components/ui`, vitest.

**Spec:** `docs/superpowers/specs/2026-08-20-kantoordag-woonwerkrit-design.md`

**Wat er al is:** het woon-werksjabloon is een `KmTemplate` met `managedByAdmin: true`, per medewerker beheerd onder `/personeel/[id]`. Elf van de vijftien medewerkers hebben er een. Het urenscherm (`src/components/time/time-entries-client.tsx`) heeft een weekoverzicht dat het gedeelde `WeekGrid` (`src/components/shared/week-grid.tsx`) gebruikt — dat component wordt óók door het km-scherm gebruikt en mag hier niet voor veranderen.

## Global Constraints

- **Lees eerst `AGENTS.md`.** Dit is Next.js 16; conventies wijken af van oudere versies. Raadpleeg `node_modules/next/dist/docs/` vóór routing- of paginacode.
- **Datums in de UI altijd `DD-MMM-YYYY`** via `formatDate` uit `src/lib/utils.ts`. Alleen de waarde van een `<input type="date">` en interne sleutels zijn `yyyy-MM-dd`.
- **De server bepaalt de eigenaar uit de sessie**, nooit uit de aanvraag. De enige uitzondering is een beheerder die iemand anders bekijkt, en dan uitsluitend lezend.
- **Dit project test uitsluitend pure functies** in `src/lib/*.test.ts`. Geen component-, route- of integratietests.
- **Geen nieuwe npm-afhankelijkheden.**
- **Commentaar en foutmeldingen in het Nederlands**, uitleggend *waarom* en niet *wat*.
- **Imports:** binnen `src/lib/` relatief (`./utils`), in `src/app/` en `src/components/` via de alias (`@/lib/...`). `vitest.config.mts` kent geen alias-resolutie.
- **Route-handlers krijgen `params` als `Promise`** waar ze die hebben.
- **Node 20 verplicht** voor npm/npx: `PATH="$HOME/.nvm/versions/node/v20.20.1/bin:$PATH" npx vitest run`. Ketens met `&&` worden door de permissielaag geweigerd; bij een losse weigering één keer opnieuw proberen.
- **`npx tsc --noEmit` schoon en `npm run build` exit 0.** De build heeft `DATABASE_URL` nodig maar verbindt niet: `DATABASE_URL="postgresql://x:x@localhost:5432/x" npm run build`.
- **De database in `.env.local` is productie.** Alleen lezen, behalve de ene `db:push` in taak 1.

---

## Bestandsindeling

| Bestand | Verantwoordelijkheid |
|---|---|
| `prisma/schema.prisma` | `KmEntry.commute`. |
| `src/lib/commute.ts` | Welk sjabloon het woon-werksjabloon is, welke dagen aanstaan, wat er weggeschreven wordt, en welke weigeringen gelden. Geen React, geen Prisma. |
| `src/lib/commute.test.ts` | Tests daarvan. |
| `src/app/api/km/commute/route.ts` | GET (welke dagen staan aan) en POST (zet een dag aan of uit). |
| `src/app/api/km/route.ts` | POST accepteert `templateId` en zet zelf `commute`. |
| `src/components/km/km-entries-client.tsx` | Stuurt `templateId` mee als de rit uit een sjabloon komt. |
| `src/app/(app)/time/page.tsx` | Geeft het woon-werksjabloon van de ingelogde gebruiker mee. |
| `src/components/time/office-day-row.tsx` | De rij "Op kantoor" onder het weekraster. |
| `src/components/time/time-entries-client.tsx` | Haalt de kantoordagen op en rendert de rij. |

---

### Task 1: Schema en database

**Files:**
- Modify: `prisma/schema.prisma`

**Interfaces:**
- Produces: `KmEntry.commute: boolean` (standaard `false`).

- [ ] **Step 1: Voeg het veld toe aan `KmEntry`**

In `prisma/schema.prisma`, in `model KmEntry`, direct ná `description`:

```prisma
  // Deze rit is de woon-werkrit van die dag, aangemaakt vanuit het beheerde
  // woon-werksjabloon. Nodig omdat het vinkje op het urenscherm moet weten
  // wélke rit de zijne is: herkennen op project en afstand breekt zodra iemand
  // zijn rit aanpast of een tweede rit naar dezelfde plek maakt.
  commute        Boolean       @default(false)
```

- [ ] **Step 2: Kopieer `.env.local` naar `.env`**

Prisma leest `.env.local` niet: `prisma.config.ts` doet `import "dotenv/config"` en dat laadt alleen `.env`, dat niet bestaat.

```bash
cp .env.local .env
```

- [ ] **Step 3: Lees de diff vóórdat je iets wegschrijft**

```bash
PATH="$HOME/.nvm/versions/node/v20.20.1/bin:$PATH" npx prisma migrate diff --from-schema-datasource prisma/schema.prisma --to-schema-datamodel prisma/schema.prisma --script
```

Verwacht: precies één `ALTER TABLE "KmEntry" ADD COLUMN "commute" BOOLEAN NOT NULL DEFAULT false`. **Lees de volledige uitvoer.** Staat er ook maar één `DROP` in, stop dan, push niet, en rapporteer BLOCKED met de volledige uitvoer.

- [ ] **Step 4: Push naar de database**

```bash
PATH="$HOME/.nvm/versions/node/v20.20.1/bin:$PATH" npx prisma db push
```

Verwacht: "Your database is now in sync with your Prisma schema" en daarna "Generated Prisma Client". Bij `P1001` (Neon niet bereikbaar) één keer opnieuw proberen.

- [ ] **Step 5: Ruim `.env` op**

```bash
rm -f .env
```

- [ ] **Step 6: Controleer de client**

```bash
npx tsc --noEmit
```

Verwacht: geen uitvoer.

- [ ] **Step 7: Commit**

```bash
git add prisma/schema.prisma
git commit -m "feat: markeer de woon-werkrit op een kilometerregistratie"
```

---

### Task 2: Pure functies

**Files:**
- Create: `src/lib/commute.ts`
- Create: `src/lib/commute.test.ts`

**Interfaces:**
- Consumes: `date-fns`.
- Produces:
  - `type CommuteTemplate = { id: string; name: string; projectId: string; km: number | string; description?: string | null; managedByAdmin: boolean; updatedAt: Date | string }`
  - `pickCommuteTemplate(templates: CommuteTemplate[]): CommuteTemplate | null`
  - `commuteDates(ritten: { date: Date | string; commute: boolean }[]): string[]`
  - `commuteEntryData(sjabloon: CommuteTemplate): { projectId: string; km: number; description: string }`
  - `commuteToggleDenial(opts: { template: CommuteTemplate | null; bestaand: { invoiced: boolean } | null; present: boolean }): string | null`

- [ ] **Step 1: Schrijf de falende tests**

Maak `src/lib/commute.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import {
  pickCommuteTemplate, commuteDates, commuteEntryData, commuteToggleDenial,
  type CommuteTemplate,
} from "./commute";

const sjabloon = (over: Partial<CommuteTemplate> = {}): CommuteTemplate => ({
  id: "t1",
  name: "WoonWerk",
  projectId: "p-intern",
  km: "77.7",
  description: null,
  managedByAdmin: true,
  updatedAt: "2026-08-01T10:00:00.000Z",
  ...over,
});

describe("pickCommuteTemplate", () => {
  it("gives nothing when the employee has no templates at all", () => {
    expect(pickCommuteTemplate([])).toBeNull();
  });

  it("ignores templates the employee made himself", () => {
    // Alleen het door een beheerder ingestelde sjabloon telt als woon-werk.
    expect(pickCommuteTemplate([sjabloon({ managedByAdmin: false })])).toBeNull();
  });

  it("picks the managed one from a mixed list", () => {
    const eigen = sjabloon({ id: "eigen", name: "Klant bezoeken", managedByAdmin: false });
    const beheerd = sjabloon({ id: "beheerd" });
    expect(pickCommuteTemplate([eigen, beheerd])?.id).toBe("beheerd");
  });

  it("takes the most recently changed when there are somehow two managed ones", () => {
    // Dat hoort niet te kunnen, maar het staat niet in de weg: zo verergert een
    // datafout zichzelf niet.
    const oud = sjabloon({ id: "oud", updatedAt: "2026-01-01T00:00:00.000Z" });
    const nieuw = sjabloon({ id: "nieuw", updatedAt: "2026-08-01T00:00:00.000Z" });
    expect(pickCommuteTemplate([oud, nieuw])?.id).toBe("nieuw");
    expect(pickCommuteTemplate([nieuw, oud])?.id).toBe("nieuw");
  });
});

describe("commuteDates", () => {
  it("gives the days that have a commute ride, as yyyy-MM-dd", () => {
    const ritten = [
      { date: "2026-08-17T00:00:00.000Z", commute: true },
      { date: "2026-08-18T00:00:00.000Z", commute: false },
      { date: "2026-08-19T00:00:00.000Z", commute: true },
    ];
    expect(commuteDates(ritten)).toEqual(["2026-08-17", "2026-08-19"]);
  });

  it("counts a day once, even if there are somehow two rides", () => {
    const ritten = [
      { date: "2026-08-17T00:00:00.000Z", commute: true },
      { date: "2026-08-17T00:00:00.000Z", commute: true },
    ];
    expect(commuteDates(ritten)).toEqual(["2026-08-17"]);
  });

  it("gives an empty list for no rides", () => {
    expect(commuteDates([])).toEqual([]);
  });
});

describe("commuteEntryData", () => {
  it("takes project and distance from the template", () => {
    expect(commuteEntryData(sjabloon())).toEqual({
      projectId: "p-intern",
      km: 77.7,
      description: "WoonWerk",
    });
  });

  it("prefers the template's own description over its name", () => {
    const met = sjabloon({ description: "Heen en terug naar kantoor" });
    expect(commuteEntryData(met).description).toBe("Heen en terug naar kantoor");
  });

  it("falls back to the name when the description is blank", () => {
    // Een lege omschrijving zou een naamloze regel in de kilometerlijst geven.
    expect(commuteEntryData(sjabloon({ description: "   " })).description).toBe("WoonWerk");
  });
});

describe("commuteToggleDenial", () => {
  it("allows switching a day on when there is a template", () => {
    expect(commuteToggleDenial({ template: sjabloon(), bestaand: null, present: true })).toBeNull();
  });

  it("refuses switching on without a commute template, and says who fixes it", () => {
    const melding = commuteToggleDenial({ template: null, bestaand: null, present: true });
    expect(melding).toBe("Er is nog geen woon-werksjabloon ingesteld. Vraag een beheerder dit onder Personeel in te stellen.");
  });

  it("allows switching a day off", () => {
    expect(commuteToggleDenial({ template: sjabloon(), bestaand: { invoiced: false }, present: false })).toBeNull();
  });

  it("refuses to remove a ride that has already been invoiced", () => {
    const melding = commuteToggleDenial({ template: sjabloon(), bestaand: { invoiced: true }, present: false });
    expect(melding).toBe("Deze rit is al gefactureerd en kan niet meer worden verwijderd");
  });

  it("does not need a template to switch a day off", () => {
    // Het sjabloon kan verwijderd zijn nadat de rit is aangemaakt; die rit moet
    // je dan nog steeds kwijt kunnen.
    expect(commuteToggleDenial({ template: null, bestaand: { invoiced: false }, present: false })).toBeNull();
  });
});
```

- [ ] **Step 2: Draai de tests en zie ze falen**

```bash
PATH="$HOME/.nvm/versions/node/v20.20.1/bin:$PATH" npx vitest run src/lib/commute.test.ts
```

Verwacht: FAIL, "Failed to resolve import ./commute".

- [ ] **Step 3: Schrijf `src/lib/commute.ts`**

```ts
import { format } from "date-fns";

/**
 * De woon-werkrit: welk sjabloon ervoor geldt, welke dagen hem al hebben, en
 * wanneer aan- of uitzetten niet mag.
 *
 * Geen React en geen Prisma, zodat het te testen is zonder database en zonder
 * scherm — de conventie van dit project.
 *
 * Er is bewust geen aparte registratie "op kantoor geweest": de
 * kilometerregistratie is de enige waarheid en het vinkje weerspiegelt haar.
 * Twee dingen die synchroon moeten blijven is precies waar dit soort
 * automatismen op stukloopt.
 */
export type CommuteTemplate = {
  id: string;
  name: string;
  projectId: string;
  /** Prisma levert Decimal als string aan. */
  km: number | string;
  description?: string | null;
  managedByAdmin: boolean;
  updatedAt: Date | string;
};

/**
 * Het woon-werksjabloon van een medewerker: dat wat een beheerder onder
 * Personeel heeft ingesteld. Zelfgemaakte sjablonen tellen niet mee — anders
 * zou iedereen zijn eigen afstand kunnen bepalen.
 *
 * Heeft iemand er per ongeluk twee, dan wint de laatst gewijzigde. Dat hoort
 * niet te kunnen, maar weigeren zou de medewerker gijzelen voor een datafout
 * die hij niet zelf kan oplossen.
 */
export function pickCommuteTemplate(templates: CommuteTemplate[]): CommuteTemplate | null {
  const beheerd = templates.filter((t) => t.managedByAdmin);
  if (beheerd.length === 0) return null;
  return beheerd.reduce((laatste, kandidaat) =>
    new Date(kandidaat.updatedAt) > new Date(laatste.updatedAt) ? kandidaat : laatste,
  );
}

/**
 * De dagen waarop een woon-werkrit staat, als `yyyy-MM-dd`.
 *
 * Ontdubbeld: staan er door een eerdere fout twee ritten op één dag, dan is dat
 * één aangevinkte dag en geen twee.
 */
export function commuteDates(ritten: { date: Date | string; commute: boolean }[]): string[] {
  const dagen = new Set<string>();
  for (const rit of ritten) {
    if (rit.commute) dagen.add(format(new Date(rit.date), "yyyy-MM-dd"));
  }
  return [...dagen];
}

/**
 * Wat er weggeschreven wordt als je een dag aanvinkt.
 *
 * De omschrijving valt terug op de naam van het sjabloon: een lege omschrijving
 * zou een naamloze regel in de kilometerlijst opleveren.
 */
export function commuteEntryData(
  sjabloon: CommuteTemplate,
): { projectId: string; km: number; description: string } {
  return {
    projectId: sjabloon.projectId,
    km: Number(sjabloon.km),
    description: sjabloon.description?.trim() || sjabloon.name,
  };
}

/**
 * Waarom het aan- of uitzetten van een dag niet mag, of `null` als het mag.
 *
 * Uitzetten heeft geen sjabloon nodig: dat kan verwijderd zijn nadat de rit is
 * aangemaakt, en dan moet je die rit nog steeds kwijt kunnen.
 */
export function commuteToggleDenial(opts: {
  template: CommuteTemplate | null;
  bestaand: { invoiced: boolean } | null;
  present: boolean;
}): string | null {
  if (opts.present && !opts.template) {
    return "Er is nog geen woon-werksjabloon ingesteld. Vraag een beheerder dit onder Personeel in te stellen.";
  }
  if (!opts.present && opts.bestaand?.invoiced) {
    return "Deze rit is al gefactureerd en kan niet meer worden verwijderd";
  }
  return null;
}
```

- [ ] **Step 4: Draai de tests en zie ze slagen**

```bash
PATH="$HOME/.nvm/versions/node/v20.20.1/bin:$PATH" npx vitest run src/lib/commute.test.ts
```

Verwacht: PASS, 15 tests.

- [ ] **Step 5: Commit**

```bash
git add src/lib/commute.ts src/lib/commute.test.ts
git commit -m "feat: keuzes en weigeringen rond de woon-werkrit"
```

---

### Task 3: De route die een kantoordag aan- en uitzet

**Files:**
- Create: `src/app/api/km/commute/route.ts`

**Interfaces:**
- Consumes: `pickCommuteTemplate`, `commuteDates`, `commuteEntryData`, `commuteToggleDenial` uit taak 2; `handleError` en `projectMembershipError` uit `@/lib/api`; `canViewAllEntries` uit `@/lib/roles`.
- Produces:
  - `GET /api/km/commute?from=&to=&userId=` → `{ dates: string[] }`
  - `POST /api/km/commute` met `{ date: string; present: boolean }` → `{ present: boolean; km?: number; description?: string }`

- [ ] **Step 1: Schrijf de route**

```ts
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
  date: z.string().min(1),
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
```

- [ ] **Step 2: Controleer types en build**

```bash
npx tsc --noEmit
```

Verwacht: geen uitvoer.

```bash
DATABASE_URL="postgresql://x:x@localhost:5432/x" PATH="$HOME/.nvm/versions/node/v20.20.1/bin:$PATH" npm run build
```

Verwacht: exitcode 0, en `/api/km/commute` in het routeoverzicht.

- [ ] **Step 3: Commit**

```bash
git add src/app/api/km/commute/route.ts
git commit -m "feat: route om een kantoordag aan en uit te zetten"
```

---

### Task 4: De gewone km-route herkent het woon-werksjabloon

**Files:**
- Modify: `src/app/api/km/route.ts`
- Modify: `src/components/km/km-entries-client.tsx`

**Interfaces:**
- Consumes: `pickCommuteTemplate` uit taak 2.
- Produces: `POST /api/km` accepteert een optionele `templateId` en zet zelf `commute`.

**Waarom dit nodig is:** het km-scherm kiest een sjabloon, vult daarmee de formuliervelden en stuurt alleen die waarden op. De server ziet nooit een sjabloon en kan dus niet weten dat een rit de woon-werkrit is. Zonder deze taak staat het vinkje op het urenscherm uit terwijl de rit er wel is, en maakt aanvinken een tweede rit.

- [ ] **Step 1: Neem `templateId` aan in het schema**

In `src/app/api/km/route.ts`, in `const schema = z.object({ ... })`, ná `userId`:

```ts
  // Welk sjabloon het scherm gebruikte om de velden te vullen. Alleen om te
  // bepalen of dit de woon-werkrit is; de waarden zelf komen uit het formulier.
  templateId: z.string().optional().nullable(),
```

- [ ] **Step 2: Laat de server zelf bepalen of het de woon-werkrit is**

Voeg de import toe:

```ts
import { pickCommuteTemplate } from "@/lib/commute";
```

En bepaal vlak vóór het aanmaken van de `kmEntry`. De route stelt de eigenaar al vast met `const ownerId = resolveEntryUserId(role, userId, requestedUserId);` — zet dit blok daarná:

```ts
    // De client stuurt alleen wélk sjabloon hij gebruikte; of dat het beheerde
    // woon-werksjabloon is zoekt de server zelf op. Een `commute`-vlag van de
    // client zou betekenen dat iedereen zijn eigen ritten zo kan bestempelen.
    let commute = false;
    if (data.templateId) {
      const sjablonen = await prisma.kmTemplate.findMany({ where: { userId: ownerId } });
      commute = pickCommuteTemplate(sjablonen as any)?.id === data.templateId;
    }
```

`ownerId` en niet de ingelogde gebruiker: een beheerder mag een rit voor iemand anders boeken, en dan telt het sjabloon van díé medewerker.

Zet daarna `commute` in de `data` van de `create`.

- [ ] **Step 3: Laat het km-scherm het sjabloon meesturen**

In `src/components/km/km-entries-client.tsx` staat rond regel 122 de plek waar een gekozen sjabloon de formuliervelden vult (`const t = templates.find((t) => t.id === id)`). Onthoud daar welk sjabloon gekozen is in een stukje state, bijvoorbeeld `gekozenTemplateId`, en stuur dat mee in de body van de `POST` naar `/api/km`.

Wis die state zodra de gebruiker het project, de kilometers of de omschrijving met de hand aanpast — dan is het geen sjabloonrit meer, en dan zou de vlag liegen.

- [ ] **Step 4: Controleer types, tests en build**

```bash
npx tsc --noEmit
```

Verwacht: geen uitvoer.

```bash
PATH="$HOME/.nvm/versions/node/v20.20.1/bin:$PATH" npx vitest run
```

Verwacht: alles groen, geen nieuwe tests in deze taak.

```bash
DATABASE_URL="postgresql://x:x@localhost:5432/x" PATH="$HOME/.nvm/versions/node/v20.20.1/bin:$PATH" npm run build
```

Verwacht: exitcode 0.

- [ ] **Step 5: Commit**

```bash
git add src/app/api/km/route.ts src/components/km/km-entries-client.tsx
git commit -m "feat: een rit uit het woon-werksjabloon wordt als zodanig herkend"
```

---

### Task 5: De rij "Op kantoor" tonen

**Files:**
- Create: `src/components/time/office-day-row.tsx`
- Modify: `src/app/(app)/time/page.tsx`
- Modify: `src/components/time/time-entries-client.tsx`

**Interfaces:**
- Consumes: `GET /api/km/commute` uit taak 3; `pickCommuteTemplate` uit taak 2.
- Produces: `OfficeDayRow`, met props `{ days: Date[]; actief: string[]; template: { name: string; km: number } | null; bewerkbaar: boolean; bezig: string | null; onToggle: (dayStr: string, present: boolean) => void }`. Taak 6 vult `onToggle`.

- [ ] **Step 1: Geef het sjabloon mee vanaf de pagina**

In `src/app/(app)/time/page.tsx` wordt al per gebruiker opgehaald wat het urenscherm nodig heeft (onder meer het weekrooster). Haal daar ook de km-sjablonen van de ingelogde gebruiker op, kies daaruit met `pickCommuteTemplate` het woon-werksjabloon, en geef het door als prop `commuteTemplate`:

De pagina heeft de ingelogde gebruiker al als `const userId = session?.user?.id ?? "";` en haalt het weekrooster op met precies dit patroon (`userId ? await prisma... : null`). Volg dat:

```tsx
  const commuteTemplate = userId
    ? pickCommuteTemplate(await prisma.kmTemplate.findMany({ where: { userId } }) as any)
    : null;
```

Geef alleen door wat het scherm nodig heeft — `{ name, km: Number(km) }` — of `null`. Zo lekt er geen sjabloon-id of project naar de browser dat daar niets doet.

- [ ] **Step 2: Schrijf het component**

Maak `src/components/time/office-day-row.tsx`:

```tsx
"use client";
import { format } from "date-fns";
import { cn } from "@/lib/utils";

/**
 * De rij "Op kantoor" onder het weekraster van het urenscherm.
 *
 * Een eigen rij en geen kolom in `WeekGrid`, om twee redenen: dat raster is
 * gedeeld met het km-scherm, dat niets met kantoordagen te maken heeft, en elke
 * dag is daar al een knop — een vinkje daarin nestelen levert geneste
 * klikgebieden op. De rij gebruikt hetzelfde raster van acht kolommen en
 * dezelfde minimumbreedte, zodat de vakjes onder hun dag staan.
 */
export function OfficeDayRow({
  days,
  actief,
  template,
  bewerkbaar,
  bezig,
  onToggle,
}: {
  days: Date[];
  actief: string[];
  template: { name: string; km: number } | null;
  bewerkbaar: boolean;
  /** De dag die op dit moment verwerkt wordt, of null. */
  bezig: string | null;
  onToggle: (dayStr: string, present: boolean) => void;
}) {
  const uitleg = template
    ? `${template.name} — ${template.km.toLocaleString("nl-NL")} km`
    : "Er is nog geen woon-werksjabloon ingesteld. Vraag een beheerder dit onder Personeel in te stellen.";

  return (
    <div className="overflow-x-auto border-b">
      <div className="grid grid-cols-8 min-w-[560px] items-center">
        {days.map((day) => {
          const dayStr = format(day, "yyyy-MM-dd");
          const aan = actief.includes(dayStr);
          return (
            <label
              key={dayStr}
              className={cn(
                "flex items-center gap-2 px-3 py-2 text-xs",
                bewerkbaar && template ? "cursor-pointer" : "cursor-default",
              )}
              title={uitleg}
            >
              <input
                type="checkbox"
                className="h-4 w-4 rounded border-input accent-primary"
                checked={aan}
                disabled={!bewerkbaar || !template || bezig === dayStr}
                onChange={(e) => onToggle(dayStr, e.target.checked)}
              />
              <span className="text-muted-foreground">Kantoor</span>
            </label>
          );
        })}
        <div className="px-3 py-2 text-xs text-muted-foreground truncate" title={uitleg}>
          {template ? `${template.km.toLocaleString("nl-NL")} km` : "geen sjabloon"}
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Haal de kantoordagen op en render de rij**

In `src/components/time/time-entries-client.tsx`:

Neem `commuteTemplate` als prop aan en zet er state bij voor de actieve dagen:

```tsx
  const [kantoorDagen, setKantoorDagen] = useState<string[]>([]);
```

Haal ze op wanneer de week of de gefilterde medewerker verandert — naast de bestaande `fetchWeekEntries`. De route accepteert een `userId` die alleen voor beheerders gehonoreerd wordt, dus stuur die mee wanneer een beheerder naar één medewerker kijkt.

Render de rij **direct onder** de bestaande `<WeekGrid ... />`, en alleen wanneer het raster één persoon toont. Dat is dezelfde voorwaarde die de code hierboven al voor het vrije-dag-briefje gebruikt, plus het geval waarin een beheerder één medewerker heeft gekozen:

```tsx
{viewMode === "week" && !(isAdmin && filterUser === "all") && (
  <OfficeDayRow
    days={weekDays}
    actief={kantoorDagen}
    template={commuteTemplate}
    bewerkbaar={!isAdmin || filterUser === userId}
    bezig={kantoorBezig}
    onToggle={toggleKantoorDag}
  />
)}
```

`toggleKantoorDag` en `kantoorBezig` komen in taak 6; zet ze nu neer als een lege functie en `null`, zodat deze taak op zichzelf werkt.

- [ ] **Step 4: Controleer types, tests en build**

```bash
npx tsc --noEmit
```

Verwacht: geen uitvoer.

```bash
PATH="$HOME/.nvm/versions/node/v20.20.1/bin:$PATH" npx vitest run
```

Verwacht: alles groen.

```bash
DATABASE_URL="postgresql://x:x@localhost:5432/x" PATH="$HOME/.nvm/versions/node/v20.20.1/bin:$PATH" npm run build
```

Verwacht: exitcode 0.

- [ ] **Step 5: Commit**

```bash
git add src/components/time/office-day-row.tsx "src/app/(app)/time/page.tsx" src/components/time/time-entries-client.tsx
git commit -m "feat: rij met kantoordagen onder het weekraster"
```

---

### Task 6: De kantoordag aan- en uitzetten

**Files:**
- Modify: `src/components/time/time-entries-client.tsx`

**Interfaces:**
- Consumes: `POST /api/km/commute` uit taak 3.
- Produces: niets. Dit is de laatste taak.

- [ ] **Step 1: Zet de dag aan of uit**

Vul `toggleKantoorDag` en `kantoorBezig` in. De functie stuurt `{ date, present }` naar `POST /api/km/commute`, en:

- zet bij succes de dag in of uit `kantoorDagen`, zodat het vinkje meteen klopt;
- toont bij een fout de melding uit het `error`-veld van het antwoord — verzin geen eigen tekst, de server geeft Nederlandse meldingen;
- houdt tijdens het verzoek `kantoorBezig` op die dag, zodat er niet twee keer geklikt kan worden;
- meldt kort wat er gebeurd is, bijvoorbeeld *"WoonWerk 77,7 km toegevoegd"* of *"Woon-werkrit verwijderd"*, met het aantal kilometers uit het antwoord van de server.

**Over die terugkoppeling:** dit scherm heeft geen meldingenbalk — bij een mislukte opslag doet het `alert(body.error ?? "Aanmaken mislukt")` en bij verwijderen een `confirm()`. Voor een gesláágde handeling is er dus geen patroon, en een `alert()` bij elk vinkje zou onuitstaanbaar zijn. Zet de melding daarom als een regel tekst naast de rij "Op kantoor", die na een handeling verschijnt en bij de volgende weekwissel weer verdwijnt. Gebruik `alert()` uitsluitend voor de foutmelding, gelijk aan de rest van het scherm.

- [ ] **Step 2: Waarschuw bij een rit die er al lijkt te staan**

Een woon-werkrit van vóór deze functie heeft de markering niet, dus het vinkje staat uit terwijl de rit er wel is. Aanvinken zou dan een tweede rit maken.

Controleer daarom vóór het aanvinken of er die dag al een kilometerregistratie van deze medewerker staat op hetzelfde project met hetzelfde aantal kilometers als het sjabloon. Is dat zo, vraag dan om bevestiging met `confirm()` — zoals de rest van dit scherm dat ook doet — met een tekst die zegt wat er al staat en wat er anders bij komt. Zegt de gebruiker nee, doe dan niets.

De kilometerregistraties van de week zitten nog niet in dit scherm; haal ze mee met dezelfde aanroep die de kantoordagen ophaalt, of doe er een aparte aanroep naar `/api/km` voor met hetzelfde weekvenster. Kies één van de twee en leg in een commentaar vast waarom.

- [ ] **Step 3: Controleer types, tests en build**

```bash
npx tsc --noEmit
```

Verwacht: geen uitvoer.

```bash
PATH="$HOME/.nvm/versions/node/v20.20.1/bin:$PATH" npx vitest run
```

Verwacht: alles groen.

```bash
DATABASE_URL="postgresql://x:x@localhost:5432/x" PATH="$HOME/.nvm/versions/node/v20.20.1/bin:$PATH" npm run build
```

Verwacht: exitcode 0.

- [ ] **Step 4: Commit**

```bash
git add src/components/time/time-entries-client.tsx
git commit -m "feat: kantoordag aan- en uitzetten zet de woon-werkrit klaar"
```

---

## Klaar wanneer

- Een medewerker ziet onder het weekraster op `/time` een rij "Op kantoor" met zeven vakjes, en kan daarmee per dag zijn woon-werkrit klaarzetten en weghalen.
- Het vinkje weerspiegelt wat er in de kilometerregistratie staat, ook na een wijziging op het km-scherm.
- Wie geen woon-werksjabloon heeft, krijgt een uitgegrijsd vakje met de reden.
- Een gefactureerde rit kan niet via het vinkje verdwijnen.
- Een beheerder die naar één medewerker kijkt ziet diens vinkjes, maar kan ze niet zetten; bij "alle medewerkers" verdwijnt de rij.
- `npx tsc --noEmit` is schoon, `npm run build` geeft exitcode 0 en de volledige vitest-suite is groen.
