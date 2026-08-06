# Verlof intrekken en beheren namens een medewerker — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Een medewerker kan goedgekeurd verlof dat nog moet beginnen intrekken, en een admin kan verlof aanmaken en wijzigen namens elke medewerker.

**Architecture:** Eén additieve enumwaarde `CANCELLED` draagt het intrekken. De rekenkant die bepaalt welke urenregels een aanvraag oplevert wordt uit de goedkeuringstak gelicht naar een pure functie, omdat straks drie plekken hem nodig hebben — aanmaken door een admin, goedkeuren, en wijzigen van een goedgekeurde aanvraag — en drie kopieën uiteen zouden lopen. De rechtenregel rond intrekken wordt eveneens een pure functie, naar het voorbeeld van `checkEntryMutation`, omdat daar het verschil zit tussen een medewerker die zijn eigen vergissing herstelt en een medewerker die uitbetaalde uren weghaalt.

**Tech Stack:** Next.js 16 (App Router), React 19, TypeScript, Prisma 6 + PostgreSQL, zod 3, react-hook-form, Radix UI, vitest.

## Global Constraints

- **Node 20 is vereist.** De standaard-node in deze shell is v16 en de toolchain crasht daarop. Prefix élk npm- of npx-commando met `PATH="$HOME/.nvm/versions/node/v20.20.1/bin:$PATH"`.
- **Er is een live PRODUCTIEDATABASE bereikbaar via `.env.local`,** met echte uren en verstuurde facturen. Draai NOOIT `npm run db:push` of `npm run db:migrate`. Een mens voert de migratie uit bij de uitrol.
- Na een wijziging aan `prisma/schema.prisma`: `DATABASE_URL="postgresql://x:x@localhost:5432/x" npx prisma generate`. De dummy-URL garandeert dat je niet bij productie komt; genereren raakt geen database aan.
- Dit project heeft geen `prisma/migrations`-map en gebruikt `db:push`. Wijzig alleen `prisma/schema.prisma`; schrijf geen migratiebestanden.
- **Dit is niet de Next.js die je kent.** Lees `node_modules/next/dist/docs/` voordat je aannames doet. (`AGENTS.md` is een echte, door het team gecommitte projectafspraak.)
- **Alle zichtbare tekst is Nederlands.** De statuslabel luidt exact `Ingetrokken`. De bestaande weigeringen blijven woordelijk: `Deze periode bevat geen werkdagen`, `Deze periode bevat geen dagen die op het patroon passen`, `Een patroon van alleen nullen levert geen verlofdagen op`, en `Het project "<naam>" bestaat nog niet`. `Forbidden`, `Unauthorized` en `Not found` zijn bestaande machinegerichte teksten en blijven Engels.
- **Datums zijn `YYYY-MM-DD`-strings en er wordt uitsluitend in UTC gerekend.** De productieserver draait op UTC en de gebruikers zitten in Amsterdam; lokaal rekenen verschuift een dag zonder dat iets klaagt. Zulke strings vergelijken met `<` en `<=` werkt, want lexicografisch is hier gelijk aan chronologisch.
- **"In de toekomst" betekent: startdatum ná vandaag.** Verlof dat vandaag begint telt als lopend en mag de medewerker niet meer zelf intrekken.
- Uren zijn `Decimal(4,2)` op de aanvraag en `Decimal(5,2)` op de urenregels, en elk urengetal dat een mens invoert is een veelvoud van 0,25 (`isQuarter` in `src/lib/quarter-hours.ts`).
- **Een admin die een aanvraag aanmaakt keurt hem daarmee goed** — ook voor zichzelf. Er is geen onderscheid tussen "voor zichzelf" en "voor een ander".
- **Bewerken verplaatst een aanvraag nooit naar een andere medewerker.** De eigenaar staat vast bij het aanmaken; `userId` is alleen een veld op `POST`, niet op `PUT`.
- Testcommando: `npm test`. Baseline: **24 bestanden, 260 tests groen.**
- Lint: `npm run lint`. **De baseline is niet schoon:** 323 errors en 20 warnings, vrijwel allemaal `@typescript-eslint/no-explicit-any`. De gate is *geen nieuwe soorten lint-fouten*.
- **`npx tsc --noEmit` meldt 0 fouten over de hele repo en moet dat blijven doen.**
- `npm run build` kan niet draaien zonder `.env`; gebruik `tsc` als vangnet.
- Testconventie: uitsluitend pure functies in `src/lib/*.test.ts` met vitest. Er bestaan geen component- of API-tests en die worden hier niet geïntroduceerd.

---

## File Structure

**Nieuw:**

| Bestand | Wat |
|---|---|
| `src/lib/absence-permissions.ts` | `canCancelAbsence` — mag deze gebruiker deze aanvraag intrekken. |
| `src/lib/absence-permissions.test.ts` | Tests daarvoor. |
| `src/lib/absence-project.ts` | `findAbsenceProject` — het verlofproject opzoeken, één keer in plaats van drie. |

**Gewijzigd:**

| Bestand | Wat |
|---|---|
| `prisma/schema.prisma` | `CANCELLED` in `enum AbsenceStatus`. |
| `src/lib/absence-entries.ts` | `absenceLines` erbij: de gedeelde regelgeneratie. |
| `src/lib/absence-entries.test.ts` | Tests daarvoor. |
| `src/app/api/absence-requests/route.ts` | `userId` in `POST`, admin keurt meteen goed en genereert regels. |
| `src/app/api/absence-requests/[id]/route.ts` | Intrekken-tak, admin mag alles bewerken, regels opnieuw genereren. |
| `src/components/vacation/absence-client.tsx` | Statuslabel, medewerkerspicker, intrekknop, bewerkknop voor admins. |

---

## Task 1: De enumwaarde

**Files:**
- Modify: `prisma/schema.prisma`

**Interfaces:**
- Produces: `AbsenceStatus.CANCELLED`, waar Task 4 tot en met 6 op bouwen.

**Deze taak levert geen unittests op.** Het is één enumwaarde; er is nog geen code die hem gebruikt.

