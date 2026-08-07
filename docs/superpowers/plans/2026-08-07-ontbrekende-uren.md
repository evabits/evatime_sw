# Ontbrekende uren in de standup — implementatieplan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** De standup laat zien wie er uren mist en waar iemand het laatst aan
werkte, en het dashboard waarschuwt de standupleider daarover vóór de
bijeenkomst.

**Architecture:** Eén pure functie `missingHours` in `src/lib/work-schedule.ts`
draagt de hele beslissing; het standupscherm en de dashboardkaart rekenen er
allebei mee. De API krijgt er per lid één veld bij (`lastWorked`), berekend met
twee extra query's. Het dashboard telt via één async helper in
`src/lib/missing-hours.ts`.

**Tech Stack:** Next.js 16 App Router, React 19, Prisma 6 + PostgreSQL,
Tailwind CSS 4, vitest.

**Spec:** `docs/superpowers/specs/2026-08-07-ontbrekende-uren-design.md`

## Global Constraints

- Geen migratie en geen schemawijziging. Raak `prisma/schema.prisma` niet aan.
- Testconventie van deze repo: **uitsluitend pure functies**, in
  `src/lib/*.test.ts`. Schrijf geen component- of API-tests. Er bestaat geen
  testopzet voor React of route handlers en die komt hier ook niet.
- Al het datumrekenwerk in UTC, met `YYYY-MM-DD` in en uit. Gebruik
  `getUTCDay()`/`toISOString()`, nooit `getDay()`/`getDate()`. De server draait
  UTC, de gebruikers zitten in Amsterdam.
- Prisma `Decimal` komt binnen als string of Decimal-object. Elke `hours`-waarde
  die je optelt gaat eerst door `Number()`.
- Alle gebruikerszichtbare tekst is Nederlands. De exacte strings staan in de
  taken; neem ze letterlijk over.
- Wie geen weekrooster heeft (`workSchedule` is `null`) telt nergens mee en
  krijgt geen markering. Dat is een bewuste keuze uit de spec, geen omissie.
- Een afwezigheid wint altijd: wie verlof of ziekte heeft mist per definitie
  geen uren.
- Commit per taak, met een Nederlandse commitboodschap in de stijl van
  `git log` (`feat: …`, `fix: …`).
- Draai `npx vitest run` en `npx tsc --noEmit` voordat je een taak afmeldt.
  Beide moeten schoon zijn.

---

### Task 1: De pure functie `missingHours`

Het rekenhart. Hij komt in `src/lib/work-schedule.ts` te staan, naast
`scheduledHoursOn`, omdat hij precies dezelfde vraag beantwoordt vanuit de
andere kant: niet "wat zou hij werken" maar "wat ontbreekt er".

**Files:**
- Modify: `src/lib/work-schedule.ts` (toevoegen aan het eind)
- Test: `src/lib/work-schedule.test.ts` (nieuw `describe`-blok toevoegen)

**Interfaces:**
- Consumes: de bestaande, niet-geëxporteerde helper `rond(n: number): number`
  bovenin `src/lib/work-schedule.ts`.
- Produces: `missingHours(scheduled: number | null, booked: number, absent: boolean): number`
  — gebruikt door Task 3 (standupscherm) en Task 4 (dashboardteller).

- [ ] **Step 1: Schrijf de falende tests**

Voeg dit blok toe onderaan `src/lib/work-schedule.test.ts`, en zet
`missingHours` erbij in de bestaande `import`-regel bovenin:

```ts
describe("missingHours", () => {
  it("geeft nul voor wie afwezig is, ook zonder geboekte uren", () => {
    expect(missingHours(8, 0, true)).toBe(0);
  });

  it("geeft nul op een vaste vrije dag", () => {
    expect(missingHours(0, 0, false)).toBe(0);
  });

  it("geeft nul zonder weekrooster", () => {
    // Zes van de veertien medewerkers hebben er geen; die blijven bewust
    // buiten elke telling.
    expect(missingHours(null, 0, false)).toBe(0);
  });

  it("geeft nul wanneer precies genoeg geboekt is", () => {
    expect(missingHours(8, 8, false)).toBe(0);
  });

  it("geeft nul wanneer er meer geboekt is dan gepland", () => {
    expect(missingHours(8, 9.5, false)).toBe(0);
  });

  it("geeft het hele rooster wanneer er niets geboekt is", () => {
    expect(missingHours(8, 0, false)).toBe(8);
  });

  it("geeft het verschil bij een gedeeltelijke boeking", () => {
    expect(missingHours(8, 4, false)).toBe(4);
  });

  it("rondt het verschil af op twee decimalen", () => {
    // Decimal(4,2)-sommen landen net naast een rond getal; zonder afronding
    // zou hier 0.7999999999999998 uit komen.
    expect(missingHours(6.4, 5.6, false)).toBe(0.8);
  });
});
```

