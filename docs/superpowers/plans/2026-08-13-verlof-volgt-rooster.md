# Verlof volgt het weekrooster — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Een verlofaanvraag rekent met het weekrooster van de medewerker, zodat een week vrij voor iemand die maandags niet werkt 32 uur is en niet 40, en die uren op de dagen belanden die hij werkelijk werkt.

**Architecture:** Er komt geen nieuwe berekening bij. Het bestaande `WorkSchedule` (uren per weekdag, per medewerker) gaat op twee plaatsen mee waar het er nu niet is: bij het voorinvullen van het urenveld in de aanvraagdialoog, en bij het verdelen van het goedgekeurde totaal over dagen in `absenceLines`. Het per-aanvraag patroon achter het vinkje "Herhaald per week" blijft ongewijzigd en gaat vóór het rooster.

**Tech Stack:** Next.js 16 (App Router), React 19, react-hook-form + zod, Prisma 6 op PostgreSQL, vitest.

**Spec:** `docs/superpowers/specs/2026-08-13-verlof-volgt-rooster-design.md`

## Global Constraints

- Geen schemawijziging en dus geen migratie: `WorkSchedule` en `AbsencePattern` bestaan al.
- Testen zijn in deze repo uitsluitend voor pure functies, in `src/lib/*.test.ts`. Er is geen DOM-testomgeving (`vitest.config.mts` draait `environment: "node"`); schrijf geen component- of routetests.
- Alle datumrekenwerk in UTC, met `YYYY-MM-DD` als in- en uitvoer. Nooit `getDay()`, `getDate()` of `setDate()` — gebruik de bestaande helpers uit `src/lib/working-days.ts` en `src/lib/work-schedule.ts`.
- Prisma's `Decimal` serialiseert als string. Uren die uit de database komen gaan altijd door `Number()` of `toWeekSchedule()`.
- Uren mogen nooit stilzwijgend verdwijnen: als een filter alle dagen wegneemt, valt de code terug op de ongefilterde dagen.
- Een aanvraag mét patroon verandert niet. Het patroon gaat vóór het rooster.
- Commit-berichten in het Nederlands, met de trailer `Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>`.
- `npx` heeft in deze omgeving het voorvoegsel `PATH="$HOME/.nvm/versions/node/v20.20.1/bin:$PATH"` nodig.
- Verbind niets met de database. Alles in dit plan is te controleren met `npm test`, `tsc` en `npm run build`.

---

## Bestandsoverzicht

| Bestand | Verantwoordelijkheid | Taak |
|---|---|---|
| `src/lib/absence-entries.ts` | Pure logica: welke urenregels een aanvraag oplevert. Krijgt het rooster erbij. | 1 |
| `src/lib/absence-entries.test.ts` | Testen van diezelfde pure logica. | 1 |
| `src/app/api/absence-requests/route.ts` | Aanmaken (en door een admin meteen goedkeuren). Geeft het rooster van de eigenaar mee. | 2 |
| `src/app/api/absence-requests/[id]/route.ts` | Goedkeuren en bewerken. Twee aanroepen van `absenceLines`, allebei met het rooster van de eigenaar. | 2 |
| `src/app/(app)/absence/page.tsx` | Laadt de roosters en geeft ze door. | 3 |
| `src/components/vacation/absence-client.tsx` | Vult het urenveld voor vanuit het rooster van de doelmedewerker en laat zien waar dat getal vandaan komt. | 3 |

---

### Task 1: `absenceLines` verdeelt over de roosterdagen

**Files:**
- Modify: `src/lib/absence-entries.ts:125-151`
- Test: `src/lib/absence-entries.test.ts` (bestaand blok `describe("absenceLines", ...)` vanaf regel 198)

**Interfaces:**
- Consumes: `scheduledHoursOn(schedule: WeekSchedule, date: string): number` en het type `WeekSchedule` uit `./work-schedule` — allebei al geïmporteerd in dit bestand. `workingDaysBetween(from: string, to: string): string[]` uit `./working-days`. `splitHoursOverDays(totalHours: number, days: string[])` en `patternedEntries(pattern: WeekSchedule, days: string[])` uit dit bestand zelf.
- Produces: `absenceLines(hours: number, pattern: WeekSchedule | null, from: string, to: string, schedule: WeekSchedule | null = null): AbsenceLinesResult`. Het vijfde argument is optioneel met standaard `null`, zodat bestaande aanroepen blijven werken; taak 2 vult het op drie plaatsen in.

