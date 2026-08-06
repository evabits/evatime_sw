# Weekweergave op het kilometerscherm — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Het kilometerscherm krijgt dezelfde weekweergave als het urenscherm, met één gedeeld weekraster in plaats van twee kopieën.

**Architecture:** Het raster dat nu in `time-entries-client.tsx` staat wordt een eigen component in `src/components/shared/`, met als enige verschil tussen de twee schermen een optionele functie die per dag een vervangende tekst mag geven — dat is de `vrij`-markering die alleen bij uren hoort. Het per dag optellen wordt een pure functie met tests, omdat daar datumparsing in zit en dus de kans op een tijdzonefout die je pas veel later opmerkt. Het urenscherm gaat het gedeelde raster gebruiken zonder dat er iets zichtbaar verandert; het kilometerscherm krijgt de weekmodus erbij.

**Tech Stack:** Next.js 16 (App Router), React 19, TypeScript, date-fns, react-hook-form, Radix UI, lucide-react, vitest.

## Global Constraints

- **Node 20 is vereist.** De standaard-node in deze shell is v16 en de toolchain crasht daarop. Prefix élk npm- of npx-commando met `PATH="$HOME/.nvm/versions/node/v20.20.1/bin:$PATH"`.
- **Er is een live PRODUCTIEDATABASE bereikbaar via `.env.local`.** Dit traject wijzigt het datamodel niet en raakt geen enkele API. Draai geen `prisma`-commando en maak of wijzig geen `.env`.
- **Dit is niet de Next.js die je kent.** Lees `node_modules/next/dist/docs/` voordat je aannames doet. `AGENTS.md` in de repo-root is een echte, door het team gecommitte projectafspraak.
- **Alle zichtbare tekst is Nederlands.** De knoptitels luiden exact `Weekoverzicht` en `Lijstweergave`, de terugspringknop heet `Deze week`, en de totaalkolom heet `Totaal`.
- **Het urenscherm mag er niet anders uit gaan zien.** Task 2 verplaatst werkende, deze week nog gereviewde code. Dezelfde kolommen, dezelfde onderstreping van vandaag, dezelfde `vrij`, hetzelfde totaal, dezelfde klikbaarheid.
- **Een dag zonder registraties toont het opgemaakte nul in gedempte opmaak**, niet leeg — bij uren `formatHours(0)`, bij kilometers `0.0`.
- **Datums zijn `YYYY-MM-DD`-strings** waar ze als sleutel dienen. De week begint op maandag (`weekStartsOn: 1`).
- **Geen nieuwe dependencies.**
- Testcommando: `npm test`. Baseline: **25 bestanden, 290 tests groen.**
- Lint: `npm run lint`. **De baseline is niet schoon:** 326 errors en 20 warnings, vrijwel allemaal `@typescript-eslint/no-explicit-any`. De gate is *geen nieuwe soorten lint-fouten*.
- **`npx tsc --noEmit` meldt 0 fouten over de hele repo en moet dat blijven doen.**
- `npm run build` kan niet draaien zonder `.env`; gebruik `tsc` als vangnet.
- Testconventie: uitsluitend pure functies in `src/lib/*.test.ts` met vitest. Er bestaan geen componenttests en die worden hier niet geïntroduceerd.

---

## File Structure

**Nieuw:**

| Bestand | Wat |
|---|---|
| `src/lib/per-day-totals.ts` | `perDayTotals` — registraties per dag optellen. |
| `src/lib/per-day-totals.test.ts` | Tests daarvoor. |
| `src/components/shared/week-grid.tsx` | Het gedeelde weekraster. |

**Gewijzigd:**

| Bestand | Wat |
|---|---|
| `src/components/time/time-entries-client.tsx` | Gebruikt het gedeelde raster en `perDayTotals`; geen zichtbare wijziging. |
| `src/components/km/km-entries-client.tsx` | Weekmodus erbij. |

`src/components/shared/` bestaat al (`level-rate-fields.tsx`), dus dat is de gevestigde plek voor een component die twee schermen delen.

---

## Task 1: Per dag optellen

**Files:**
- Create: `src/lib/per-day-totals.ts`
- Test: `src/lib/per-day-totals.test.ts`

**Interfaces:**
- Produces:
  ```ts
  function perDayTotals(
    entries: Array<{ date: string | Date; value: number }>,
    days: string[],
  ): number[]
  ```
  Task 2 en Task 3 roepen deze aan. `days` zijn `YYYY-MM-DD`-strings; de uitkomst heeft dezelfde lengte en volgorde.