- [ ] **Step 2: Draai de tests en zie ze falen**

Run: `npx vitest run src/lib/work-schedule.test.ts`
Expected: FAIL — `missingHours is not a function` (of een importfout).

- [ ] **Step 3: Schrijf de implementatie**

Toevoegen onderaan `src/lib/work-schedule.ts`:

```ts
/**
 * Hoeveel uur er op een dag ontbreekt ten opzichte van het weekrooster.
 *
 * Nul betekent "niets aan de hand", en dat is bewust ook de uitkomst in de
 * gevallen waarin de vraag niet te beantwoorden is. Zo hoeft geen enkele
 * aanroeper de randgevallen zelf nog uit elkaar te houden:
 *
 * - afwezig: verlof of ziekte is geen vergeten boeking;
 * - `scheduled` nul: vaste vrije dag, die hoort leeg te zijn;
 * - `scheduled` null: geen weekrooster, er is niets om tegen af te zetten;
 * - genoeg of meer geboekt: klaar.
 *
 * Onvolledig telt als ontbrekend: wie vier van zijn acht uur boekte mist er
 * vier. Alleen op nul kijken zou de halve dag stil laten passeren.
 */
export function missingHours(
  scheduled: number | null,
  booked: number,
  absent: boolean,
): number {
  if (absent || scheduled === null || scheduled <= 0) return 0;
  return Math.max(0, rond(scheduled - booked));
}
```

- [ ] **Step 4: Draai de tests en zie ze slagen**

Run: `npx vitest run src/lib/work-schedule.test.ts`
Expected: PASS, alle tests in het bestand.

- [ ] **Step 5: Typecontrole**

Run: `npx tsc --noEmit`
Expected: geen fouten.

- [ ] **Step 6: Commit**

```bash
git add src/lib/work-schedule.ts src/lib/work-schedule.test.ts
git commit -m "feat: missingHours berekent het urentekort van een dag"
```

---

### Task 2: `lastWorked` in de standup-API

Het scherm moet kunnen tonen waar iemand het laatst aan werkte wanneer de
getoonde dag leeg is. Dat is een opzoeking terug in de tijd, onbegrensd: een
lange afwezigheid levert een oude datum op en dat is nog steeds het juiste
antwoord.

**Files:**
- Modify: `src/app/api/standup/route.ts`

**Interfaces:**
- Produces: elk lid in de JSON-respons krijgt er één veld bij:
  ```ts
  lastWorked: {
    date: string;                 // YYYY-MM-DD
    entries: Array<{ hours: number; project: string; customer: string | null; description: string | null }>;
  } | null
  ```
  De vorm van `entries` is identiek aan het bestaande veld `entries` op hetzelfde
  lid. Task 3 leest dit veld.

- [ ] **Step 1: Geef de vorm van een urenregel een naam**

Die vorm wordt straks op twee plekken gebruikt. Voeg bovenin het bestand toe,
ná de imports en naast `ABSENCE_LABELS`:

```ts
type StandupEntry = {
  hours: number;
  project: string;
  customer: string | null;
  description: string | null;
};
```

Vervang de bestaande regel

```ts
    const urenPer = new Map<string, { hours: number; project: string; customer: string | null; description: string | null }[]>();
```

door

```ts
    const urenPer = new Map<string, StandupEntry[]>();
```

- [ ] **Step 2: Zoek de laatste werkdag per lid op**

Voeg dit toe ná de bestaande `for (const e of entries)`-lus die `urenPer` vult
(rond regel 80), en vóór de `return NextResponse.json({...})`:

```ts
    // Alleen voor wie op de getoonde dag niets boekte: bij de rest is deze
    // regel op het scherm toch ruis, en dan hoeft de database er ook niet naar
    // te zoeken.
    const zonderUren = users.filter((u) => !urenPer.has(u.id)).map((u) => u.id);

    // Twee query's, geen N+1: eerst per persoon de laatste dag mét uren vóór de
    // getoonde dag, daarna de regels van precies die dagen. Onbegrensd terug in
    // de tijd — na drie weken vakantie is drie weken geleden het juiste antwoord
    // op "waar was je mee bezig".
    const laatsteDagen = zonderUren.length
      ? await prisma.timeEntry.groupBy({
          by: ["userId"],
          where: { userId: { in: zonderUren }, date: { lt: dag } },
          _max: { date: true },
        })
      : [];

    const laatsteRegels = laatsteDagen.length
      ? await prisma.timeEntry.findMany({
          where: {
            OR: laatsteDagen.map((g) => ({ userId: g.userId, date: g._max.date! })),
          },
          orderBy: { createdAt: "asc" },
          select: {
            userId: true,
            hours: true,
            description: true,
            project: { select: { name: true, customer: { select: { name: true } } } },
          },
        })
      : [];

    const laatstePer = new Map(
      laatsteDagen.map((g) => [
        g.userId,
        { date: g._max.date!.toISOString().slice(0, 10), entries: [] as StandupEntry[] },
      ]),
    );
    for (const e of laatsteRegels) {
      laatstePer.get(e.userId)?.entries.push({
        hours: Number(e.hours),
        project: e.project.name,
        customer: e.project.customer?.name ?? null,
        description: e.description,
      });
    }
```

- [ ] **Step 3: Geef het veld mee in de respons**

In de `members.map((u) => {...})` aan het eind, voeg één regel toe aan het
teruggegeven object, direct ná `entries`:

```ts
          lastWorked: laatstePer.get(u.id) ?? null,
```

- [ ] **Step 4: Typecontrole**

Run: `npx tsc --noEmit`
Expected: geen fouten.

Let op `g._max.date!`: `groupBy` typeert `_max.date` als `Date | null`, maar een
groep bestaat alleen wanneer er rijen zijn en `date` is verplicht in het schema,
dus de waarde is er altijd. De `!` is hier correct en heeft geen alternatief dat
minder ruis geeft.

- [ ] **Step 5: Draai de hele testsuite**

Run: `npx vitest run`
Expected: PASS. Dit bestand heeft geen eigen tests (routes vallen buiten de
testconventie); de suite moet alleen niet stukgaan.

- [ ] **Step 6: Commit**

```bash
git add src/app/api/standup/route.ts
git commit -m "feat: standup-API geeft de laatste dag met uren per medewerker"
```

---

### Task 3: Het standupscherm

Twee zichtbare toevoegingen: een markering `mist <uren>` naast de naam, en
onder een lege dag de regel `laatst gewerkt: <datum>` met de urenregels van die
dag.

**Files:**
- Modify: `src/components/standup/standup-client.tsx`

**Interfaces:**
- Consumes: `missingHours` uit Task 1, en het veld `lastWorked` uit Task 2.
- Produces: niets voor latere taken.

- [ ] **Step 1: Breid de types uit en importeer wat je nodig hebt**

Voeg toe aan de importregels bovenin:

```ts
import { missingHours } from "@/lib/work-schedule";
```

Breid `interface Member` uit met één veld, direct ná `entries`:

```ts
  lastWorked: { date: string; entries: Entry[] } | null;
```

- [ ] **Step 2: Trek de urenlijst uit de kaart**

De lijst met urenregels wordt op twee plekken getoond — de gewone dag en de
laatste werkdag. Zet hem daarom als los onderdeel bovenin het bestand neer, ná
de bestaande `weekdag`-functie:

```tsx
function EntryList({ entries }: { entries: Entry[] }) {
  return (
    <ul className="space-y-0.5">
      {entries.map((e, i) => (
        <li key={i}>
          <span className="tabular-nums font-medium">{formatHours(e.hours)}</span>{" "}
          {e.customer ? `${e.customer} / ` : ""}{e.project}
          {e.description ? ` — ${e.description}` : ""}
        </li>
      ))}
    </ul>
  );
}
```

Vervang in de kaart het bestaande `<ul className="space-y-0.5">…</ul>`-blok
(de tak achter `) : (` in de `m.entries.length === 0`-voorwaarde) door:

```tsx
                <EntryList entries={m.entries} />
```

- [ ] **Step 3: Voeg een korte datumnotatie toe**

Naast de bestaande `nl`- en `weekdag`-functies bovenin:

```tsx
// Kort, want deze datum staat midden in een regel en niet in een kop:
// "vr 3 aug" in plaats van "vrijdag 3 augustus".
function kortNl(d: string) {
  return new Date(`${d}T00:00:00Z`).toLocaleDateString("nl-NL", {
    weekday: "short",
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  });
}
```