**Achtergrond voor wie dit bestand niet kent:** `absenceLines` beantwoordt één vraag — welke urenregels levert deze verlofaanvraag op? Er zijn twee wegen. Mét patroon bepalen de dagwaarden van het patroon de uren en doet het opgegeven totaal niet mee. Zonder patroon wordt het totaal gelijkmatig over de werkdagen verdeeld. Alleen die tweede weg verandert hier: de lijst dagen die de verdeling in gaat wordt eerst tegen het rooster gehouden.

- [ ] **Step 1: Schrijf de falende testen**

Voeg deze testen toe binnen het bestaande `describe("absenceLines", ...)`-blok in `src/lib/absence-entries.test.ts`, na de laatste bestaande test en vóór de afsluitende `});`. Let op de datums: 2026-08-03 is een maandag, 2026-08-07 een vrijdag.

```ts
  // Merlijn Kunst werkt maandags niet.
  const roosterZonderMaandag = { monday: 0, tuesday: 8, wednesday: 8, thursday: 8, friday: 8 };
  // Paul van Gelderen werkt maandag, woensdag en vrijdag.
  const roosterOmDeDag = { monday: 8, tuesday: 0, wednesday: 8, thursday: 0, friday: 8 };

  it("skips the day the schedule leaves free", () => {
    const uitkomst = absenceLines(32, null, "2026-08-03", "2026-08-07", roosterZonderMaandag);
    expect(uitkomst).toEqual({
      ok: true,
      entries: [
        { date: "2026-08-04", hours: 8 },
        { date: "2026-08-05", hours: 8 },
        { date: "2026-08-06", hours: 8 },
        { date: "2026-08-07", hours: 8 },
      ],
    });
  });

  it("keeps only the three days a part-time schedule works", () => {
    const uitkomst = absenceLines(24, null, "2026-08-03", "2026-08-07", roosterOmDeDag);
    expect(uitkomst).toEqual({
      ok: true,
      entries: [
        { date: "2026-08-03", hours: 8 },
        { date: "2026-08-05", hours: 8 },
        { date: "2026-08-07", hours: 8 },
      ],
    });
  });

  it("leaves a half day on the scheduled day it was asked for", () => {
    const uitkomst = absenceLines(4, null, "2026-08-04", "2026-08-04", roosterZonderMaandag);
    expect(uitkomst).toEqual({ ok: true, entries: [{ date: "2026-08-04", hours: 4 }] });
  });

  it("changes nothing without a schedule", () => {
    // Zelfde aanroep als de eerste test van dit blok, nu met een expliciete null
    // als rooster: dat moet exact hetzelfde opleveren.
    expect(absenceLines(40, null, "2026-08-03", "2026-08-07", null))
      .toEqual(absenceLines(40, null, "2026-08-03", "2026-08-07"));
  });

  it("falls back to every working day when the schedule leaves none", () => {
    // Verlof op precies een vaste vrije dag. Het scherm stelt hier nul uur voor
    // en houdt dat tegen; wie tóch uren opgeeft bedoelt die dag, dus de uren
    // horen daar te landen in plaats van te verdwijnen.
    const uitkomst = absenceLines(8, null, "2026-08-03", "2026-08-03", roosterZonderMaandag);
    expect(uitkomst).toEqual({ ok: true, entries: [{ date: "2026-08-03", hours: 8 }] });
  });

  it("lets the pattern win over the schedule", () => {
    // Woensdagpatroon over een week, met een rooster dat woensdag juist vrij
    // geeft: het patroon is een uitdrukkelijke keuze en gaat voor.
    const roosterZonderWoensdag = { monday: 8, tuesday: 8, wednesday: 0, thursday: 8, friday: 8 };
    const uitkomst = absenceLines(999, patroon, "2026-08-03", "2026-08-07", roosterZonderWoensdag);
    expect(uitkomst).toEqual({ ok: true, entries: [{ date: "2026-08-05", hours: 8 }] });
  });
```

- [ ] **Step 2: Draai de testen en controleer dat ze falen**

Run: `npm test -- absence-entries`

Verwacht: de nieuwe testen falen. `absenceLines` negeert het vijfde argument nog, dus "skips the day the schedule leaves free" krijgt vijf regels van 6,4 uur in plaats van vier van 8. De test "changes nothing without a schedule" en "lets the pattern win over the schedule" slagen al — die pinnen gedrag dat niet mag veranderen.

- [ ] **Step 3: Voeg de helper toe**