- [ ] **Step 1: Schrijf de falende tests**

Maak `src/lib/per-day-totals.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { perDayTotals } from "./per-day-totals";

// 2026-08-03 is een maandag.
const week = [
  "2026-08-03",
  "2026-08-04",
  "2026-08-05",
  "2026-08-06",
  "2026-08-07",
  "2026-08-08",
  "2026-08-09",
];

describe("perDayTotals", () => {
  it("returns a zero for every day when there is nothing", () => {
    expect(perDayTotals([], week)).toEqual([0, 0, 0, 0, 0, 0, 0]);
  });

  it("puts a single entry on its own day", () => {
    expect(perDayTotals([{ date: "2026-08-05", value: 8 }], week)).toEqual([0, 0, 8, 0, 0, 0, 0]);
  });

  it("adds up several entries on the same day", () => {
    const uitkomst = perDayTotals(
      [
        { date: "2026-08-04", value: 2.5 },
        { date: "2026-08-04", value: 5.5 },
        { date: "2026-08-06", value: 1 },
      ],
      week,
    );
    expect(uitkomst).toEqual([0, 8, 0, 1, 0, 0, 0]);
  });

  it("ignores entries outside the given days", () => {
    const uitkomst = perDayTotals(
      [
        { date: "2026-07-31", value: 99 },
        { date: "2026-08-10", value: 99 },
        { date: "2026-08-03", value: 4 },
      ],
      week,
    );
    expect(uitkomst).toEqual([4, 0, 0, 0, 0, 0, 0]);
  });

  it("accepts a Date as well as a string", () => {
    expect(perDayTotals([{ date: new Date("2026-08-07T00:00:00"), value: 3 }], week))
      .toEqual([0, 0, 0, 0, 3, 0, 0]);
  });

  it("keeps the order and length of the days it was given", () => {
    // Omgekeerde volgorde: de uitkomst volgt de dagen, niet de kalender.
    const omgekeerd = [...week].reverse();
    expect(perDayTotals([{ date: "2026-08-09", value: 6 }], omgekeerd))
      .toEqual([6, 0, 0, 0, 0, 0, 0]);
  });
});
```

- [ ] **Step 2: Draai de tests en stel vast dat ze falen**

Run: `PATH="$HOME/.nvm/versions/node/v20.20.1/bin:$PATH" npx vitest run src/lib/per-day-totals.test.ts`
Expected: FAIL — de module bestaat niet.

- [ ] **Step 3: Schrijf de implementatie**

Maak `src/lib/per-day-totals.ts`:

```ts
import { format } from "date-fns";

/**
 * Telt registraties per dag op, in de volgorde van de meegegeven dagen.
 *
 * De aanroeper zet zijn registraties eerst om naar `{ date, value }`. Het
 * urenscherm sommeert `hours` en het kilometerscherm `km`, en één `map` per
 * scherm is minder omslachtig dan een callback-parameter die alleen bestaat om
 * twee veldnamen te overbruggen.
 *
 * Dit is een eigen functie omdat er datumparsing in zit. `new Date(...)` gevolgd
 * door `format` rekent in de lokale tijdzone, en een fout daarin schuift een
 * registratie een dag op — zichtbaar op het scherm, maar pas als iemand het
 * toevallig opmerkt.
 */
export function perDayTotals(
  entries: Array<{ date: string | Date; value: number }>,
  days: string[],
): number[] {
  return days.map((dag) =>
    entries
      .filter((e) => format(new Date(e.date), "yyyy-MM-dd") === dag)
      .reduce((som, e) => som + e.value, 0),
  );
}
```

- [ ] **Step 4: Draai de tests en stel vast dat ze slagen**

Run: `PATH="$HOME/.nvm/versions/node/v20.20.1/bin:$PATH" npx vitest run src/lib/per-day-totals.test.ts`
Expected: PASS, 6 tests.

- [ ] **Step 5: Draai de volledige suite**

Run: `PATH="$HOME/.nvm/versions/node/v20.20.1/bin:$PATH" npm test`
Expected: 26 bestanden, 296 tests, groen.

- [ ] **Step 6: Commit**

```bash
git add src/lib/per-day-totals.ts src/lib/per-day-totals.test.ts
git commit -m "feat: registraties per dag optellen als pure functie"
```