- [ ] **Step 4: Bereken het tekort en toon de markering**

In de `zichtbareLeden.map((m) => (`-lus is het eerste kind van `<CardContent>`
een `<div className="flex items-center gap-2">`. Zet vlak vóór de `return` van
die map — dus door de arrow-body van `(m) => (` te veranderen in `(m) => {` met
een expliciete `return (` — deze twee regels neer:

```tsx
          const geboekt = m.entries.reduce((som, e) => som + e.hours, 0);
          const mist = missingHours(m.scheduledHours, geboekt, !!m.absence);
```

Vergeet de afsluitende `);` en `}` van de map niet aan te passen: het blok
eindigt straks op `); })}` in plaats van `))}`.

Voeg in die `flex`-div een markering toe, direct ná de bestaande
`{m.absence && <Badge …>}`-regel:

```tsx
              {mist > 0 && (
                <Badge variant="outline" className="border-amber-500/60 text-amber-700 dark:text-amber-400">
                  mist {formatHours(mist)}
                </Badge>
              )}
```

- [ ] **Step 5: Toon de laatste werkdag onder een lege dag**

Direct ná de `<div className="text-sm">…</div>` die de urenregels bevat, en
vóór het `{m.previousNote && …}`-blok:

```tsx
            {m.entries.length === 0 && m.lastWorked && (
              <div className="text-sm text-muted-foreground">
                <p className="text-xs">laatst gewerkt: {kortNl(m.lastWorked.date)}</p>
                <EntryList entries={m.lastWorked.entries} />
              </div>
            )}
```

- [ ] **Step 6: Typecontrole**

Run: `npx tsc --noEmit`
Expected: geen fouten.

Let op de valkuil die dit bestand eerder al opleverde: `data` wordt binnen de
map gebruikt (`weekdag(data.previousWorkingDay)`) en TypeScript verliest die
narrowing zodra je de vorm van het blok verandert. De bestaande
`{data && zichtbareLeden.map(…)}` moet blijven staan.

- [ ] **Step 7: Draai de hele testsuite**

Run: `npx vitest run`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add src/components/standup/standup-client.tsx
git commit -m "feat: standup toont ontbrekende uren en de laatste werkdag"
```

---

### Task 4: De dashboardkaart

De teamleider ziet 's ochtends al dat er uren ontbreken, zodat hij mensen kan
laten bijboeken vóór de standup begint.

**Files:**
- Create: `src/lib/missing-hours.ts`
- Modify: `src/app/(app)/page.tsx`

**Interfaces:**
- Consumes: `missingHours`, `scheduledHoursOn`, `toWeekSchedule` uit
  `src/lib/work-schedule.ts` (Task 1 en bestaand); `previousWorkingDay` uit
  `src/lib/working-days.ts`; `canLeadStandup` uit `src/lib/roles.ts`.
- Produces: `countMissingHours(date: string): Promise<number>`.

- [ ] **Step 1: Schrijf de telfunctie**

Nieuw bestand `src/lib/missing-hours.ts`:

```ts
import { prisma } from "./prisma";
import { missingHours, scheduledHoursOn, toWeekSchedule } from "./work-schedule";

/**
 * Hoeveel medewerkers er op een dag uren missen.
 *
 * Staat los van de standup-API omdat het dashboard alleen het getal nodig heeft
 * en niet de hele dagopbouw per persoon. De beslissing zelf komt uit dezelfde
 * `missingHours`, zodat de kaart en het scherm het niet oneens kunnen worden
 * over wie er tekortkomt.
 *
 * Wie geen weekrooster heeft valt er vanzelf uit: `toWeekSchedule` geeft dan
 * null en `missingHours` geeft nul. Er wordt daarom niet op gefilterd in de
 * query — dat zou dezelfde regel op twee plekken zetten.
 */