Deze taak staat expres alleen, zodat de schemawijziging een eigen commit is die vóór de rest naar productie kan.

- [ ] **Step 1: Voeg de waarde toe**

In `prisma/schema.prisma` staat:

```prisma
enum AbsenceStatus {
  PENDING
  APPROVED
  REJECTED
}
```

Vervang door:

```prisma
enum AbsenceStatus {
  PENDING
  APPROVED
  REJECTED
  // Ingetrokken door de medewerker of door een admin namens hem. Een eigen
  // waarde en geen hergebruik van REJECTED, omdat "de admin weigerde" en "de
  // medewerker trok terug" verschillende dingen zijn. De urenregels worden bij
  // deze status verwijderd, net als bij REJECTED, en het vakantiesaldo telt
  // alleen APPROVED — dus een ingetrokken aanvraag valt daar vanzelf uit.
  CANCELLED
}
```

- [ ] **Step 2: Genereer de client**

Run: `PATH="$HOME/.nvm/versions/node/v20.20.1/bin:$PATH" DATABASE_URL="postgresql://x:x@localhost:5432/x" npx prisma generate`
Expected: `Generated Prisma Client`. De dummy-URL is opzet: genereren raakt geen database aan en zo kun je er niet per ongeluk een bereiken.

**Draai geen `db:push` en geen `migrate`.** Een mens doet dat bij de uitrol.

- [ ] **Step 3: Controleer de typen en de tests**

Run: `PATH="$HOME/.nvm/versions/node/v20.20.1/bin:$PATH" npx tsc --noEmit`
Expected: 0 fouten.

Run: `PATH="$HOME/.nvm/versions/node/v20.20.1/bin:$PATH" npm test`
Expected: 24 bestanden, 260 tests, groen.

- [ ] **Step 4: Commit**

```bash
git add prisma/schema.prisma
git commit -m "feat: status CANCELLED voor een ingetrokken verlofaanvraag"
```

---

## Task 2: De gedeelde regelgeneratie

**Files:**
- Modify: `src/lib/absence-entries.ts`
- Modify: `src/lib/absence-entries.test.ts`

**Interfaces:**
- Consumes: `workingDaysBetween` uit `./working-days`, `patternedEntries` en `splitHoursOverDays` uit dit bestand zelf, `type WeekSchedule` uit `./work-schedule`.
- Produces:
  ```ts
  type AbsenceLinesResult =
    | { ok: true; entries: Array<{ date: string; hours: number }> }
    | { ok: false; error: string };

  function absenceLines(
    hours: number,
    pattern: WeekSchedule | null,
    from: string,
    to: string,
  ): AbsenceLinesResult
  ```
  Task 4 en Task 5 roepen deze aan.

- [ ] **Step 1: Schrijf de falende tests**

Voeg onderaan `src/lib/absence-entries.test.ts` toe:

```ts
import { absenceLines } from "./absence-entries";

describe("absenceLines", () => {
  const patroon = { monday: 0, tuesday: 0, wednesday: 8, thursday: 0, friday: 0 };

  it("splits an unpatterned request evenly over the working days", () => {
    // 2026-08-03 is een maandag, 2026-08-07 een vrijdag.
    const uitkomst = absenceLines(40, null, "2026-08-03", "2026-08-07");
    expect(uitkomst).toEqual({
      ok: true,
      entries: [
        { date: "2026-08-03", hours: 8 },
        { date: "2026-08-04", hours: 8 },
        { date: "2026-08-05", hours: 8 },
        { date: "2026-08-06", hours: 8 },
        { date: "2026-08-07", hours: 8 },
      ],
    });
  });

  it("keeps only the days the pattern names, and ignores the hours it was given", () => {
    // Het totaal van 999 wordt genegeerd: met een patroon bepalen de
    // dagwaarden de uren, niet het opgegeven totaal.
    const uitkomst = absenceLines(999, patroon, "2026-08-03", "2026-08-14");
    expect(uitkomst).toEqual({
      ok: true,
      entries: [
        { date: "2026-08-05", hours: 8 },
        { date: "2026-08-12", hours: 8 },
      ],
    });
  });

  it("refuses a period without working days", () => {
    // 2026-08-08 is een zaterdag, 2026-08-09 een zondag.
    expect(absenceLines(8, null, "2026-08-08", "2026-08-09")).toEqual({
      ok: false,
      error: "Deze periode bevat geen werkdagen",
    });
  });

  it("refuses a period in which no day matches the pattern", () => {
    // Maandag en dinsdag, met een woensdagpatroon.
    expect(absenceLines(8, patroon, "2026-08-03", "2026-08-04")).toEqual({
      ok: false,
      error: "Deze periode bevat geen dagen die op het patroon passen",
    });
  });

  it("produces lines that sum to the requested total without a pattern", () => {
    const uitkomst = absenceLines(10, null, "2026-08-03", "2026-08-05");
    if (!uitkomst.ok) throw new Error("verwachtte regels");
    const som = uitkomst.entries.reduce((s, e) => s + Math.round(e.hours * 100), 0);
    expect(som).toBe(1000);
  });
});
```

- [ ] **Step 2: Draai de tests en stel vast dat ze falen**

Run: `PATH="$HOME/.nvm/versions/node/v20.20.1/bin:$PATH" npx vitest run src/lib/absence-entries.test.ts`
Expected: FAIL — `absenceLines` bestaat niet.

- [ ] **Step 3: Schrijf de implementatie**

Voeg onderaan `src/lib/absence-entries.ts` toe:

```ts
/**
 * Wat een verlofaanvraag oplevert: de urenregels, of de reden dat het er geen
 * zijn.
 *
 * Deze functie bestaat omdat drie plekken hem nodig hebben — een admin die een
 * aanvraag aanmaakt, het goedkeuren, en een admin die een goedgekeurde aanvraag
 * wijzigt. Drie kopieën van deze keuze zouden vroeg of laat uiteenlopen, en dan
 * wijkt de tijdlijn af van de aanvraag zonder dat iets klaagt.
 *
 * Hij geeft de weigering terug als waarde en niet als HTTP-antwoord, zodat hij
 * los van een route te testen is. De aanroeper maakt er een 400 van.
 */
export type AbsenceLinesResult =
  | { ok: true; entries: Array<{ date: string; hours: number }> }
  | { ok: false; error: string };

export function absenceLines(
  hours: number,
  pattern: WeekSchedule | null,
  from: string,
  to: string,
): AbsenceLinesResult {
  const dagen = workingDaysBetween(from, to);
  if (dagen.length === 0) {
    return { ok: false, error: "Deze periode bevat geen werkdagen" };
  }

  // Met patroon: alleen de dagen die erop passen, met de uren van die dag; het
  // opgegeven totaal doet dan niet mee. Zonder patroon: het totaal gelijk over
  // alle werkdagen.
  const entries = pattern
    ? patternedEntries(pattern, dagen)
    : splitHoursOverDays(hours, dagen);

  // Alleen bereikbaar mét patroon: een woensdagpatroon over maandag en dinsdag.
  // Zonder patroon kan dit niet, want de invoercontrole eist een positief
  // veelvoud van 0,25 en dat levert altijd minstens één kwartier op.
  if (entries.length === 0) {
    return { ok: false, error: "Deze periode bevat geen dagen die op het patroon passen" };
  }

  return { ok: true, entries };
}
```

- [ ] **Step 4: Draai de tests en stel vast dat ze slagen**

Run: `PATH="$HOME/.nvm/versions/node/v20.20.1/bin:$PATH" npx vitest run src/lib/absence-entries.test.ts`
Expected: PASS.

- [ ] **Step 5: Draai de volledige suite**

Run: `PATH="$HOME/.nvm/versions/node/v20.20.1/bin:$PATH" npm test`
Expected: 24 bestanden, 265 tests, groen.

- [ ] **Step 6: Commit**

```bash
git add src/lib/absence-entries.ts src/lib/absence-entries.test.ts
git commit -m "feat: gedeelde regelgeneratie voor een verlofaanvraag"
```

---

## Task 3: De rechtenregel voor intrekken

**Files:**
- Create: `src/lib/absence-permissions.ts`
- Test: `src/lib/absence-permissions.test.ts`

**Interfaces:**
- Consumes: `isAdmin` uit `./roles`.
- Produces:
  ```ts
  type CancelVerdict = "ok" | "not-found" | "forbidden" | "not-approved" | "already-started";

  function canCancelAbsence(
    role: string,
    sessionUserId: string,
    request: { userId: string; status: string; startDate: string } | null,
    today: string,
  ): CancelVerdict
  ```
  Task 5 roept deze aan. `startDate` en `today` zijn `YYYY-MM-DD`-strings.

- [ ] **Step 1: Schrijf de falende tests**

Maak `src/lib/absence-permissions.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { canCancelAbsence } from "./absence-permissions";

const VANDAAG = "2026-08-06";
const aanvraag = (over: Partial<{ userId: string; status: string; startDate: string }> = {}) => ({
  userId: "u1",
  status: "APPROVED",
  startDate: "2026-08-10",
  ...over,
});

describe("canCancelAbsence", () => {
  it("lets an employee cancel their own approved leave that has not started", () => {
    expect(canCancelAbsence("EMPLOYEE", "u1", aanvraag(), VANDAAG)).toBe("ok");
  });

  it("refuses leave that starts today, because that day is already running", () => {
    expect(canCancelAbsence("EMPLOYEE", "u1", aanvraag({ startDate: VANDAAG }), VANDAAG))
      .toBe("already-started");
  });

  it("refuses leave that started in the past", () => {
    expect(canCancelAbsence("EMPLOYEE", "u1", aanvraag({ startDate: "2026-07-01" }), VANDAAG))
      .toBe("already-started");
  });

  it("refuses someone else's leave", () => {
    expect(canCancelAbsence("EMPLOYEE", "u2", aanvraag(), VANDAAG)).toBe("forbidden");
  });

  it("refuses a request that is not approved", () => {
    // Een aanvraag in afwachting verwijder je, die trek je niet in.
    expect(canCancelAbsence("EMPLOYEE", "u1", aanvraag({ status: "PENDING" }), VANDAAG))
      .toBe("not-approved");
    expect(canCancelAbsence("EMPLOYEE", "u1", aanvraag({ status: "CANCELLED" }), VANDAAG))
      .toBe("not-approved");
  });

  it("lets an admin cancel anyone's approved leave, including in the past", () => {
    expect(canCancelAbsence("ADMIN", "u9", aanvraag({ startDate: "2026-01-05" }), VANDAAG))
      .toBe("ok");
  });

  it("still refuses an admin on a request that is not approved", () => {
    expect(canCancelAbsence("ADMIN", "u9", aanvraag({ status: "REJECTED" }), VANDAAG))
      .toBe("not-approved");
  });

  it("reports a missing request", () => {
    expect(canCancelAbsence("ADMIN", "u9", null, VANDAAG)).toBe("not-found");
  });
});
```

- [ ] **Step 2: Draai de tests en stel vast dat ze falen**

Run: `PATH="$HOME/.nvm/versions/node/v20.20.1/bin:$PATH" npx vitest run src/lib/absence-permissions.test.ts`
Expected: FAIL — de module bestaat niet.

- [ ] **Step 3: Schrijf de implementatie**

Maak `src/lib/absence-permissions.ts`:

```ts
import { isAdmin } from "./roles";

/**
 * Mag deze gebruiker deze verlofaanvraag intrekken?
 *
 * De volgorde van de controles is opzet. De statuscontrole staat vóór de
 * rolcontrole, want intrekken slaat alleen op goedgekeurd verlof — een aanvraag
 * in afwachting verwijder je. Daarna wint de admin: die moet fouten kunnen
 * herstellen, ook met terugwerkende kracht.
 *
 * De datumgrens geldt alleen voor de medewerker. Een urenoverzicht en een
 * loonrun lezen de gegenereerde urenregels, en een medewerker mag niet in zijn
 * eentje uren weghalen die daar al in meegeteld hebben.
 */
export type CancelVerdict =
  | "ok"
  | "not-found"
  | "forbidden"
  | "not-approved"
  | "already-started";

export function canCancelAbsence(
  role: string,
  sessionUserId: string,
  request: { userId: string; status: string; startDate: string } | null,
  today: string,
): CancelVerdict {
  if (!request) return "not-found";
  if (request.status !== "APPROVED") return "not-approved";
  if (isAdmin(role)) return "ok";
  if (request.userId !== sessionUserId) return "forbidden";
  // YYYY-MM-DD vergelijkt lexicografisch gelijk aan chronologisch. Gelijk aan
  // vandaag telt als begonnen: die dag is al bezig.
  if (request.startDate <= today) return "already-started";
  return "ok";
}
```

- [ ] **Step 4: Draai de tests en stel vast dat ze slagen**

Run: `PATH="$HOME/.nvm/versions/node/v20.20.1/bin:$PATH" npx vitest run src/lib/absence-permissions.test.ts`
Expected: PASS, 8 tests.

- [ ] **Step 5: Draai de volledige suite**

Run: `PATH="$HOME/.nvm/versions/node/v20.20.1/bin:$PATH" npm test`
Expected: 25 bestanden, 273 tests, groen.

- [ ] **Step 6: Commit**

```bash
git add src/lib/absence-permissions.ts src/lib/absence-permissions.test.ts
git commit -m "feat: rechtenregel voor het intrekken van verlof"
```

---

## Task 4: Aanmaken namens een medewerker

**Files:**
- Create: `src/lib/absence-project.ts`
- Modify: `src/app/api/absence-requests/route.ts`

**Interfaces:**
- Consumes: `absenceLines` uit Task 2, `resolveEntryUserId` uit `src/lib/entry-owner.ts`, `isAdmin` uit `src/lib/roles.ts`. De nieuwe helper hieronder consumeert `ABSENCE_PROJECT_NAMES` uit `src/lib/absence-entries.ts`.
- Produces:
  ```ts
  type AbsenceProjectResult =
    | { ok: true; projectId: string }
    | { ok: false; error: string };

  function findAbsenceProject(type: string): Promise<AbsenceProjectResult>
  ```
  Task 5 roept deze twee keer aan.

**Deze taak levert geen unittests op.** De rekenkant zit in Task 2; wat hier bijkomt is routewerk, en `findAbsenceProject` raakt de database en valt daarmee buiten de testconventie van dit project.

- [ ] **Step 1: Maak de gedeelde projectopzoeking**

Zonder deze stap staat hetzelfde blok straks op drie plekken: hier, in de goedkeuringstak en in de bewerktak. Maak `src/lib/absence-project.ts`:

```ts
import { prisma } from "./prisma";
import { ABSENCE_PROJECT_NAMES } from "./absence-entries";

/**
 * Het project waarop verlof van een bepaalde soort geboekt wordt.
 *
 * Drie plekken hebben dit nodig — een admin die een aanvraag aanmaakt, het
 * goedkeuren, en een admin die een goedgekeurde aanvraag wijzigt. Drie keer
 * dezelfde `findFirst` uitschrijven betekent dat een wijziging aan wat een
 * verlofproject ís, bijvoorbeeld wanneer ze ooit wél een klant mogen hebben,
 * op drie plekken moet en er dus één vergeten wordt.
 *
 * De weigering komt terug als waarde en niet als HTTP-antwoord; de aanroeper
 * maakt er een 400 van.
 */
export type AbsenceProjectResult =
  | { ok: true; projectId: string }
  | { ok: false; error: string };

export async function findAbsenceProject(type: string): Promise<AbsenceProjectResult> {
  const naam = ABSENCE_PROJECT_NAMES[type];
  const project = await prisma.project.findFirst({
    where: { name: naam, billable: false, customerId: null },
    select: { id: true },
  });
  if (!project) return { ok: false, error: `Het project "${naam}" bestaat nog niet` };
  return { ok: true, projectId: project.id };
}
```

`src/lib/api.ts` importeert `prisma` al vanuit `src/lib/`, dus dat precedent bestaat.

- [ ] **Step 2: Breid de imports en het schema uit**

Bovenaan `src/app/api/absence-requests/route.ts` staat:

```ts
import { patternSummary } from "@/lib/absence-entries";
```

Vervang door:

```ts
import { patternSummary, absenceLines } from "@/lib/absence-entries";
import { resolveEntryUserId } from "@/lib/entry-owner";
import { findAbsenceProject } from "@/lib/absence-project";
```

Voeg in `createSchema` toe, ná `pattern`:

```ts
  // Alleen een admin mag hiermee een andere medewerker opgeven; bij iedereen
  // anders negeert resolveEntryUserId het veld. Zelfde patroon als op
  // POST /api/time.
  userId: z.string().optional().nullable(),
```

- [ ] **Step 3: Bepaal de eigenaar en de status**

In `POST` staat nu:

```ts
    const data = createSchema.parse(await req.json());
```

Vervang door:

```ts
    const role = (session.user as any)?.role ?? "EMPLOYEE";
    const data = createSchema.parse(await req.json());

    const ownerId = resolveEntryUserId(role, userId, data.userId);
    if (ownerId !== userId) {
      const owner = await prisma.user.findUnique({ where: { id: ownerId }, select: { id: true } });
      if (!owner) return NextResponse.json({ error: "Onbekende medewerker" }, { status: 400 });
    }

    // Een admin die een aanvraag aanmaakt keurt hem daarmee goed — ook voor
    // zichzelf. Hij ís de goedkeurder, dus een tussenstap waarin hij zijn eigen
    // invoer nog moet goedkeuren voegt niets toe.
    const meteenGoedgekeurd = isAdmin(role);
```

- [ ] **Step 4: Genereer de urenregels wanneer de aanvraag meteen goedgekeurd is**

Ná het bestaande patroonblok dat `hours` bepaalt (dat eindigt met `hours = total;` en de sluitende `}`), en vóór `const request = await prisma.absenceRequest.create({`, voeg toe:

```ts
    // Bij een meteen goedgekeurde aanvraag eerst alles uitrekenen en pas daarna
    // schrijven: een ontbrekend verlofproject of een periode zonder werkdagen
    // moet niets achterlaten in plaats van een halve aanvraag.
    let projectId = "";
    let regels: Array<{ date: string; hours: number }> = [];
    if (meteenGoedgekeurd) {
      const project = await findAbsenceProject(data.type);
      if (!project.ok) return NextResponse.json({ error: project.error }, { status: 400 });
      projectId = project.projectId;

      const uitkomst = absenceLines(hours, data.pattern ?? null, data.startDate, data.endDate);
      if (!uitkomst.ok) return NextResponse.json({ error: uitkomst.error }, { status: 400 });
      regels = uitkomst.entries;
    }
```

- [ ] **Step 5: Schrijf de aanvraag en de regels in één transactie**

Vervang het hele blok van `const request = await prisma.absenceRequest.create({` tot en met de afsluitende `});` door:

```ts
    const request = await prisma.$transaction(async (tx) => {
      const aanvraag = await tx.absenceRequest.create({
        data: {
          userId: ownerId,
          type: data.type,
          startDate: new Date(data.startDate),
          endDate: new Date(data.endDate),
          hours,
          description: data.description ?? null,
          ...(meteenGoedgekeurd
            ? { status: "APPROVED" as const, reviewedBy: userId, reviewedAt: new Date() }
            : {}),
          ...(data.pattern ? { pattern: { create: data.pattern } } : {}),
        },
        include: {
          user: { select: { id: true, name: true } },
          reviewer: { select: { id: true, name: true } },
          pattern: true,
        },
      });

      if (regels.length > 0) {
        await tx.timeEntry.createMany({
          data: regels.map((r) => ({
            userId: ownerId,
            projectId,
            date: new Date(`${r.date}T00:00:00Z`),
            hours: r.hours,
            description: data.description ?? null,
            absenceRequestId: aanvraag.id,
          })),
        });
      }
      return aanvraag;
    });
```

- [ ] **Step 6: Controleer de typen en de tests**

Run: `PATH="$HOME/.nvm/versions/node/v20.20.1/bin:$PATH" npx tsc --noEmit`
Expected: 0 fouten.

Run: `PATH="$HOME/.nvm/versions/node/v20.20.1/bin:$PATH" npm test`
Expected: 25 bestanden, 273 tests, groen.

- [ ] **Step 7: Commit**

```bash
git add src/lib/absence-project.ts src/app/api/absence-requests/route.ts
git commit -m "feat: admin maakt verlof aan namens een medewerker, meteen goedgekeurd"
```

---

## Task 5: Intrekken en wijzigen

**Files:**
- Modify: `src/app/api/absence-requests/[id]/route.ts`

**Interfaces:**
- Consumes: `absenceLines` uit Task 2, `canCancelAbsence` uit Task 3.

**Deze taak levert geen unittests op.** De rekenkant zit in Task 2 en de rechtenregel in Task 3.

- [ ] **Step 1: Breid de imports uit**

Bovenaan `src/app/api/absence-requests/[id]/route.ts` staat een import uit `@/lib/absence-entries` met meerdere namen. Voeg `absenceLines` daaraan toe, en voeg twee regels toe:

```ts
import { canCancelAbsence } from "@/lib/absence-permissions";
import { findAbsenceProject } from "@/lib/absence-project";
```

- [ ] **Step 2: Voeg de intrekken-tak toe**

In `PUT` staat:

```ts
    const body = await req.json();

    if (isAdmin(role) && "status" in body) {
```

Voeg dáártussen de nieuwe tak toe, zodat het wordt:

```ts
    const body = await req.json();

    // Intrekken is een eigen actie en geen statuswijziging via adminUpdateSchema:
    // die tak is admin-only en gaat over beoordelen, terwijl intrekken juist
    // iets is wat de medewerker zelf doet. Ze samenvoegen zou betekenen dat de
    // rechtencontrole van het beoordelen versoepeld moet worden.
    if (body?.action === "cancel") {
      const vandaag = new Date().toISOString().slice(0, 10);
      const verdict = canCancelAbsence(role, userId, {
        userId: existing.userId,
        status: existing.status,
        startDate: existing.startDate.toISOString().slice(0, 10),
      }, vandaag);

      if (verdict === "not-found") return NextResponse.json({ error: "Not found" }, { status: 404 });
      if (verdict === "forbidden") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      if (verdict === "not-approved") {
        return NextResponse.json(
          { error: "Alleen goedgekeurd verlof kan worden ingetrokken" },
          { status: 400 },
        );
      }
      if (verdict === "already-started") {
        return NextResponse.json(
          { error: "Verlof dat al begonnen is kan alleen een beheerder intrekken" },
          { status: 400 },
        );
      }

      const updated = await prisma.$transaction(async (tx) => {
        const aanvraag = await tx.absenceRequest.update({
          where: { id },
          data: { status: "CANCELLED", reviewedBy: userId, reviewedAt: new Date() },
          include: {
            user: { select: { id: true, name: true } },
            reviewer: { select: { id: true, name: true } },
            pattern: true,
          },
        });
        // De urenregels van een ingetrokken aanvraag horen te verdwijnen, net
        // als bij een afwijzing.
        await tx.timeEntry.deleteMany({ where: { absenceRequestId: id } });
        return aanvraag;
      });

      return NextResponse.json({
        ...updated,
        hours: Number(updated.hours),
        pattern: toWeekSchedule(updated.pattern),
      });
    }

    if (isAdmin(role) && "status" in body) {
```

- [ ] **Step 3: Laat de goedkeuringstak de gedeelde functies gebruiken**

De admintak zoekt eerst het project op. Dat blok staat er nu zo:

```ts
        const naam = ABSENCE_PROJECT_NAMES[existing.type];
        const project = await prisma.project.findFirst({
          where: { name: naam, billable: false, customerId: null },
          select: { id: true },
        });
        if (!project) {
          return NextResponse.json(
            { error: `Het project "${naam}" bestaat nog niet` },
            { status: 400 },
          );
        }
        projectId = project.id;
```