---

## Task 2: Het gedeelde weekraster

**Files:**
- Create: `src/components/shared/week-grid.tsx`
- Modify: `src/components/time/time-entries-client.tsx`

**Interfaces:**
- Consumes: `perDayTotals` uit Task 1.
- Produces:
  ```tsx
  <WeekGrid
    days={Date[]}                                   // precies 7
    values={number[]}                               // zelfde lengte en volgorde
    today={string}                                  // YYYY-MM-DD
    selectedDay={string | null}
    onSelect={(day: string) => void}
    formatValue={(value: number) => string}
    noteFor={(dayStr: string, index: number, value: number) => string | null}  // optioneel
  />
  ```
  Task 3 gebruikt hem zonder `noteFor`.

**Deze taak levert geen unittests op.** Het is een presentatiecomponent; deze repo test uitsluitend pure functies.

- [ ] **Step 1: Maak het component**

Maak `src/components/shared/week-grid.tsx`:

```tsx
"use client";
import { format } from "date-fns";
import { cn } from "@/lib/utils";

const DAY_ABBR = ["Ma", "Di", "Wo", "Do", "Vr", "Za", "Zo"];

/**
 * Het weekraster boven een registratielijst: zeven klikbare dagen en een
 * totaalkolom.
 *
 * Wat per scherm verschilt gaat als prop mee. `formatValue` bepaalt hoe een
 * getal eruitziet — uren en kilometers rekenen niet in dezelfde eenheid — en
 * `noteFor` mag per dag een tekst in plaats van dat getal geven. Dat laatste
 * bestaat voor de `vrij`-markering van het urenscherm; de voorwaarden daarvoor
 * hangen af van het weekrooster van de medewerker, en dat is kennis die in het
 * urenscherm hoort en niet in een gedeeld raster.
 */
export function WeekGrid({
  days,
  values,
  today,
  selectedDay,
  onSelect,
  formatValue,
  noteFor,
}: {
  days: Date[];
  values: number[];
  today: string;
  selectedDay: string | null;
  onSelect: (day: string) => void;
  formatValue: (value: number) => string;
  noteFor?: (dayStr: string, index: number, value: number) => string | null;
}) {
  const total = values.reduce((s, v) => s + v, 0);
  return (
    <div className="overflow-x-auto border-b">
      <div className="grid grid-cols-8 min-w-[560px]">
        {days.map((day, i) => {
          const dayStr = format(day, "yyyy-MM-dd");
          const isToday = dayStr === today;
          const isSelected = selectedDay === dayStr;
          const value = values[i];
          const note = noteFor?.(dayStr, i, value) ?? null;
          return (
            <button
              key={dayStr}
              onClick={() => onSelect(dayStr)}
              className={cn(
                "flex flex-col items-start px-3 py-2.5 hover:bg-muted/50 transition-colors text-left",
                isSelected && "bg-muted/50"
              )}
            >
              <span className={cn(
                "text-xs font-semibold pb-0.5",
                isToday ? "border-b-2 border-primary text-primary" : "text-muted-foreground"
              )}>
                {DAY_ABBR[i]} {format(day, "d")}
              </span>
              <span className={cn("text-sm tabular-nums mt-1", value === 0 ? "text-muted-foreground" : "font-medium")}>
                {note ?? formatValue(value)}
              </span>
            </button>
          );
        })}
        <div className="flex flex-col items-end px-3 py-2.5">
          <span className="text-xs font-semibold text-muted-foreground pb-0.5">Totaal</span>
          <span className={cn("text-sm tabular-nums mt-1", total === 0 ? "text-muted-foreground" : "font-medium")}>
            {formatValue(total)}
          </span>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Laat het urenscherm het raster gebruiken**

In `src/components/time/time-entries-client.tsx` staat het hele blok van `{/* Day header */}` tot en met de sluitende `</div>` van het raster — dat begint met:

```tsx
            {/* Day header */}
            <div className="overflow-x-auto border-b">
              <div className="grid grid-cols-8 min-w-[560px]">
