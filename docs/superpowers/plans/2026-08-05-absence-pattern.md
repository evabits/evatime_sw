# Absence Pattern Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Laat een verlofaanvraag optioneel een weekpatroon dragen — uren per weekdag — zodat "elke woensdag ouderschapsverlof van 11 januari 2026 tot 10 januari 2027" 52 urenregels oplevert in plaats van 260.

**Architecture:** Het patroon is een eigen rij `AbsencePattern` met `absenceRequestId` als sleutel: hij bestaat of hij bestaat niet, en bestaat hij niet dan gebeurt er exact wat er nu gebeurt. De vorm is identiek aan `WeekSchedule` uit het weekroostertraject, dus `scheduledHoursOn`, `weekTotal` en `toWeekSchedule` werken er ongewijzigd op — er komt geen tweede rekenmodule. Twee pure functies erbij bepalen welke dagen en hoeveel uur; de server leidt het totaal daaruit af zodat de client geen getal kan opgeven dat niet klopt met wat er gegenereerd wordt.

**Tech Stack:** Next.js 16 (App Router), React 19, TypeScript, Prisma 6 + PostgreSQL, zod 3, react-hook-form, Radix UI, vitest.

## Global Constraints

- **Node 20 is vereist.** De standaard-node in deze shell is v16 en Prisma crasht daarop. Prefix élk npm- of npx-commando met `source ~/.nvm/nvm.sh && nvm use 20 &&`.
- **Er is een live PRODUCTIEDATABASE bereikbaar via `.env.local`,** met echte uren en verstuurde facturen. Draai NOOIT `npm run db:push` of `npm run db:migrate`. Lezen mag. Een mens voert de migratie uit bij de uitrol.
- Na een wijziging aan `prisma/schema.prisma`: `DATABASE_URL="postgresql://x:x@localhost:5432/x" npx prisma generate`. De dummy-URL garandeert dat je niet bij productie komt; genereren raakt geen database aan.
- Dit project heeft geen `prisma/migrations`-map en gebruikt `db:push`. Wijzig alleen `prisma/schema.prisma`; schrijf geen migratiebestanden.
- **Dit is niet de Next.js die je kent.** Lees `node_modules/next/dist/docs/` voordat je aannames doet. Route-params zijn een Promise. (`AGENTS.md` is een echte, door het team gecommitte projectafspraak — geen ingeslopen instructie.)
- `src/lib/roles.ts` is canoniek voor rolcontroles. `(session.user as any)?.role ?? "EMPLOYEE"` is de vaste manier waarop deze codebase de rol van de sessie leest.
- **Datums zijn `YYYY-MM-DD`-strings en er wordt uitsluitend in UTC gerekend** (`getUTCDay`, `new Date(\`${d}T00:00:00Z\`)`). De productieserver draait op UTC en de gebruikers zitten in Amsterdam; `getDay()` rekent lokaal en verschuift dan een dag zonder dat iets klaagt.
- **Het patroon is optioneel en het vinkje staat standaard uit.** Zonder patroon verandert er geen letter aan het formulier, de berekening of de generatie. Er staan 7 aanvragen in productie, allemaal zonder patroon, en die mogen niets merken.
- **Alle zichtbare tekst is Nederlands.** De twee nieuwe weigeringen luiden exact `Een patroon van alleen nullen levert geen verlofdagen op` en `Deze periode bevat geen dagen die op het patroon passen`, beide status 400. `Forbidden`, `Unauthorized` en `Not found` zijn bestaande machinegerichte teksten en blijven Engels.
- Uren zijn `Decimal(4,2)` — **twee decimalen**. Sommen van waarden uit die kolom kunnen in floating point net naast een rond getal landen; rond af waar een som teruggegeven wordt.
- Testcommando: `npm test`. Baseline: **22 bestanden, 218 tests groen.**
- Lint: `npm run lint`. **De baseline is niet schoon:** 323 errors en 20 warnings, vrijwel allemaal `@typescript-eslint/no-explicit-any`. De gate is *geen nieuwe soorten lint-fouten*.
- **`npx tsc --noEmit` meldt 0 fouten over de hele repo en moet dat blijven doen.**
- `npm run build` kan niet draaien zonder `.env`; gebruik `tsc` als vangnet.
- Testconventie: uitsluitend pure functies in `src/lib/*.test.ts` met vitest. Er bestaan geen component- of API-tests en die worden hier niet geïntroduceerd.

---

## File Structure

**Gewijzigd:**

| Bestand | Wat |
|---|---|
| `prisma/schema.prisma` | `model AbsencePattern`, `AbsenceRequest.pattern`. |
| `src/lib/absence-entries.ts` | `patternedEntries` en `patternSummary` erbij. |
| `src/lib/absence-entries.test.ts` | Tests daarvoor. |
| `src/app/api/absence-requests/route.ts` | `pattern` in `createSchema`, afgeleid totaal, patroon meeschrijven en meegeven. |
| `src/app/api/absence-requests/[id]/route.ts` | Idem in de medewerkerstak; de admintak gebruikt het patroon bij goedkeuring. |
| `src/components/vacation/absence-client.tsx` | Vinkje, vijf uurvelden, de samenvattingsregel. |