export async function countMissingHours(date: string): Promise<number> {
  const dag = new Date(`${date}T00:00:00Z`);

  const [users, geboekt, afwezigen] = await Promise.all([
    prisma.user.findMany({
      where: { archivedAt: null },
      select: { id: true, workSchedule: true },
    }),
    prisma.timeEntry.groupBy({
      by: ["userId"],
      where: { date: dag },
      _sum: { hours: true },
    }),
    prisma.absenceRequest.findMany({
      where: { status: "APPROVED", startDate: { lte: dag }, endDate: { gte: dag } },
      select: { userId: true },
    }),
  ]);

  const urenPer = new Map(geboekt.map((g) => [g.userId, Number(g._sum.hours ?? 0)]));
  const afwezig = new Set(afwezigen.map((a) => a.userId));

  return users.filter((u) => {
    const rooster = toWeekSchedule(u.workSchedule);
    const gepland = rooster ? scheduledHoursOn(rooster, date) : null;
    return missingHours(gepland, urenPer.get(u.id) ?? 0, afwezig.has(u.id)) > 0;
  }).length;
}
```

- [ ] **Step 2: Haal het getal op in het dashboard**

In `src/app/(app)/page.tsx`, bij de imports:

```ts
import { startOfMonth, endOfMonth, format } from "date-fns";
import { canLeadStandup } from "@/lib/roles";
import { previousWorkingDay } from "@/lib/working-days";
import { countMissingHours } from "@/lib/missing-hours";
```

(`startOfMonth, endOfMonth` staan er al — voeg `format` toe aan die regel.)

Voeg ná `const isAdmin = role === "ADMIN";` toe:

```ts
  // Niet isAdmin: de teamleider leidt de standup en moet deze waarschuwing
  // juist zien.
  const magStandup = canLeadStandup(role);
  // Dezelfde dag als de standup meet: de vorige werkdag ten opzichte van nu.
  const standupDag = previousWorkingDay(format(now, "yyyy-MM-dd"));
```

Voeg een element toe aan de destructurering van de `Promise.all` — achteraan,
ná `customerlessProjects`:

```ts
  const [timeStats, kmStats, projectStats, recentTime, recentKm, vacationBudget, vacationApproved, upcomingVacations, pendingVacations, customerlessProjects, missendeUren] = await Promise.all([
```

en als laatste element in de array, ná de `customerlessProjects`-query:

```ts
    magStandup ? countMissingHours(standupDag) : Promise.resolve(0),
```

- [ ] **Step 3: Zet de kaart op het scherm**

Direct ná het bestaande `{isAdmin && customerlessProjects > 0 && (…)}`-blok:

```tsx
      {magStandup && missendeUren > 0 && (
        <Link href="/standup" className="block">
          <Card className="border-amber-500/40 bg-amber-500/5 dark:border-amber-900 dark:bg-amber-950/30">
            <CardContent className="p-4 flex items-center gap-3">
              <Clock className="h-5 w-5 text-amber-600 dark:text-amber-400" />
              <div>
                <p className="font-medium">
                  {missendeUren === 1
                    ? "1 medewerker miste uren"
                    : `${missendeUren} medewerkers misten uren`}{" "}
                  op {new Date(`${standupDag}T00:00:00Z`).toLocaleDateString("nl-NL", {
                    weekday: "long",
                    day: "numeric",
                    month: "long",
                    timeZone: "UTC",
                  })}
                </p>
                <p className="text-sm text-muted-foreground">
                  Laat ze bijboeken vóór de standup begint.
                </p>
              </div>
            </CardContent>
          </Card>
        </Link>
      )}
```

`Clock` en `Link` zijn al geïmporteerd in dit bestand.

- [ ] **Step 4: Typecontrole**

Run: `npx tsc --noEmit`
Expected: geen fouten.

- [ ] **Step 5: Draai de hele testsuite**

Run: `npx vitest run`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/lib/missing-hours.ts "src/app/(app)/page.tsx"
git commit -m "feat: dashboard waarschuwt de standupleider over ontbrekende uren"
```

---

## Handmatige controle na afloop

Niet automatiseerbaar binnen de testconventie van deze repo; loop dit na op de
draaiende app:

- [ ] Iemand die gisteren niets boekte en niet afwezig was: `mist <uren>` naast
      de naam, en daaronder de laatste dag waarop hij wél werkte.
- [ ] Iemand die de helft boekte: `mist` toont het verschil, niet het rooster.
- [ ] Iemand met verlof: geen `mist`-markering, alleen de afwezig-badge.
- [ ] Iemand op zijn vaste vrije dag: `werkt niet op <weekdag>`, geen markering.
- [ ] Iemand zonder weekrooster: geen markering, en niet meegeteld op het
      dashboard.
- [ ] De dashboardkaart toont het juiste aantal en de juiste dag, en verdwijnt
      zodra iedereen bij is.
- [ ] De kaart is zichtbaar voor de teamleider, niet alleen voor admins.