```

en eindigt met de `</div>` direct vóór de regel met `{/* Entry list */}`. Vervang dat hele blok door:

```tsx
            <WeekGrid
              days={weekDays}
              values={hoursPerDay}
              today={today}
              selectedDay={selectedDay}
              onSelect={toggleDay}
              formatValue={formatHours}
              // Alleen markeren als er ook niets geboekt is: boekte je toch uren
              // op je vrije dag, dan is dát de informatie die telt. En alleen
              // wanneer het raster ook echt eigen uren toont (niet andermans,
              // gefilterd of niet) en op een werkdag — het weekend heeft geen
              // vaste vrije dag, dat is gewoon niemands werkdag.
              noteFor={(dayStr, i, h) => {
                const eigenRooster = !isAdmin || filterUser === userId;
                const vrijeDag =
                  eigenRooster &&
                  i < 5 &&
                  workSchedule !== null &&
                  scheduledHoursOn(workSchedule, dayStr) === 0 &&
                  h === 0;
                return vrijeDag ? "vrij" : null;
              }}
            />
```

Voeg de import toe bij de andere componentimports:

```tsx
import { WeekGrid } from "@/components/shared/week-grid";
```

- [ ] **Step 3: Laat het urenscherm `perDayTotals` gebruiken**

In datzelfde bestand staat:

```tsx
  const hoursPerDay = weekDays.map((day) => {
    const dayStr = format(day, "yyyy-MM-dd");
    return weekEntries
      .filter((e) => format(new Date(e.date), "yyyy-MM-dd") === dayStr)
      .reduce((s, e) => s + Number(e.hours), 0);
  });
```

Vervang door:

```tsx
  const hoursPerDay = perDayTotals(
    weekEntries.map((e) => ({ date: e.date, value: Number(e.hours) })),
    weekDays.map((day) => format(day, "yyyy-MM-dd")),
  );
```

Voeg de import toe:

```tsx
import { perDayTotals } from "@/lib/per-day-totals";
```

- [ ] **Step 4: Ruim op wat niet meer gebruikt wordt**

`DAY_ABBR` staat bovenaan `time-entries-client.tsx` en is verhuisd naar het raster. Controleer met grep of hij daar nog ergens gebruikt wordt, en verwijder hem alleen als dat niet zo is:

```bash
grep -n "DAY_ABBR" src/components/time/time-entries-client.tsx
```

Doe hetzelfde voor `cn`: als het raster de enige gebruiker was, kan die import weg. Controleer met grep in plaats van op gevoel — beide worden mogelijk elders in het bestand gebruikt.

- [ ] **Step 5: Stel vast dat er niets zichtbaars veranderd is**

Run: `git diff src/components/time/time-entries-client.tsx`

Loop de diff langs en stel per wijziging vast dat hij niets aan de weergave verandert. Let specifiek op: dezelfde dagafkortingen in dezelfde volgorde, dezelfde onderstreping voor vandaag, dezelfde achtergrond voor de geselecteerde dag, dezelfde gedempte opmaak bij nul, dezelfde totaalkolom rechts, en dat de vijf voorwaarden voor `vrij` woordelijk hetzelfde zijn gebleven. Meld in je rapport wat je vaststelde.

- [ ] **Step 6: Controleer de typen en de tests**

Run: `PATH="$HOME/.nvm/versions/node/v20.20.1/bin:$PATH" npx tsc --noEmit`
Expected: 0 fouten.

Run: `PATH="$HOME/.nvm/versions/node/v20.20.1/bin:$PATH" npm test`
Expected: 26 bestanden, 296 tests, groen.

- [ ] **Step 7: Commit**

```bash
git add src/components/shared/week-grid.tsx src/components/time/time-entries-client.tsx
git commit -m "refactor: weekraster als gedeeld component"
```

---

## Task 3: Weekmodus op het kilometerscherm

**Files:**
- Modify: `src/components/km/km-entries-client.tsx`

**Interfaces:**
- Consumes: `perDayTotals` uit Task 1, `<WeekGrid />` uit Task 2.

**Deze taak levert geen unittests op.** Het is schermtoestand.

- [ ] **Step 1: Breid de imports uit**

Bovenaan `src/components/km/km-entries-client.tsx` staat:

```tsx
import { useState } from "react";
```

Vervang door:

```tsx
import { useState, useEffect } from "react";
```

En:

```tsx
import { format } from "date-fns";
```

Vervang door:

```tsx
import { format, startOfWeek, addWeeks, addDays } from "date-fns";
```

En:

```tsx
import { Pencil, Trash2 } from "lucide-react";
```

Vervang door:

```tsx
import { Pencil, Trash2, ChevronLeft, ChevronRight, CalendarDays, List } from "lucide-react";
```

Voeg toe bij de andere imports:

```tsx
import { WeekGrid } from "@/components/shared/week-grid";
import { perDayTotals } from "@/lib/per-day-totals";
```

- [ ] **Step 2: Voeg de weektoestand toe**

Zoek:

```tsx
  const [selectedCustomerId, setSelectedCustomerId] = useState<string>("");