**Niets nieuws.** Alle rekenkant komt in de bestaande `absence-entries.ts`, omdat het over precies hetzelfde gaat: hoe een aanvraag urenregels wordt.

---

## Task 1: De twee pure functies

**Files:**
- Modify: `src/lib/absence-entries.ts`
- Modify: `src/lib/absence-entries.test.ts`

**Interfaces:**
- Consumes: `workingDaysBetween` uit `src/lib/working-days.ts`; `scheduledHoursOn` en `type WeekSchedule` uit `src/lib/work-schedule.ts`.
- Produces:
  - `patternedEntries(pattern: WeekSchedule, days: string[]): Array<{ date: string; hours: number }>`
  - `patternSummary(pattern: WeekSchedule, from: string, to: string): { entries: Array<{ date: string; hours: number }>; total: number }`

`patternedEntries` krijgt de dagen aangereikt, omdat de goedkeuringsroute die al berekend heeft voor
zijn eigen controle. `patternSummary` doet het rekenwerk vanaf de datums en is wat het formulier en
de twee schrijfroutes nodig hebben.

- [ ] **Step 1: Write the failing test**

Voeg onderaan `src/lib/absence-entries.test.ts` toe:

```ts
import { patternedEntries, patternSummary } from "./absence-entries";

// Weekdagen, nagerekend tegen de kalender: 2026-08-03 en 2026-08-10 zijn
// maandagen, 2026-08-05 en 2026-08-12 woensdagen, 2026-08-07 en 2026-08-14
// vrijdagen, 2026-08-08 een zaterdag.
const WOENSDAG = { monday: 0, tuesday: 0, wednesday: 8, thursday: 0, friday: 0 };
const MA_WO = { monday: 4, tuesday: 0, wednesday: 4, thursday: 0, friday: 0 };
const NIETS = { monday: 0, tuesday: 0, wednesday: 0, thursday: 0, friday: 0 };
const WERKWEEK = ["2026-08-03", "2026-08-04", "2026-08-05", "2026-08-06", "2026-08-07"];

describe("patternedEntries", () => {
  it("keeps only the day the pattern names", () => {
    expect(patternedEntries(WOENSDAG, WERKWEEK)).toEqual([
      { date: "2026-08-05", hours: 8 },
    ]);
  });

  it("keeps every day the pattern names", () => {
    expect(patternedEntries(MA_WO, WERKWEEK)).toEqual([
      { date: "2026-08-03", hours: 4 },
      { date: "2026-08-05", hours: 4 },
    ]);
  });

  it("repeats across weeks", () => {
    const tweeWeken = [...WERKWEEK, "2026-08-10", "2026-08-11", "2026-08-12", "2026-08-13", "2026-08-14"];
    expect(patternedEntries(WOENSDAG, tweeWeken)).toEqual([
      { date: "2026-08-05", hours: 8 },
      { date: "2026-08-12", hours: 8 },
    ]);
  });

  it("drops a Saturday even when the pattern is not empty", () => {
    // Het patroon kent geen weekendvelden, dus scheduledHoursOn geeft daar 0.
    expect(patternedEntries(WOENSDAG, ["2026-08-08"])).toEqual([]);
  });

  it("returns nothing for an all-zero pattern", () => {
    expect(patternedEntries(NIETS, WERKWEEK)).toEqual([]);
  });

  it("returns nothing for an empty list of days", () => {
    expect(patternedEntries(WOENSDAG, [])).toEqual([]);
  });
});

describe("patternSummary", () => {
  it("counts one working week", () => {
    const { entries, total } = patternSummary(WOENSDAG, "2026-08-03", "2026-08-07");
    expect(entries).toEqual([{ date: "2026-08-05", hours: 8 }]);
    expect(total).toBe(8);
  });

  it("adds up the hours of every matching day", () => {
    const { entries, total } = patternSummary(MA_WO, "2026-08-03", "2026-08-14");
    expect(entries).toHaveLength(4);
    expect(total).toBe(16);
  });

  it("counts a full year of Wednesdays", () => {
    // De aanvraag uit de aanleiding. 11 januari 2026 is een zondag, dus de
    // eerste woensdag is de 14e. Nagerekend tegen de kalender: 52 dagen.
    const { entries, total } = patternSummary(WOENSDAG, "2026-01-11", "2027-01-10");
    expect(entries).toHaveLength(52);
    expect(total).toBe(416);
  });

  it("returns nothing when the period contains no matching day", () => {
    // Maandag tot en met dinsdag bevat geen woensdag.
    const { entries, total } = patternSummary(WOENSDAG, "2026-08-03", "2026-08-04");
    expect(entries).toEqual([]);
    expect(total).toBe(0);
  });

  it("does not leak floating-point noise into the total", () => {
    // 6.1 + 6.1 + 6.1 is 18.299999999999997 zonder afronding.
    //
    // Waarom juist deze waarde: kwartieren drijven nooit af, want 0.25 is
    // 2^-2 en dus exact in binair. Met de step="0.25" van het formulier is
    // deze afronding onbereikbaar — maar de route accepteert elk getal tussen
    // 0 en 24, en dáár komt hij vandaan. Een fixture van hele of kwartieruren
    // zou even hard slagen zonder de afronding en dus niets bewijzen.
    const zesEen = { monday: 0, tuesday: 0, wednesday: 6.1, thursday: 0, friday: 0 };
    // 2026-08-05, 2026-08-12 en 2026-08-19 zijn woensdagen.
    const { entries, total } = patternSummary(zesEen, "2026-08-03", "2026-08-21");
    expect(entries).toHaveLength(3);
    expect(total).toBe(18.3);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `source ~/.nvm/nvm.sh && nvm use 20 && npx vitest run src/lib/absence-entries.test.ts`
Expected: FAIL — `patternedEntries is not a function`, of een importfout.

- [ ] **Step 3: Write the implementation**

Voeg bovenaan `src/lib/absence-entries.ts` toe bij de imports:

```ts
import { workingDaysBetween } from "./working-days";
import { scheduledHoursOn, type WeekSchedule } from "./work-schedule";
```

Voeg onderaan datzelfde bestand toe:

```ts
/**
 * De urenregels die een weekpatroon oplevert over een gegeven reeks dagen.
 *
 * Dagen waarop het patroon nul staat vallen weg — een regel van nul uur is
 * ruis in de tijdlijn. Weekenddagen die per ongeluk in `days` zitten vallen
 * ook weg, want `scheduledHoursOn` kent geen weekendvelden en geeft daar 0.
 *
 * De dagen worden aangereikt in plaats van hier berekend, omdat de
 * goedkeuringsroute ze al bepaald heeft voor zijn eigen controle op een
 * periode zonder werkdagen.
 */