Vervang door:

```ts
        const project = await findAbsenceProject(existing.type);
        if (!project.ok) return NextResponse.json({ error: project.error }, { status: 400 });
        projectId = project.projectId;
```

Direct daaronder staat de dagen- en regelberekening:

```ts
        const dagen = workingDaysBetween(
          existing.startDate.toISOString().slice(0, 10),
          existing.endDate.toISOString().slice(0, 10),
        );
        if (dagen.length === 0) {
          return NextResponse.json({ error: "Deze periode bevat geen werkdagen" }, { status: 400 });
        }
        // Met patroon: alleen de dagen die erop passen, met de uren van die dag.
        // Zonder patroon: het totaal gelijk over alle werkdagen, ongewijzigd.
        const patroon = toWeekSchedule(existing.pattern);
        regels = patroon
          ? patternedEntries(patroon, dagen)
          : splitHoursOverDays(Number(existing.hours), dagen);

        // Een periode kan werkdagen bevatten zonder dat er één op het patroon
        // past — een woensdagpatroon over maandag en dinsdag. Dat is een andere
        // fout dan een periode zonder werkdagen en verdient een eigen melding.
        if (regels.length === 0) {
          return NextResponse.json(
            { error: "Deze periode bevat geen dagen die op het patroon passen" },
            { status: 400 },
          );
        }
```

Vervang door:

```ts
        const uitkomst = absenceLines(
          Number(existing.hours),
          toWeekSchedule(existing.pattern),
          existing.startDate.toISOString().slice(0, 10),
          existing.endDate.toISOString().slice(0, 10),
        );
        if (!uitkomst.ok) return NextResponse.json({ error: uitkomst.error }, { status: 400 });
        regels = uitkomst.entries;
```

Zijn `workingDaysBetween`, `patternedEntries`, `splitHoursOverDays` of `ABSENCE_PROJECT_NAMES` daarna nergens meer in dit bestand in gebruik, verwijder ze dan uit de imports. Controleer dat met grep in plaats van op gevoel.

- [ ] **Step 4: Laat een admin elke aanvraag bewerken**

Verderop staat:

```ts
    if (existing.userId !== userId) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    if (existing.status !== "PENDING") {
      return NextResponse.json({ error: "Can only edit pending requests" }, { status: 400 });
    }
```

Vervang door:

```ts
    // Een admin mag elke aanvraag bewerken, ook een goedgekeurde en ook die van
    // een ander. De medewerker houdt zijn grens: alleen zijn eigen aanvraag, en
    // alleen zolang die nog in afwachting is.
    if (!isAdmin(role)) {
      if (existing.userId !== userId) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }
      if (existing.status !== "PENDING") {
        return NextResponse.json({ error: "Can only edit pending requests" }, { status: 400 });
      }
    }
```

- [ ] **Step 5: Genereer de urenregels opnieuw bij een goedgekeurde aanvraag**

Ná het blok dat `hours` bepaalt (dat eindigt met `hours = total;` en de sluitende `}`), en vóór `const updated = await prisma.$transaction(`, voeg toe:

```ts
    // Wijzigt een admin een aanvraag die al goedgekeurd is, dan moeten de
    // urenregels mee. Zonder dit loopt de tijdlijn stilzwijgend uit de pas met
    // de aanvraag. De status blijft staan: bewerken is geen nieuwe beoordeling.
    let projectId = "";
    let regels: Array<{ date: string; hours: number }> = [];
    if (existing.status === "APPROVED") {
      // data.type ?? existing.type: het type mag bij het bewerken wijzigen, en
      // dan verhuizen de urenregels naar het project van het nieuwe type.
      const project = await findAbsenceProject(data.type ?? existing.type);
      if (!project.ok) return NextResponse.json({ error: project.error }, { status: 400 });
      projectId = project.projectId;

      const uitkomst = absenceLines(hours, data.pattern ?? null, data.startDate, data.endDate);
      if (!uitkomst.ok) return NextResponse.json({ error: uitkomst.error }, { status: 400 });
      regels = uitkomst.entries;
    }
```

- [ ] **Step 6: Schrijf de regels weg in dezelfde transactie**

In de bewerktransactie staat aan het eind:

```ts
      return tx.absenceRequest.update({
        where: { id },
        data: {
          ...(data.type ? { type: data.type } : {}),
          startDate: new Date(data.startDate),
          endDate: new Date(data.endDate),
          hours,
          description: data.description ?? null,
        },
        include: {
          user: { select: { id: true, name: true } },
          reviewer: { select: { id: true, name: true } },
          pattern: true,
        },
      });
    });
```

Vervang door:

```ts
      const aanvraag = await tx.absenceRequest.update({
        where: { id },
        data: {
          ...(data.type ? { type: data.type } : {}),
          startDate: new Date(data.startDate),
          endDate: new Date(data.endDate),
          hours,
          description: data.description ?? null,
        },
        include: {
          user: { select: { id: true, name: true } },
          reviewer: { select: { id: true, name: true } },
          pattern: true,
        },
      });

      // Verwijderen-en-opnieuw-maken, net als bij het goedkeuren: zo komen
      // gewijzigde datums vanzelf goed. Bij een aanvraag die niet goedgekeurd
      // is, is regels leeg en gebeurt er niets — die heeft geen urenregels.
      if (existing.status === "APPROVED") {
        await tx.timeEntry.deleteMany({ where: { absenceRequestId: id } });
        await tx.timeEntry.createMany({
          data: regels.map((r) => ({
            userId: existing.userId,
            projectId,
            date: new Date(`${r.date}T00:00:00Z`),
            hours: r.hours,
            description: data.description ?? null,
            absenceRequestId: id,
          })),
        });
      }
      return aanvraag;
    });
```

- [ ] **Step 7: Controleer dat de eigenaar niet kan verschuiven**

Run: `git diff "src/app/api/absence-requests/[id]/route.ts"`