Zet deze functie in `src/lib/absence-entries.ts` direct boven `export type AbsenceLinesResult` (dus na `patternSummary` en vóór het commentaarblok van `absenceLines`):

```ts
/**
 * De dagen uit `dagen` waarop het weekrooster werk kent.
 *
 * Zonder rooster verandert er niets: dan is elke werkdag een werkdag, precies
 * zoals het altijd ging. Mét rooster vallen de vaste vrije dagen weg, zodat een
 * week verlof van iemand die maandags niet werkt vier regels oplevert en niet
 * vijf met een uitgesmeerde maandag erbij.
 *
 * Laat het rooster geen enkele dag over, dan geeft hij alle dagen terug. Dat
 * gebeurt wanneer iemand uitdrukkelijk verlof opgeeft op een vaste vrije dag;
 * het formulier stelt daar nul uur voor, dus wie er toch een getal intypt
 * bedoelt die dag. Uren stil laten verdwijnen is dan het slechtere antwoord.
 */
function roosterDagen(schedule: WeekSchedule | null, dagen: string[]): string[] {
  if (!schedule) return dagen;
  const werkdagen = dagen.filter((d) => scheduledHoursOn(schedule, d) > 0);
  return werkdagen.length > 0 ? werkdagen : dagen;
}
```

- [ ] **Step 4: Laat `absenceLines` de helper gebruiken**

Vervang in `src/lib/absence-entries.ts` de handtekening en de verdeling. De functie luidt na afloop:

```ts
export function absenceLines(
  hours: number,
  pattern: WeekSchedule | null,
  from: string,
  to: string,
  schedule: WeekSchedule | null = null,
): AbsenceLinesResult {
  const dagen = workingDaysBetween(from, to);
  if (dagen.length === 0) {
    return { ok: false, error: "Deze periode bevat geen werkdagen" };
  }

  // Met patroon: alleen de dagen die erop passen, met de uren van die dag; het
  // opgegeven totaal doet dan niet mee. Zonder patroon: het totaal gelijk over
  // de dagen die het rooster als werkdag kent.
  const entries = pattern
    ? patternedEntries(pattern, dagen)
    : splitHoursOverDays(hours, roosterDagen(schedule, dagen));

  // Alleen bereikbaar mét patroon: een woensdagpatroon over maandag en dinsdag.
  // Zonder patroon kan dit niet, want de invoercontrole eist een positief
  // veelvoud van 0,25 en dat levert altijd minstens één kwartier op.
  if (entries.length === 0) {
    return { ok: false, error: "Deze periode bevat geen dagen die op het patroon passen" };
  }

  return { ok: true, entries };
}
```

Werk ook het commentaarblok boven `absenceLines` bij: voeg aan de bestaande uitleg één zin toe die zegt dat het rooster van de medewerker meegaat en alleen de ongepatroneerde weg raakt. Bijvoorbeeld, achter de bestaande alinea over de drie plekken die hem nodig hebben:

```
 * Het weekrooster van de medewerker gaat als laatste argument mee en bepaalt
 * op welke dagen een aanvraag zónder patroon mag landen. Een aanvraag mét
 * patroon raakt het niet: dat patroon is een uitdrukkelijke keuze van de
 * aanvrager en gaat vóór het rooster.
```

- [ ] **Step 5: Draai de testen en controleer dat ze slagen**

Run: `npm test -- absence-entries`
Verwacht: PASS, alle testen in dit bestand.

- [ ] **Step 6: Draai de hele suite en de typecontrole**

Run: `npm test`
Verwacht: PASS, geen enkele test faalt.

Run: `PATH="$HOME/.nvm/versions/node/v20.20.1/bin:$PATH" npx tsc --noEmit`
Verwacht: geen uitvoer. Het vijfde argument heeft een standaardwaarde, dus de bestaande aanroepers blijven typecorrect.

- [ ] **Step 7: Commit**