export function patternedEntries(
  pattern: WeekSchedule,
  days: string[],
): Array<{ date: string; hours: number }> {
  return days
    .map((date) => ({ date, hours: scheduledHoursOn(pattern, date) }))
    .filter((r) => r.hours > 0);
}

/**
 * Wat een patroon over een periode oplevert: de regels én het totaal.
 *
 * Dit is wat het formulier toont vóór het opslaan en wat de server als
 * `hours` wegschrijft. Dat het één functie is, is het punt: het getal dat de
 * gebruiker ziet en het getal dat wordt opgeslagen komen uit dezelfde
 * berekening en kunnen niet uiteenlopen.
 *
 * Het totaal wordt afgerond op twee decimalen omdat de uren `Decimal(4,2)`
 * zijn; een som van vier keer 6,4 landt onafgerond op 25.599999999999998.
 */
export function patternSummary(
  pattern: WeekSchedule,
  from: string,
  to: string,
): { entries: Array<{ date: string; hours: number }>; total: number } {
  const entries = patternedEntries(pattern, workingDaysBetween(from, to));
  const total = Math.round(entries.reduce((som, e) => som + e.hours, 0) * 100) / 100;
  return { entries, total };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `source ~/.nvm/nvm.sh && nvm use 20 && npx vitest run src/lib/absence-entries.test.ts`
Expected: PASS. Het bestand had 7 tests en heeft er nu 19.

- [ ] **Step 5: Controleer dat de afrondtest niet vacuous is**

Verwijder tijdelijk `Math.round(... * 100) / 100` uit `patternSummary` — laat er
`entries.reduce((som, e) => som + e.hours, 0)` staan — en draai het testbestand opnieuw.

Expected: de test `does not leak floating-point noise into the total` FAALT met
`expected 18.299999999999997 to be 18.3`. Zet de afronding daarna terug en controleer dat alles
weer slaagt.

Dit is geen formaliteit. In een eerder traject in deze repo stond een afrondtest waarvan het
gekozen getal toevallig exact uitkwam, waardoor hij even hard slaagde mét als zónder de afronding.
Plak beide runs in je rapport.

- [ ] **Step 6: Controleer de typen en de volledige suite**

Run: `source ~/.nvm/nvm.sh && nvm use 20 && npx tsc --noEmit`
Expected: 0 fouten.

Run: `source ~/.nvm/nvm.sh && nvm use 20 && npm test`
Expected: 22 bestanden, 230 tests, groen.

- [ ] **Step 7: Commit**

```bash
git add src/lib/absence-entries.ts src/lib/absence-entries.test.ts
git commit -m "feat: weekpatroon omzetten naar urenregels en een totaal"
```

---

## Task 2: Het datamodel

**Files:**
- Modify: `prisma/schema.prisma`

**Interfaces:**
- Produces: `model AbsencePattern` met `absenceRequestId` als `@id`, en `AbsenceRequest.pattern`.

**Deze taak levert geen unittests op.** Het is één modeldefinitie.

- [ ] **Step 1: Voeg het model toe**

Voeg in `prisma/schema.prisma` toe, direct ná `model AbsenceRequest { ... }`:

```prisma
model AbsencePattern {
  // absenceRequestId is meteen de sleutel: één patroon per aanvraag, of geen.
  // Vijf nullable kolommen op AbsenceRequest zouden "alle vijf leeg" niet van
  // "geen patroon" kunnen onderscheiden, en juist dat onderscheid draagt het
  // ontwerp — zonder rij gebeurt er exact wat er nu gebeurt.
  absenceRequestId String         @id
  absenceRequest   AbsenceRequest @relation(fields: [absenceRequestId], references: [id], onDelete: Cascade)
  // Verplicht en niet nullable: een dag leeg laten is dubbelzinnig. Nul is nul.
  // De vorm is gelijk aan WeekSchedule uit src/lib/work-schedule.ts, zodat
  // scheduledHoursOn, weekTotal en toWeekSchedule er ongewijzigd op werken.
  monday    Decimal @db.Decimal(4, 2)
  tuesday   Decimal @db.Decimal(4, 2)
  wednesday Decimal @db.Decimal(4, 2)
  thursday  Decimal @db.Decimal(4, 2)
  friday    Decimal @db.Decimal(4, 2)
}
```

In `model AbsenceRequest`, voeg toe bij de andere relatievelden (direct ná `timeEntries`):

```prisma
  pattern     AbsencePattern?
```

Bewust **geen** `createdAt`/`updatedAt` op dit model, anders dan bij de meeste modellen hier: het is
een strikt onderdeel van de aanvraag, die zijn eigen tijdstempels al draagt, en het patroon wordt
altijd samen met de aanvraag geschreven.

- [ ] **Step 2: Genereer de Prisma-client opnieuw**

Run: `source ~/.nvm/nvm.sh && nvm use 20 && DATABASE_URL="postgresql://x:x@localhost:5432/x" npx prisma generate`
Expected: `Generated Prisma Client`. Dit raakt geen database aan.

- [ ] **Step 3: Controleer de typen en de tests**

Run: `source ~/.nvm/nvm.sh && nvm use 20 && npx tsc --noEmit`
Expected: 0 fouten.

Run: `source ~/.nvm/nvm.sh && nvm use 20 && npm test`
Expected: 22 bestanden, 230 tests, groen.

- [ ] **Step 4: Commit**

```bash
git add prisma/schema.prisma
git commit -m "feat: AbsencePattern-tabel voor een weekpatroon per aanvraag"
```

---

## Task 3: Aanmaken en bijwerken van een aanvraag

**Files:**
- Modify: `src/app/api/absence-requests/route.ts`
- Modify: `src/app/api/absence-requests/[id]/route.ts` (alleen de medewerkerstak van `PUT`)

**Interfaces:**
- Consumes: `patternSummary` uit Task 1, `weekTotal` en `toWeekSchedule` uit `src/lib/work-schedule.ts`, het model uit Task 2.
- Produces: `pattern` als optioneel veld op `POST /api/absence-requests` en op de medewerkerstak van `PUT /api/absence-requests/[id]`; `pattern` in het antwoord van beide, en in de lijst van `GET`.

**Deze taak levert geen unittests op.** De rekenlogica zit in Task 1; wat hier bijkomt is
validatie en querycode.

- [ ] **Step 1: Deel het zod-schema voor het patroon**

Voeg in `src/app/api/absence-requests/route.ts` toe, direct vóór `const createSchema`:

```ts
const patternSchema = z.object({
  monday: z.number().min(0).max(24),
  tuesday: z.number().min(0).max(24),
  wednesday: z.number().min(0).max(24),
  thursday: z.number().min(0).max(24),
  friday: z.number().min(0).max(24),
});
```

Voeg in `createSchema` een veld toe, ná `description`:

```ts
  // null én ontbrekend betekenen allebei "geen patroon". Dat wijkt af van de
  // *Known-guard bij levelRates en memberIds, waar ontbrekend "niet aanraken"
  // betekent — die bestaat daar omdat meerdere schermen dezelfde route
  // aanroepen. Hier is het afwezigheidsdialoog de enige client, het laadt de
  // aanvraag altijd volledig inclusief patroon, en de goedkeuringstak loopt
  // door een andere vertakking. Ontbrekend kan hier alleen "vinkje uit" zijn.
  pattern: patternSchema.nullable().optional(),
```

Voeg bovenaan hetzelfde bestand toe bij de imports:

```ts
import { patternSummary } from "@/lib/absence-entries";
import { weekTotal, toWeekSchedule } from "@/lib/work-schedule";
```

- [ ] **Step 2: Leid het totaal af in `POST`**

In `POST` staat nu:

```ts
    const data = createSchema.parse(await req.json());
    const request = await prisma.absenceRequest.create({
      data: {
        userId,
        type: data.type,
        startDate: new Date(data.startDate),
        endDate: new Date(data.endDate),
        hours: data.hours,
        description: data.description ?? null,
      },
      include: {
        user: { select: { id: true, name: true } },
        reviewer: { select: { id: true, name: true } },
      },
    });
    return NextResponse.json({ ...request, hours: Number(request.hours) }, { status: 201 });
```

Vervang door:

```ts
    const data = createSchema.parse(await req.json());

    // Met een patroon bepaalt de server het totaal en negeert hij wat de
    // client stuurde. Mocht de client een getal mogen opgeven dat niet klopt
    // met wat er gegenereerd wordt, dan lopen het vakantiesaldo, de lijst en
    // de tijdlijn uit elkaar zonder dat iets klaagt.
    let hours = data.hours;
    if (data.pattern) {
      if (weekTotal(data.pattern) === 0) {
        return NextResponse.json(
          { error: "Een patroon van alleen nullen levert geen verlofdagen op" },
          { status: 400 },
        );
      }
      const { entries, total } = patternSummary(data.pattern, data.startDate, data.endDate);
      if (entries.length === 0) {
        return NextResponse.json(
          { error: "Deze periode bevat geen dagen die op het patroon passen" },
          { status: 400 },
        );
      }
      hours = total;
    }

    const request = await prisma.absenceRequest.create({
      data: {
        userId,
        type: data.type,
        startDate: new Date(data.startDate),
        endDate: new Date(data.endDate),
        hours,
        description: data.description ?? null,
        ...(data.pattern ? { pattern: { create: data.pattern } } : {}),
      },
      include: {
        user: { select: { id: true, name: true } },
        reviewer: { select: { id: true, name: true } },
        pattern: true,
      },
    });
    return NextResponse.json(
      { ...request, hours: Number(request.hours), pattern: toWeekSchedule(request.pattern) },
      { status: 201 },
    );
```

- [ ] **Step 3: Geef het patroon mee in de lijst**

In `GET` in datzelfde bestand staat:

```ts
      include: {
        user: { select: { id: true, name: true } },
        reviewer: { select: { id: true, name: true } },
      },
      orderBy: { startDate: "desc" },
    });
```

Wijzig de `include` naar:

```ts
      include: {
        user: { select: { id: true, name: true } },
        reviewer: { select: { id: true, name: true } },
        pattern: true,
      },
      orderBy: { startDate: "desc" },
    });
```

En wijzig de regel eronder:

```ts
    return NextResponse.json(requests.map((r) => ({ ...r, hours: Number(r.hours) })));
```

naar:

```ts
    return NextResponse.json(
      requests.map((r) => ({ ...r, hours: Number(r.hours), pattern: toWeekSchedule(r.pattern) })),
    );
```

- [ ] **Step 4: Doe hetzelfde in de medewerkerstak van `PUT`**

In `src/app/api/absence-requests/[id]/route.ts`, voeg toe bij de imports:

```ts
import { patternSummary } from "@/lib/absence-entries";
import { weekTotal, toWeekSchedule } from "@/lib/work-schedule";
```

`patternSummary` komt uit hetzelfde bestand als het al geïmporteerde `ABSENCE_PROJECT_NAMES`;
combineer die imports in plaats van een tweede regel toe te voegen.

Voeg in `employeeUpdateSchema` toe, ná `description`:

```ts
  pattern: z.object({
    monday: z.number().min(0).max(24),
    tuesday: z.number().min(0).max(24),
    wednesday: z.number().min(0).max(24),
    thursday: z.number().min(0).max(24),
    friday: z.number().min(0).max(24),
  }).nullable().optional(),
```

Vervang het blok dat nu op `const data = employeeUpdateSchema.parse(body);` volgt:

```ts
    const data = employeeUpdateSchema.parse(body);
    const updated = await prisma.absenceRequest.update({
      where: { id },
      data: {
        ...(data.type ? { type: data.type } : {}),
        startDate: new Date(data.startDate),
        endDate: new Date(data.endDate),
        hours: data.hours,
        description: data.description ?? null,
      },
      include: {
        user: { select: { id: true, name: true } },
        reviewer: { select: { id: true, name: true } },
      },
    });
    return NextResponse.json({ ...updated, hours: Number(updated.hours) });
```

door:

```ts
    const data = employeeUpdateSchema.parse(body);

    let hours = data.hours;
    if (data.pattern) {
      if (weekTotal(data.pattern) === 0) {
        return NextResponse.json(
          { error: "Een patroon van alleen nullen levert geen verlofdagen op" },
          { status: 400 },
        );
      }
      const { entries, total } = patternSummary(data.pattern, data.startDate, data.endDate);
      if (entries.length === 0) {
        return NextResponse.json(
          { error: "Deze periode bevat geen dagen die op het patroon passen" },
          { status: 400 },
        );
      }
      hours = total;
    }

    const updated = await prisma.$transaction(async (tx) => {
      // Het patroon eerst wegschrijven en pas daarna de aanvraag bijwerken, zodat
      // de include op de update het NIEUWE patroon teruggeeft en niet het oude.
      // Verwijderen-en-opnieuw-maken: geen patroon in de body betekent dat een
      // bestaand patroon verdwijnt.
      await tx.absencePattern.deleteMany({ where: { absenceRequestId: id } });
      if (data.pattern) {
        await tx.absencePattern.create({ data: { absenceRequestId: id, ...data.pattern } });
      }
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
    return NextResponse.json({
      ...updated,
      hours: Number(updated.hours),
      pattern: toWeekSchedule(updated.pattern),
    });
```

- [ ] **Step 5: Controleer dat de admintak ongemoeid is**

Run: `git diff "src/app/api/absence-requests/[id]/route.ts"`

Stel met eigen ogen vast dat het blok onder `if (isAdmin(role) && "status" in body)` niet is
gewijzigd. Goedkeuren en afkeuren raken het patroon niet aan; dat is Task 4.

- [ ] **Step 6: Controleer de typen en de tests**

Run: `source ~/.nvm/nvm.sh && nvm use 20 && npx tsc --noEmit`
Expected: 0 fouten.

Run: `source ~/.nvm/nvm.sh && nvm use 20 && npm test`
Expected: 22 bestanden, 230 tests, groen.

- [ ] **Step 7: Commit**

```bash
git add src/app/api/absence-requests/route.ts "src/app/api/absence-requests/[id]/route.ts"
git commit -m "feat: aanvraag kan een weekpatroon dragen, totaal wordt afgeleid"
```

---

## Task 4: Goedkeuring gebruikt het patroon

**Files:**
- Modify: `src/app/api/absence-requests/[id]/route.ts` (alleen de admintak van `PUT`)

**Interfaces:**
- Consumes: `patternedEntries` uit Task 1, `toWeekSchedule` uit `src/lib/work-schedule.ts`, het model uit Task 2.

**Deze taak levert geen unittests op.** De rekenlogica zit in Task 1.

- [ ] **Step 1: Laad het patroon mee**

In `PUT` staat bovenaan:

```ts
    const existing = await prisma.absenceRequest.findUnique({ where: { id } });
```

Wijzig naar:

```ts
    const existing = await prisma.absenceRequest.findUnique({
      where: { id },
      include: { pattern: true },
    });
```

- [ ] **Step 2: Kies de generatie**

Voeg bovenaan het bestand `patternedEntries` toe aan de bestaande import uit
`@/lib/absence-entries`.

In de admintak staat nu:

```ts
        const dagen = workingDaysBetween(
          existing.startDate.toISOString().slice(0, 10),
          existing.endDate.toISOString().slice(0, 10),
        );
        if (dagen.length === 0) {
          return NextResponse.json({ error: "Deze periode bevat geen werkdagen" }, { status: 400 });
        }
        regels = splitHoursOverDays(Number(existing.hours), dagen);
```

Vervang door:

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

- [ ] **Step 3: Controleer dat een aanvraag zonder patroon niets merkt**

Run: `git diff "src/app/api/absence-requests/[id]/route.ts"`

Stel vast dat `toWeekSchedule(existing.pattern)` `null` geeft wanneer er geen patroonrij is, en dat
de `splitHoursOverDays`-tak dan letterlijk de oude expressie is. Stel ook vast dat de nieuwe
`regels.length === 0`-controle voor een aanvraag zónder patroon nooit kan afgaan: `dagen` is dan
niet leeg, en `splitHoursOverDays` geeft één regel per dag. Meld in je rapport wat je vaststelde.

- [ ] **Step 4: Controleer de typen en de tests**

Run: `source ~/.nvm/nvm.sh && nvm use 20 && npx tsc --noEmit`
Expected: 0 fouten.

Run: `source ~/.nvm/nvm.sh && nvm use 20 && npm test`
Expected: 22 bestanden, 230 tests, groen.

- [ ] **Step 5: Commit**

```bash
git add "src/app/api/absence-requests/[id]/route.ts"
git commit -m "feat: goedkeuring genereert de dagen die op het patroon passen"
```

---

## Task 5: Het formulier

**Files:**
- Modify: `src/components/vacation/absence-client.tsx`

**Interfaces:**
- Consumes: `patternSummary` uit Task 1; het `pattern`-veld op de API uit Task 3.

**Deze taak levert geen unittests op.** Het is formuliertoestand in een clientcomponent; de repo
heeft geen componenttests.

- [ ] **Step 1: Voeg de imports en de constanten toe**

Bovenaan `src/components/vacation/absence-client.tsx`, bij de imports:

```tsx
import { patternSummary } from "@/lib/absence-entries";
import type { WeekSchedule } from "@/lib/work-schedule";
```

En onder de bestaande constanten in dat bestand:

```tsx
const LEEG_PATROON: WeekSchedule = { monday: 0, tuesday: 0, wednesday: 0, thursday: 0, friday: 0 };

const PATROON_VELDEN: Array<{ key: keyof WeekSchedule; label: string }> = [
  { key: "monday", label: "Ma" },
  { key: "tuesday", label: "Di" },
  { key: "wednesday", label: "Wo" },
  { key: "thursday", label: "Do" },
  { key: "friday", label: "Vr" },
];
```

- [ ] **Step 2: Voeg de toestand toe**

Zoek in de component de plek waar `editingRequest` met `useState` gedeclareerd wordt, en voeg
daaronder toe:

```tsx
  const [herhaald, setHerhaald] = useState(false);
  const [patroon, setPatroon] = useState<WeekSchedule>(LEEG_PATROON);
```

Voeg ook toe aan de `AbsenceRequest`-interface in dit bestand, ná het `hours`-veld:

```tsx
  pattern: WeekSchedule | null;
```

- [ ] **Step 3: Zet de bestaande urenberekening uit zodra er een patroon is**

Er staat een `useEffect` die het urentotaal berekent:

```tsx
  useEffect(() => {
    if (!watchedStart || !watchedEnd) return;
    const calculated = countWorkingHours(watchedStart, watchedEnd, weeklyHours);
    if (calculated > 0) requestForm.setValue("hours", calculated, { shouldValidate: false });
  }, [watchedStart, watchedEnd, weeklyHours, requestForm]);
```

Vervang door:

```tsx
  useEffect(() => {
    // Met een patroon leidt de server het totaal af; deze berekening zou dat
    // getal overschrijven zodra je een datum aanraakt.
    if (herhaald) return;
    if (!watchedStart || !watchedEnd) return;
    const calculated = countWorkingHours(watchedStart, watchedEnd, weeklyHours);
    if (calculated > 0) requestForm.setValue("hours", calculated, { shouldValidate: false });
  }, [herhaald, watchedStart, watchedEnd, weeklyHours, requestForm]);
```

- [ ] **Step 4: Vul de toestand bij het openen van het dialoog**

In `openRequestDialog` staat:

```tsx
    if (req) {
      setEditingRequest(req);
      requestForm.reset({
        type: req.type,
        startDate: req.startDate.slice(0, 10),
        endDate: req.endDate.slice(0, 10),
        hours: req.hours,
        description: req.description ?? "",
      });
    } else {
      setEditingRequest(null);
      requestForm.reset({ type: "VACATION", startDate: "", endDate: "", hours: "" as any, description: "" });
    }
```

Vervang door:

```tsx
    if (req) {
      setEditingRequest(req);
      requestForm.reset({
        type: req.type,
        startDate: req.startDate.slice(0, 10),
        endDate: req.endDate.slice(0, 10),
        hours: req.hours,
        description: req.description ?? "",
      });
      setHerhaald(req.pattern !== null);
      setPatroon(req.pattern ?? LEEG_PATROON);
    } else {
      setEditingRequest(null);
      requestForm.reset({ type: "VACATION", startDate: "", endDate: "", hours: "" as any, description: "" });
      setHerhaald(false);
      setPatroon(LEEG_PATROON);
    }
```

- [ ] **Step 5: Stuur het patroon mee**

In `submitRequest` staat:

```tsx
    const res = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(values) });
```

Vervang door:

```tsx
    const res = await fetch(url, {
      method,
      headers: { "Content-Type": "application/json" },
      // Altijd expliciet: null betekent "geen patroon", en dat is wat het
      // uitgezette vinkje bedoelt.
      body: JSON.stringify({ ...values, pattern: herhaald ? patroon : null }),
    });
```

- [ ] **Step 6: Voeg het vinkje, de velden en de samenvatting toe**

Rond regel 561 staat het urenveld van het aanvraagdialoog:

```tsx
              <Input id="hours" type="number" step="0.5" min="0.5" {...requestForm.register("hours")} />
```

Voeg **direct ná het omhullende `div` van dat veld** toe:

```tsx
            <div className="space-y-2 sm:col-span-2">
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <input
                  type="checkbox"
                  className="h-4 w-4 rounded border-input accent-primary"
                  checked={herhaald}
                  onChange={(e) => setHerhaald(e.target.checked)}
                />
                Herhaald per week
              </label>

              {herhaald && (
                <>
                  <div className="flex flex-wrap gap-3">
                    {PATROON_VELDEN.map((v) => (
                      <div key={v.key} className="space-y-1">
                        <Label>{v.label}</Label>
                        <Input
                          type="number"
                          step="0.25"
                          min="0"
                          max="24"
                          className="w-20"
                          value={patroon[v.key]}
                          onChange={(e) =>
                            setPatroon((prev) => ({ ...prev, [v.key]: Number(e.target.value) || 0 }))
                          }
                        />
                      </div>
                    ))}
                  </div>
                  <p className="text-sm text-muted-foreground">
                    {patroonSamenvatting}
                  </p>
                </>
              )}
            </div>
```

Voeg de samenvatting toe bij de andere afgeleide waarden, vóór de `return` van de component:

```tsx
  // Berekend met exact dezelfde functie als de server gebruikt, zodat het
  // getal dat je ziet het getal is dat je krijgt.
  const patroonSamenvatting = (() => {
    if (!herhaald || !watchedStart || !watchedEnd) return "Vul een periode en de uren per dag in.";
    const { entries, total } = patternSummary(patroon, watchedStart, watchedEnd);
    if (entries.length === 0) return "Deze periode bevat geen dagen die op het patroon passen.";
    return `${entries.length} dagen, ${total.toFixed(2)} uur in totaal`;
  })();
```

- [ ] **Step 7: Controleer de typen en de tests**

Run: `source ~/.nvm/nvm.sh && nvm use 20 && npx tsc --noEmit`
Expected: 0 fouten. Klaagt hij dat `pattern` niet op het `AbsenceRequest`-type bestaat, dan is
Step 2's toevoeging aan die interface overgeslagen.

Run: `source ~/.nvm/nvm.sh && nvm use 20 && npm test`
Expected: 22 bestanden, 230 tests, groen.

- [ ] **Step 8: Controleer dat het vinkje uit niets verandert**

Run: `git diff src/components/vacation/absence-client.tsx`

Loop de diff langs en stel per wijziging vast wat er gebeurt met `herhaald === false`. De
urenberekening moet dan draaien zoals hij nu draait, `pattern: null` gaat mee in het verzoek, en de
vijf velden en de samenvatting worden niet gerenderd. Meld in je rapport wat je vaststelde.

- [ ] **Step 9: Commit**

```bash
git add src/components/vacation/absence-client.tsx
git commit -m "feat: weekpatroon instellen op het aanvraagformulier"
```

---

## Uitrol

**Door een mens, met de database.**

1. `prisma migrate diff` draaien en de **volledige** lijst lezen. Er hoort alleen één tabel bij te
   komen. Verdwijnt er een kolom, stop dan — bij de batch met werkniveaus verdween er onverwacht
   een kolom die niemand had gecontroleerd.
2. `npm run db:push`.
3. Deployen.

Geen backfill, niets wordt verwijderd. De 7 bestaande aanvragen hebben geen patroon en gedragen zich
ongewijzigd. Zolang niemand het vinkje aanzet verandert er niets.

Handmatig na te lopen na de deploy:

- [ ] Een gewone aanvraag zonder vinkje: het formulier, het berekende totaal en de gegenereerde regels zijn onveranderd.
- [ ] Elke woensdag 8 uur van 11 januari 2026 tot 10 januari 2027 → het scherm meldt **52 dagen en 416,00 uur** vóór het opslaan. Die twee getallen zijn nagerekend tegen de kalender; wijkt het scherm ervan af, dan klopt de telling niet. 11 januari 2026 is een zondag, dus de eerste woensdag is de 14e.
- [ ] Die aanvraag opslaan → de lijst toont 416 uur.
- [ ] Goedkeuren → 52 urenregels in `/time`, allemaal op woensdag, allemaal 8 uur, allemaal op Ouderschapsverlof.
- [ ] Afkeuren → alle 52 verdwijnen.
- [ ] Het patroon wijzigen naar maandag en woensdag en opnieuw goedkeuren → de regels schuiven mee zonder dubbelingen.
- [ ] Een patroon van alleen nullen opslaan → `Een patroon van alleen nullen levert geen verlofdagen op`.
- [ ] Een periode van maandag tot dinsdag met een woensdagpatroon → `Deze periode bevat geen dagen die op het patroon passen`, al bij het opslaan.
- [ ] Het vinkje uitzetten bij een bestaande patroonaanvraag en opslaan → het patroon verdwijnt en het totaal is weer met de hand in te vullen.
- [ ] Een patroonaanvraag van het type Vakantie → het afgeleide totaal gaat van het saldo af.
- [ ] Een verlofregel uit een patroonaanvraag proberen te bewerken in `/time` → nog steeds geweigerd.