Stel met eigen ogen vast dat `PUT` nergens `userId` op de aanvraag schrijft: bewerken verplaatst een aanvraag nooit naar een andere medewerker, en de urenregels blijven op `existing.userId` staan. Meld in je rapport wat je vaststelde.

- [ ] **Step 8: Controleer de typen en de tests**

Run: `PATH="$HOME/.nvm/versions/node/v20.20.1/bin:$PATH" npx tsc --noEmit`
Expected: 0 fouten.

Run: `PATH="$HOME/.nvm/versions/node/v20.20.1/bin:$PATH" npm test`
Expected: 25 bestanden, 273 tests, groen.

- [ ] **Step 9: Commit**

```bash
git add "src/app/api/absence-requests/[id]/route.ts"
git commit -m "feat: verlof intrekken, en admin bewerkt elke aanvraag"
```

---

## Task 6: Het scherm

**Files:**
- Modify: `src/components/vacation/absence-client.tsx`

**Interfaces:**
- Consumes: het veld `userId` op `POST` uit Task 4; de actie `{ action: "cancel" }` op `PUT` uit Task 5.

**Deze taak levert geen unittests op.** Het is formuliertoestand en knopzichtbaarheid in een clientcomponent.

- [ ] **Step 1: Voeg de status toe aan het type en de badge**

Bovenaan staat:

```tsx
type AbsenceStatus = "PENDING" | "APPROVED" | "REJECTED";
```

Vervang door:

```tsx
type AbsenceStatus = "PENDING" | "APPROVED" | "REJECTED" | "CANCELLED";
```

En vervang de functie `statusBadge`:

```tsx
function statusBadge(status: AbsenceStatus) {
  if (status === "APPROVED") return <Badge className="bg-green-100 text-green-800 hover:bg-green-100 dark:bg-green-900/40 dark:text-green-200 dark:hover:bg-green-900/40">Goedgekeurd</Badge>;
  if (status === "REJECTED") return <Badge className="bg-red-100 text-red-800 hover:bg-red-100 dark:bg-red-900/40 dark:text-red-200 dark:hover:bg-red-900/40">Afgewezen</Badge>;
  return <Badge className="bg-yellow-100 text-yellow-800 hover:bg-yellow-100 dark:bg-yellow-900/40 dark:text-yellow-200 dark:hover:bg-yellow-900/40">In afwachting</Badge>;
}
```

door:

```tsx
function statusBadge(status: AbsenceStatus) {
  if (status === "APPROVED") return <Badge className="bg-green-100 text-green-800 hover:bg-green-100 dark:bg-green-900/40 dark:text-green-200 dark:hover:bg-green-900/40">Goedgekeurd</Badge>;
  if (status === "REJECTED") return <Badge className="bg-red-100 text-red-800 hover:bg-red-100 dark:bg-red-900/40 dark:text-red-200 dark:hover:bg-red-900/40">Afgewezen</Badge>;
  // Expliciet, want de laatste regel is een vangnet: zonder deze tak zou een
  // ingetrokken aanvraag "In afwachting" tonen, het omgekeerde van wat waar is.
  if (status === "CANCELLED") return <Badge className="bg-gray-100 text-gray-800 hover:bg-gray-100 dark:bg-gray-800/60 dark:text-gray-200 dark:hover:bg-gray-800/60">Ingetrokken</Badge>;
  return <Badge className="bg-yellow-100 text-yellow-800 hover:bg-yellow-100 dark:bg-yellow-900/40 dark:text-yellow-200 dark:hover:bg-yellow-900/40">In afwachting</Badge>;
}
```

- [ ] **Step 2: Voeg de intrekfunctie toe**

Zoek `async function reviewRequest(` en voeg dáárvóór toe:

```tsx
  async function cancelRequest(id: string) {
    const res = await fetch(`/api/absence-requests/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "cancel" }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      alert(err.error ?? "Er is een fout opgetreden");
      return;
    }
    const updated: AbsenceRequest = await res.json();
    setRequests((prev) => prev.map((r) => (r.id === updated.id ? updated : r)));
  }
```

- [ ] **Step 3: Stuur de gekozen medewerker mee bij het aanmaken**

In `submitRequest` staat:

```tsx
      body: JSON.stringify({ ...values, pattern: herhaald ? patroon : null }),
```

Vervang door:

```tsx
      // userId gaat alleen mee bij het aanmaken: bewerken verplaatst een
      // aanvraag nooit naar een andere medewerker, en PUT kent het veld niet.
      body: JSON.stringify({
        ...values,
        pattern: herhaald ? patroon : null,
        ...(editingRequest ? {} : { userId: gekozenMedewerker || currentUserId }),
      }),
```

En voeg bij de andere `useState`-declaraties toe:

```tsx
  // Alleen zichtbaar en gebruikt voor een admin; een medewerker maakt altijd
  // voor zichzelf aan en de server negeert het veld dan sowieso.
  const [gekozenMedewerker, setGekozenMedewerker] = useState("");
```

In `openRequestDialog` staat in de else-tak:

```tsx
      setHerhaald(false);
      setPatroon(LEEG_PATROON);
```

Voeg daaronder toe:

```tsx
      setGekozenMedewerker(currentUserId);
```

- [ ] **Step 4: Voeg de medewerkerspicker toe aan het aanvraagdialoog**

Het aanvraagformulier begint zo — dit is het anker, het eerste veld ná `<form onSubmit={requestForm.handleSubmit(submitRequest)} className="space-y-4">`:

```tsx
            <div className="space-y-1.5">
              <Label htmlFor="absenceType">Type afwezigheid</Label>