```bash
git add src/lib/absence-entries.ts src/lib/absence-entries.test.ts
git commit -m "feat: verlofuren landen op de dagen die het rooster kent

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 2: De routes geven het rooster van de eigenaar mee

**Files:**
- Modify: `src/app/api/absence-requests/route.ts:129-137`
- Modify: `src/app/api/absence-requests/[id]/route.ts:110-123` en `:201-213`

**Interfaces:**
- Consumes: `absenceLines(hours, pattern, from, to, schedule)` uit taak 1 — het vijfde argument is `WeekSchedule | null`. `toWeekSchedule(row): WeekSchedule | null` uit `@/lib/work-schedule` is in beide bestanden al geïmporteerd.
- Produces: niets nieuws voor latere taken.

**Achtergrond:** `absenceLines` wordt op drie plaatsen aangeroepen. Alle drie moeten ze het rooster van de eigenaar van de aanvraag meegeven — niet dat van de ingelogde gebruiker, want een admin keurt verlof van een ander goed. `prisma.workSchedule.findUnique({ where: { userId } })` geeft `null` als die medewerker geen rooster heeft, en `toWeekSchedule(null)` maakt daar netjes `null` van; dat is precies de waarde die "reken zoals je nu rekent" betekent.

Deze taak heeft geen eigen testen: het zijn routes, en die worden in deze repo niet getest (zie Global Constraints). De dekking zit in taak 1; hier telt dat het rooster van de júíste medewerker wordt opgehaald.

- [ ] **Step 1: Aanmaken — POST /api/absence-requests**

In `src/app/api/absence-requests/route.ts` staat het blok dat alleen draait als een admin de aanvraag meteen goedkeurt. Vervang het door:

```ts
    let projectId = "";
    let regels: Array<{ date: string; hours: number }> = [];
    if (meteenGoedgekeurd) {
      const project = await findAbsenceProject(data.type);
      if (!project.ok) return NextResponse.json({ error: project.error }, { status: 400 });
      projectId = project.projectId;

      // Het rooster van de eigenaar, niet van de admin die aanmaakt: de uren
      // horen op de dagen die déze medewerker werkt.
      const rooster = toWeekSchedule(
        await prisma.workSchedule.findUnique({ where: { userId: ownerId } }),
      );

      const uitkomst = absenceLines(hours, data.pattern ?? null, data.startDate, data.endDate, rooster);
      if (!uitkomst.ok) return NextResponse.json({ error: uitkomst.error }, { status: 400 });
      regels = uitkomst.entries;
    }
```

- [ ] **Step 2: Goedkeuren — PUT /api/absence-requests/[id], statustak**

In `src/app/api/absence-requests/[id]/route.ts`, in de tak `if (data.status === "APPROVED")`, staat de aanroep van `absenceLines`. Vervang die tak door:

```ts
      if (data.status === "APPROVED") {
        const project = await findAbsenceProject(existing.type);
        if (!project.ok) return NextResponse.json({ error: project.error }, { status: 400 });
        projectId = project.projectId;

        // Het rooster van de aanvrager, niet van de admin die goedkeurt.
        const rooster = toWeekSchedule(
          await prisma.workSchedule.findUnique({ where: { userId: existing.userId } }),
        );

        const uitkomst = absenceLines(
          Number(existing.hours),
          toWeekSchedule(existing.pattern),
          existing.startDate.toISOString().slice(0, 10),
          existing.endDate.toISOString().slice(0, 10),
          rooster,
        );
        if (!uitkomst.ok) return NextResponse.json({ error: uitkomst.error }, { status: 400 });
        regels = uitkomst.entries;
      }
```

- [ ] **Step 3: Bewerken — PUT /api/absence-requests/[id], bewerktak**

Verderop in hetzelfde bestand staat het blok dat de urenregels van een al goedgekeurde aanvraag opnieuw opbouwt na een wijziging. Vervang het door:

```ts
    let projectId = "";
    let regels: Array<{ date: string; hours: number }> = [];
    if (existing.status === "APPROVED") {
      // data.type ?? existing.type: het type mag bij het bewerken wijzigen, en
      // dan verhuizen de urenregels naar het project van het nieuwe type.
      const project = await findAbsenceProject(data.type ?? existing.type);
      if (!project.ok) return NextResponse.json({ error: project.error }, { status: 400 });
      projectId = project.projectId;

      // Het rooster van de eigenaar van de aanvraag; een admin mag die van een
      // ander bewerken.
      const rooster = toWeekSchedule(
        await prisma.workSchedule.findUnique({ where: { userId: existing.userId } }),
      );

      const uitkomst = absenceLines(hours, data.pattern ?? null, data.startDate, data.endDate, rooster);
      if (!uitkomst.ok) return NextResponse.json({ error: uitkomst.error }, { status: 400 });
      regels = uitkomst.entries;
    }