```

Voeg daaronder toe:

```tsx
  // Weekweergave, gelijk aan het urenscherm: week is de standaard.
  const [viewMode, setViewMode] = useState<"week" | "list">("week");
  const [weekOffset, setWeekOffset] = useState(0);
  const [selectedDay, setSelectedDay] = useState<string | null>(null);

  const today = format(new Date(), "yyyy-MM-dd");
  const weekStart = startOfWeek(addWeeks(new Date(), weekOffset), { weekStartsOn: 1 });
  const weekEnd = addDays(weekStart, 6);
  const weekFrom = format(weekStart, "yyyy-MM-dd");
  const weekTo = format(weekEnd, "yyyy-MM-dd");
  const weekDays = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));

  // Filteren op het weekvenster werkt ook op de registraties die de pagina
  // meegaf, zodat het raster meteen klopt zonder eerst te hoeven ophalen.
  const weekEntries = entries.filter((e) => {
    const d = format(new Date(e.date), "yyyy-MM-dd");
    return d >= weekFrom && d <= weekTo;
  });

  const kmPerDay = perDayTotals(
    weekEntries.map((e) => ({ date: e.date, value: Number(e.km) })),
    weekDays.map((day) => format(day, "yyyy-MM-dd")),
  );

  const displayedEntries = viewMode === "week"
    ? (selectedDay ? weekEntries.filter((e) => format(new Date(e.date), "yyyy-MM-dd") === selectedDay) : weekEntries)
    : entries;
```

- [ ] **Step 3: Voeg de weekhandlers toe**

Zoek `async function fetchEntries(` en voeg dáárvóór toe:

```tsx
  async function fetchWeekEntries(offset: number, userFilter = filterUser) {
    const ws = startOfWeek(addWeeks(new Date(), offset), { weekStartsOn: 1 });
    const we = addDays(ws, 6);
    setFetching(true);
    const params = new URLSearchParams({ from: format(ws, "yyyy-MM-dd"), to: format(we, "yyyy-MM-dd") });
    if (userFilter !== "all") params.set("userId", userFilter);
    const res = await fetch(`/api/km?${params}`);
    if (res.ok) setEntries(await res.json());
    setFetching(false);
  }

  async function handleWeekNav(newOffset: number) {
    setWeekOffset(newOffset);
    setSelectedDay(null);
    await fetchWeekEntries(newOffset);
  }

  async function switchToWeek() {
    setViewMode("week");
    setWeekOffset(0);
    setSelectedDay(null);
    await fetchWeekEntries(0);
  }

  async function switchToList() {
    setViewMode("list");
    setSelectedDay(null);
    await fetchEntries(filterMonth, filterProject);
  }

  function toggleDay(dayStr: string) {
    setSelectedDay((prev) => (prev === dayStr ? null : dayStr));
  }
```

- [ ] **Step 4: Laat een gekozen dag het datumveld zetten**

Voeg direct ná het blok uit Step 3 toe:

```tsx
  // Een dag aanklikken zet het formulier op die datum, zodat invoeren en
  // bekijken bij elkaar blijven.
  useEffect(() => {
    if (viewMode === "week" && selectedDay) {
      form.setValue("date", selectedDay);
    }
  }, [selectedDay]); // eslint-disable-line react-hooks/exhaustive-deps
```

Deze `useEffect` gebruikt `form`, en die is in dit bestand ruim vóór `fetchEntries` gedeclareerd — dus op de plek uit Step 3 staat hij goed. Controleer dat wel even met `grep -n "useForm<FormData>" src/components/km/km-entries-client.tsx`: staat die declaratie onverwacht ná jouw nieuwe blok, zet het blok dan direct achter haar.

- [ ] **Step 5: Laat het medewerkerfilter de weekmodus volgen**

Zoek:

```tsx
  async function handleUserChange(uid: string) {
    setFilterUser(uid);
    await fetchEntries(filterMonth, filterProject, uid);
  }
```

Vervang door:

```tsx
  async function handleUserChange(uid: string) {
    setFilterUser(uid);
    if (viewMode === "week") await fetchWeekEntries(weekOffset, uid);
    else await fetchEntries(filterMonth, filterProject, uid);
  }
```

- [ ] **Step 6: Laat opslaan de juiste weergave verversen**

In `onSubmit` staat in de tak die een nieuwe registratie aanmaakt:

```tsx
          } else {
            const created = await res.json();
            const { from, to } = monthBounds(filterMonth);
            const entryDate = data.date;
            if (entryDate >= from && entryDate <= to && (filterProject === "all" || data.projectId === filterProject)) {
              setEntries((prev) => [created, ...prev]);
            }
          }