```

Voeg **direct vóór dat omhullende `div`** toe:

```tsx
            {isAdmin && !editingRequest && (
              <div className="space-y-1.5">
                <Label htmlFor="requestUser">Medewerker</Label>
                <Select onValueChange={setGekozenMedewerker} value={gekozenMedewerker}>
                  <SelectTrigger id="requestUser">
                    <SelectValue placeholder="Selecteer medewerker" />
                  </SelectTrigger>
                  <SelectContent>
                    {users.map((u) => (
                      <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  Als beheerder leg je verlof meteen vast: de aanvraag is direct goedgekeurd.
                </p>
              </div>
            )}
```

- [ ] **Step 5: Geef de intrekfunctie door aan de tabel**

Op twee plekken wordt `RequestsTable` gerenderd, allebei met dezelfde vier props. Voeg bij élk van die twee toe, ná `onReview={reviewRequest}`:

```tsx
              onCancel={cancelRequest}
```

Let op de inspringing: neem die over van de `onReview`-regel ernaast.

Breid daarna de signatuur van `RequestsTable` uit. Van:

```tsx
  onReview,
}: {
  requests: AbsenceRequest[];
  allRequests: AbsenceRequest[];
  budgets: VacationBudget[];
  isAdmin: boolean;
  currentUserId: string;
  onEdit: (r: AbsenceRequest) => void;
  onDelete: (id: string) => void;
  onReview: (id: string, status: "APPROVED" | "REJECTED") => void;
}) {
```

naar:

```tsx
  onReview,
  onCancel,
}: {
  requests: AbsenceRequest[];
  allRequests: AbsenceRequest[];
  budgets: VacationBudget[];
  isAdmin: boolean;
  currentUserId: string;
  onEdit: (r: AbsenceRequest) => void;
  onDelete: (id: string) => void;
  onReview: (id: string, status: "APPROVED" | "REJECTED") => void;
  onCancel: (id: string) => void;
}) {
```

- [ ] **Step 6: Zet de knoppen in de rij**

In `RequestsTable` staat het blok met de bewerk- en verwijderknoppen:

```tsx
                  {r.userId === currentUserId && r.status === "PENDING" && (
                    <>
                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => onEdit(r)}>
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 text-destructive"
                        onClick={() => onDelete(r.id)}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </>
                  )}
```

Vervang door:

```tsx
                  {/* Een admin bewerkt elke aanvraag; de medewerker alleen zijn
                      eigen, en alleen zolang die in afwachting is. */}
                  {(isAdmin || (r.userId === currentUserId && r.status === "PENDING")) && (
                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => onEdit(r)}>
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                  )}
                  {/* Intrekken kan alleen bij goedgekeurd verlof. De medewerker
                      alleen zolang het nog niet begonnen is; een admin altijd,
                      want fouten moeten te herstellen zijn. */}
                  {r.status === "APPROVED" &&
                    (isAdmin || (r.userId === currentUserId && r.startDate.slice(0, 10) > vandaag)) && (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 text-muted-foreground"
                        title="Intrekken"
                        onClick={() => onCancel(r.id)}
                      >
                        <Undo2 className="h-3.5 w-3.5" />
                      </Button>
                    )}
                  {r.userId === currentUserId && r.status === "PENDING" && (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 text-destructive"
                      onClick={() => onDelete(r.id)}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  )}
```

Voeg bovenin `RequestsTable`, direct ná de openende `{` van de functie en vóór de bestaande `if (requests.length === 0)`, toe:

```tsx
  // Eén keer bepalen in plaats van per rij. UTC, zoals overal in deze codebase.
  const vandaag = new Date().toISOString().slice(0, 10);
```

En breid de icoon-import bovenaan het bestand uit met `Undo2`:

```tsx
import { CalendarDays, Copy, Check, Plus, Trash2, ThumbsUp, ThumbsDown, Pencil, Undo2 } from "lucide-react";
```

- [ ] **Step 7: Controleer de typen, de tests en de lint**

Run: `PATH="$HOME/.nvm/versions/node/v20.20.1/bin:$PATH" npx tsc --noEmit`
Expected: 0 fouten.

Run: `PATH="$HOME/.nvm/versions/node/v20.20.1/bin:$PATH" npm test`
Expected: 25 bestanden, 273 tests, groen.

Run: `PATH="$HOME/.nvm/versions/node/v20.20.1/bin:$PATH" npm run lint`
Expected: 323 errors en 20 warnings, gelijk aan de baseline.

- [ ] **Step 8: Commit**

```bash
git add src/components/vacation/absence-client.tsx
git commit -m "feat: intrekken, medewerkerspicker en bewerken voor admins in het scherm"
```

---

## Uitrol

**De migratie moet vóór de code live staan.** Draaiende code die `CANCELLED` nog niet kent heeft geen last van een enumwaarde die niemand gebruikt; nieuwe code die die waarde wegschrijft naar een database die hem niet kent, faalt.

1. `prisma migrate diff` draaien en de **volledige** uitvoer lezen. Er hoort alleen één waarde bij de enum te komen. Verdwijnt er iets, stop dan.
2. `npm run db:push`.
3. Deployen.

Geen backfill; bestaande aanvragen houden hun status.

Handmatig na te lopen na de deploy:

- [ ] Als medewerker: goedgekeurd verlof dat volgende maand begint intrekken → de aanvraag staat op **Ingetrokken**, de urenregels zijn weg uit `/time`, en het vakantiesaldo is weer omhoog.
- [ ] Als medewerker: bij goedgekeurd verlof dat vandaag begint of al voorbij is staat **geen** intrekknop.
- [ ] Als admin: datzelfde verlopen verlof intrekken lukt wél.
- [ ] Als admin: verlof aanmaken voor een andere medewerker → staat meteen op **Goedgekeurd** en de urenregels staan direct in `/time` op naam van die medewerker.
- [ ] Als admin: verlof voor jezelf aanmaken → ook meteen goedgekeurd. Dit is de gedragswijziging; controleer dat hij niet meer op "In afwachting" blijft staan.
- [ ] Als admin: een goedgekeurde aanvraag bewerken naar een andere periode → de urenregels in `/time` schuiven mee, zonder dubbelingen en zonder achterblijvers op de oude datums.
- [ ] Als admin: een goedgekeurde patroonaanvraag bewerken naar een ander patroon → de dagen kloppen met het nieuwe patroon.
- [ ] Als medewerker: een aanvraag van een collega bewerken lukt niet, en de knop is er ook niet.
- [ ] Een ingetrokken aanvraag opnieuw intrekken → geweigerd met `Alleen goedgekeurd verlof kan worden ingetrokken`.