```

- [ ] **Step 4: Controleer dat er geen aanroep is overgeslagen**

Run: `grep -rn "absenceLines(" src/app src/lib | grep -v "\.test\.ts"`

Verwacht: vier regels — de definitie in `src/lib/absence-entries.ts`, één aanroep in `src/app/api/absence-requests/route.ts` en twee in `src/app/api/absence-requests/[id]/route.ts`. Die drie aanroepen moeten alle drie vijf argumenten hebben, met `rooster` als laatste. Ontbreekt er ergens één, voeg hem daar alsnog toe.

- [ ] **Step 5: Typecontrole en testen**

Run: `PATH="$HOME/.nvm/versions/node/v20.20.1/bin:$PATH" npx tsc --noEmit`
Verwacht: geen uitvoer.

Run: `npm test`
Verwacht: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/app/api/absence-requests
git commit -m "feat: goedkeuring verdeelt verlof over de roosterdagen van de aanvrager

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 3: Het scherm vult de uren voor vanuit het rooster

**Files:**
- Modify: `src/app/(app)/absence/page.tsx:17-69`
- Modify: `src/components/vacation/absence-client.tsx` — `Props` (regel 72-81), de bestaande `useEffect` (regel 223-235), en het urenveld in de dialoog (regel 666-687)

**Interfaces:**
- Consumes: `toWeekSchedule(row): WeekSchedule | null` en het type `WeekSchedule` uit `@/lib/work-schedule`; `patternSummary(pattern: WeekSchedule, from: string, to: string): { entries: Array<{ date: string; hours: number }>; total: number }` uit `@/lib/absence-entries` — beide al geïmporteerd in de betrokken bestanden.
- Produces: een nieuwe prop `schedules: Record<string, WeekSchedule>` op `AbsenceClient`, met de gebruikers-id als sleutel. De bestaande prop `weeklyHours: number` blijft bestaan: die voedt de terugval voor medewerkers zónder rooster.

**Achtergrond:** de dialoog gaat niet altijd over de ingelogde gebruiker. Een admin kan verlof aanvragen voor een collega of een bestaande aanvraag van een collega bewerken. De variabele `doelMedewerkerId` in deze component bepaalt daarom al over wie de dialoog gaat, en het vakantiesaldo in dezelfde dialoog gebruikt hem. Het rooster moet diezelfde persoon volgen.

- [ ] **Step 1: Laad de roosters op de pagina**

In `src/app/(app)/absence/page.tsx` staat één `Promise.all` met vier queries. Voeg er een vijfde aan toe en breid de bestemmingsvariabelen uit. De array wordt:

```ts
  const [requests, budgets, users, currentUser, scheduleRows] = await Promise.all([
```

en direct na de bestaande `prisma.user.findUnique({ where: { id: userId }, select: { weeklyHours: true } })` komt als vijfde element:

```ts
    // Een medewerker heeft alleen zijn eigen rooster nodig; een admin kan voor
    // iedereen aanvragen, dus die krijgt ze allemaal. Het zijn enkele rijen.
    prisma.workSchedule.findMany({ where: admin ? {} : { userId } }),
```

- [ ] **Step 2: Zet de rijen om naar een lijst per gebruiker**

Voeg in `src/app/(app)/absence/page.tsx` na de `Promise.all` en naast de bestaande regel `const calendarToken = ...` toe:

```ts
  // Op id, want de dialoog zoekt het rooster op van de medewerker waar de
  // aanvraag over gaat. toWeekSchedule maakt van de Decimals getallen; hier kan
  // hij nooit null geven, want elke rij bestaat.
  const schedules = Object.fromEntries(
    scheduleRows.map((r) => [r.userId, toWeekSchedule(r)!]),
  );
```

En geef hem door aan de component, naast de bestaande `weeklyHours`:

```tsx
      weeklyHours={Number(currentUser?.weeklyHours ?? 40)}
      schedules={schedules}
```

- [ ] **Step 3: Neem de prop op in de component**

In `src/components/vacation/absence-client.tsx`, in `interface Props`, onder `weeklyHours: number;`:

```ts
  // Het weekrooster per gebruikers-id. Wie er geen heeft staat er niet in.
  schedules: Record<string, WeekSchedule>;
```

Voeg `schedules` toe aan de gedestructureerde parameters van de component, direct achter `weeklyHours`.

- [ ] **Step 4: Bereken wat het rooster over de gekozen periode oplevert**

Zet dit in `src/components/vacation/absence-client.tsx` direct onder de bestaande regels die `patroonInfo` en `patroonTotaal` bepalen:

```ts
  // Het rooster van de medewerker waar de dialoog over gaat — dezelfde keuze
  // die het saldo hierboven al maakt. Wie geen rooster heeft krijgt null en
  // valt terug op weeklyHours, precies zoals het altijd ging.
  const doelRooster = schedules[doelMedewerkerId] ?? null;

  // Wat dat rooster over de gekozen periode oplevert. Niet berekend zodra het
  // patroonvinkje aanstaat: dat patroon wint en zou anders met deze regel om
  // het urenveld vechten.
  const roosterInfo =
    !herhaald && doelRooster && watchedStart && watchedEnd
      ? patternSummary(doelRooster, watchedStart, watchedEnd)
      : null;
  const roosterTotaal = roosterInfo?.total ?? null;
```

- [ ] **Step 5: Laat de voorinvulling het rooster volgen**

Vervang de bestaande `useEffect` die het urenveld invult door:

```ts
  useEffect(() => {
    // Met een patroon is het urenveld alleen-lezen en toont het het afgeleide
    // totaal. De werkdagentelling zou dat overschrijven zodra je een datum
    // aanraakt, en zonder een waarde in het veld komt het formulier niet langs
    // zijn eigen "moet positief zijn".
    if (herhaald) {
      requestForm.setValue("hours", patroonTotaal, { shouldValidate: false });
      return;
    }
    if (!watchedStart || !watchedEnd) return;
    // Mét rooster telt het rooster, ook als het nul oplevert: verlof op een
    // vaste vrije dag hóórt nul te zijn, en de bestaande "Moet positief zijn"
    // houdt dat tegen. Een oude waarde laten staan zou juist verwarren.
    if (roosterTotaal !== null) {
      requestForm.setValue("hours", roosterTotaal, { shouldValidate: false });
      return;
    }
    const calculated = countWorkingHours(watchedStart, watchedEnd, weeklyHours);
    if (calculated > 0) requestForm.setValue("hours", calculated, { shouldValidate: false });
  }, [herhaald, patroonTotaal, roosterTotaal, watchedStart, watchedEnd, weeklyHours, requestForm]);
```

- [ ] **Step 6: Laat zien waar het getal vandaan komt**

In de dialoog, in het blok van het urenveld, staat de foutmelding van `hours` en daaronder de saldoregel. Zet tussen die twee:

```tsx
              {roosterInfo && (
                <p className="text-xs text-muted-foreground">
                  Rooster: {roosterInfo.entries.length} dagen, {roosterInfo.total.toFixed(2)} uur in totaal
                </p>
              )}
```

De formulering volgt bewust `patroonSamenvatting` verderop in ditzelfde bestand, zodat de twee regels op dezelfde plek hetzelfde klinken.

- [ ] **Step 7: Typecontrole, testen en build**

Run: `PATH="$HOME/.nvm/versions/node/v20.20.1/bin:$PATH" npx tsc --noEmit`
Verwacht: geen uitvoer. Ziet hij `schedules` niet als prop, dan is stap 3 niet af.

Run: `npm test`
Verwacht: PASS.

Run: `npm run build`
Verwacht: de build slaagt. Deze stap vangt wat `tsc` niet ziet — een client-component die per ongeluk iets van de server importeert, bijvoorbeeld.

- [ ] **Step 8: Commit**

```bash
git add "src/app/(app)/absence/page.tsx" src/components/vacation/absence-client.tsx
git commit -m "feat: urenveld van een verlofaanvraag volgt het weekrooster

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Handmatige controle na afloop

Deze feature raakt React-gedrag dat deze repo niet automatisch test. Loop in de draaiende app na:

1. Vraag als Merlijn Kunst (rooster 0/8/8/8/8) een hele week aan: het urenveld hoort 32 te tonen, met eronder "Rooster: 4 dagen, 32.00 uur in totaal".
2. Vraag als Paul van Gelderen (8/0/8/0/8) een hele week aan: 24 uur, 3 dagen.
3. Vraag voor iemand zónder rooster een hele week aan: onveranderd 40 uur, en geen roosterregel onder het veld.
4. Kies één dinsdag voor Merlijn en typ 4 in het urenveld: het veld laat zich gewoon overtypen.
5. Kies alleen een maandag voor Merlijn: het veld toont 0 en opslaan meldt "Moet positief zijn".
6. Zet het vinkje "Herhaald per week" aan: het urenveld wordt grijs en volgt het patroon, en de roosterregel verdwijnt.
7. Keur als admin een goedgekeurde weekaanvraag van Merlijn goed en kijk op /time in de weekweergave: vier regels van 8 uur, niets op maandag.