```

Vervang door:

```tsx
          } else if (viewMode === "week") {
            // In weekmodus opnieuw ophalen in plaats van de lijst bijwerken: de
            // maandgrens hieronder zegt niets over het weekvenster.
            await fetchWeekEntries(weekOffset);
          } else {
            const created = await res.json();
            const { from, to } = monthBounds(filterMonth);
            const entryDate = data.date;
            if (entryDate >= from && entryDate <= to && (filterProject === "all" || data.projectId === filterProject)) {
              setEntries((prev) => [created, ...prev]);
            }
          }
```

En verderop in dezelfde functie staat twee keer het leegmaken van het formulier:

```tsx
          form.reset({ date: format(new Date(), "yyyy-MM-dd"), userId });
```

en

```tsx
          form.reset({ date: format(new Date(), "yyyy-MM-dd"), userId: data.userId ?? userId });
```

Vervang die twee door respectievelijk:

```tsx
          form.reset({ date: selectedDay ?? today, userId });
```

en

```tsx
          form.reset({ date: selectedDay ?? today, userId: data.userId ?? userId });
```

Zo blijf je op de dag die je hebt aangeklikt in plaats van terug te springen naar vandaag.

- [ ] **Step 7: Zet de weeknavigatie en de schakelaar in de kop**

De kop van de registratiekaart is nu:

```tsx
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <CardTitle>Registraties</CardTitle>
              {entries.length > 0 && (
                <span className="text-sm text-muted-foreground">{totalKm.toFixed(1)} km</span>
              )}
            </div>
            <div className="flex flex-wrap gap-2">
              {isAdmin && users.length > 0 && (
                <Select value={filterUser} onValueChange={handleUserChange}>
                  <SelectTrigger className="w-40 h-8 text-sm"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Alle medewerkers</SelectItem>
                    {users.map((u) => (
                      <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
              <Input
                type="month"
                value={filterMonth}
                onChange={(e) => handleMonthChange(e.target.value)}
                className="w-40 h-8 text-sm"
              />
              <Select value={filterProject} onValueChange={handleProjectChange}>
                <SelectTrigger className="w-48 h-8 text-sm"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Alle projecten</SelectItem>
                  {projects.map((p) => (
                    <SelectItem key={p.id} value={p.id}>{p.customer ? `${p.customer.name} — ` : ""}{p.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
```

Vervang door:

```tsx
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-1.5">
              {viewMode === "week" ? (
                <>
                  <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => handleWeekNav(weekOffset - 1)}>
                    <ChevronLeft className="h-4 w-4" />
                  </Button>
                  <span className="text-sm font-medium tabular-nums">
                    {format(weekStart, "d MMM")} – {format(weekEnd, "d MMM yyyy")}
                  </span>
                  <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => handleWeekNav(weekOffset + 1)}>
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                  {weekOffset !== 0 && (
                    <Button variant="ghost" size="sm" className="h-7 text-xs px-2" onClick={() => handleWeekNav(0)}>
                      Deze week
                    </Button>
                  )}
                </>
              ) : (
                <>
                  <CardTitle>Registraties</CardTitle>
                  {entries.length > 0 && (
                    <span className="text-sm text-muted-foreground">{totalKm.toFixed(1)} km</span>
                  )}
                </>
              )}
            </div>
            <div className="flex items-center gap-2 flex-wrap justify-end">
              {isAdmin && users.length > 0 && (
                <Select value={filterUser} onValueChange={handleUserChange}>
                  <SelectTrigger className="w-40 h-8 text-sm"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Alle medewerkers</SelectItem>
                    {users.map((u) => (
                      <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
              {/* Maand en project alleen in lijstmodus: een weekvenster en een
                  maandfilter tegelijk aanbieden spreekt elkaar tegen. */}
              {viewMode === "list" && (
                <div className="flex flex-wrap gap-2">
                  <Input
                    type="month"
                    value={filterMonth}
                    onChange={(e) => handleMonthChange(e.target.value)}
                    className="w-40 h-8 text-sm"
                  />
                  <Select value={filterProject} onValueChange={handleProjectChange}>
                    <SelectTrigger className="w-48 h-8 text-sm"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Alle projecten</SelectItem>
                      {projects.map((p) => (
                        <SelectItem key={p.id} value={p.id}>{p.customer ? `${p.customer.name} — ` : ""}{p.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
              <div className="flex rounded-md border overflow-hidden">
                <Button
                  variant={viewMode === "week" ? "default" : "ghost"}
                  size="sm"
                  className="rounded-none h-8 px-2.5"
                  onClick={switchToWeek}
                  title="Weekoverzicht"
                >
                  <CalendarDays className="h-4 w-4" />
                </Button>
                <Button
                  variant={viewMode === "list" ? "default" : "ghost"}
                  size="sm"
                  className="rounded-none h-8 px-2.5"
                  onClick={switchToList}
                  title="Lijstweergave"
                >
                  <List className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </div>
```

- [ ] **Step 8: Zet het raster boven de tabel**

Dit gaat om de kaart waarvan je zojuist in Step 7 de kop hebt herschreven — de registratiekaart, niet die van het formulier. Je herkent hem eraan dat zijn `</CardHeader>` direct gevolgd wordt door `<CardContent className="p-0">`; de formulierkaart heeft `<CardContent>` zonder klasse. Tussen die twee regels staat niets. Voeg daar toe:

```tsx
        {viewMode === "week" && (
          <WeekGrid
            days={weekDays}
            values={kmPerDay}
            today={today}
            selectedDay={selectedDay}
            onSelect={toggleDay}
            formatValue={(v) => v.toFixed(1)}
          />
        )}
```

- [ ] **Step 9: Laat de tabel de getoonde registraties gebruiken**

In de tabel staan drie plekken die `entries` gebruiken voor de inhoud:

```tsx
              {!fetching && entries.length === 0 && (
```

wordt:

```tsx
              {!fetching && displayedEntries.length === 0 && (
```

en:

```tsx
              {!fetching && entries.map((entry) => (
```

wordt:

```tsx
              {!fetching && displayedEntries.map((entry) => (
```

De regel met `{entries.length > 0 && (` in de kop blijft op `entries` staan: dat is het maandtotaal naast de titel in lijstmodus.

- [ ] **Step 10: Controleer de typen, de tests en de lint**

Run: `PATH="$HOME/.nvm/versions/node/v20.20.1/bin:$PATH" npx tsc --noEmit`
Expected: 0 fouten.

Run: `PATH="$HOME/.nvm/versions/node/v20.20.1/bin:$PATH" npm test`
Expected: 26 bestanden, 296 tests, groen.

Run: `PATH="$HOME/.nvm/versions/node/v20.20.1/bin:$PATH" npm run lint`
Expected: 326 errors en 20 warnings, gelijk aan de baseline.

- [ ] **Step 11: Commit**

```bash
git add src/components/km/km-entries-client.tsx
git commit -m "feat: weekweergave op het kilometerscherm"
```

---

## Uitrol

Geen migratie, geen schemawijziging, geen API-wijziging. Pushen naar `main` volstaat en Vercel deployt.

Handmatig na te lopen na de deploy:

- [ ] **Het urenscherm ziet er in weekmodus exact uit als voorheen**, inclusief de `vrij`-markering op een vaste vrije dag en de onderstreping van vandaag. Dit is de belangrijkste controle: Task 2 verplaatste werkende code.
- [ ] Het kilometerscherm opent in weekmodus.
- [ ] Klikken op een dag filtert de lijst en zet het datumveld; nogmaals klikken heft het op.
- [ ] Vooruit en terug bladeren haalt de juiste week op, en `Deze week` verschijnt zodra je van de huidige week af bent.
- [ ] In weekmodus zijn de maand- en projectfilters niet zichtbaar; in lijstmodus wel.
- [ ] Als admin: het medewerkerfilter werkt in beide weergaven.
- [ ] Een dag zonder ritten toont `0.0` in gedempte opmaak, en de totaalkolom klopt met de som van de zeven dagen.
- [ ] Een rit invoeren terwijl een dag geselecteerd is → hij verschijnt in het raster en de lijst, en het formulier blijft op die dag staan.
