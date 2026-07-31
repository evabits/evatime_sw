# Report Period Preset Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Vervang de losse Van/Tot-datumvelden in de rapportfilters door een Periode-keuzelijst met vijf standaardperiodes plus "Aangepast", dat de datumvelden alsnog toont.

**Architecture:** Eén pure functie `resolvePeriod(preset, now)` in `src/lib/periods.ts` zet een preset om in een `{ from, to }`-paar van `yyyy-MM-dd`-strings, en geeft `null` voor "custom" zodat de aanroeper de bestaande datums laat staan. De filterkaart krijgt er één statusveld bij (`period`) en toont Van/Tot alleen nog bij "Aangepast". De API verandert niet: de server ontvangt onveranderd `from` en `to`.

**Tech Stack:** Next.js 16 (App Router), React 19, TypeScript, date-fns 4, Radix UI Select, Tailwind 4, vitest.

## Global Constraints

- **Node 20 is vereist.** De standaard-node in deze shell is v16 en daar weigert npm op te draaien. Zet vóór élk npm- of npx-commando de versie: `source ~/.nvm/nvm.sh && nvm use 20 &&`. De `.nvmrc` vraagt om 24, maar die staat niet geïnstalleerd; 20 draait de suite en de linter zonder problemen. Installeer geen andere node-versie.
- **Dit is niet de Next.js die je kent.** Lees `node_modules/next/dist/docs/` voordat je aannames doet over het framework. Clientcomponenten hebben `"use client"` bovenaan nodig.
- **Weken beginnen op maandag.** Overal in deze codebase staat `{ weekStartsOn: 1 }` bij date-fns-weekfuncties. Laat je dat weg, dan valt date-fns terug op zondag en klopt elke weekgrens een dag.
- **Alle zichtbare tekst is Nederlands.** De labels zijn exact: `Periode`, `Deze maand`, `Vorige maand`, `Deze week`, `Vorige week`, `Dit jaar`, `Aangepast`, `Van`, `Tot`.
- **"Dit jaar" loopt tot en met vandaag,** niet tot en met 31 december. Het is bewust de enige preset die geen hele periode dekt.
- Testcommando: `npm test`. Losse suite: `npx vitest run src/lib/periods.test.ts`. Baseline op deze branch: 12 bestanden, 86 tests groen.
- Lint: `npm run lint`. **De baseline is niet schoon:** 304 errors en 22 warnings, vrijwel allemaal `@typescript-eslint/no-explicit-any`, want deze codebase gebruikt `any` overal in props en entry-objecten. De gate is *geen nieuwe soorten lint-fouten*, niet nul. Ruim bestaande fouten niet op.
- `npm run build` kan hier niet draaien: er is geen `.env` en `prisma generate` stopt op een ontbrekende `DATABASE_URL`. Gebruik `npx tsc --noEmit` als vangnet. Die meldt 54 pre-existing fouten; geen daarvan zit in de bestanden van dit plan.
- Tests staan als `src/lib/*.test.ts` en dekken pure functies. Deze repo heeft geen component- of API-tests en die conventie blijft.

---

## File Structure

**Nieuw:**

| Bestand | Verantwoordelijkheid |
|---|---|
| `src/lib/periods.ts` | Presetdefinities, Nederlandse labels, volgorde, en het omzetten van een preset naar een datumbereik. |
| `src/lib/periods.test.ts` | Tests daarvoor, inclusief de jaargrens en de maandag/zondag-randen. |

**Gewijzigd:**

| Bestand | Wijziging |
|---|---|
| `src/components/reports/report-filters.tsx` | `FilterState` krijgt `period`; Van/Tot maken plaats voor een Periode-select en verschijnen alleen bij "Aangepast". |
| `src/components/reports/reports-client.tsx` | Begintoestand krijgt `period: "this-month"` en haalt from/to uit `resolvePeriod` in plaats van uit een eigen date-fns-berekening. |

---

## Task 1: De periode-helper

**Files:**
- Create: `src/lib/periods.ts`
- Test: `src/lib/periods.test.ts`

**Interfaces:**
- Consumes: `date-fns` (al een dependency).
- Produces:
  - `type PeriodPreset = "this-month" | "last-month" | "this-week" | "last-week" | "this-year" | "custom"`
  - `const PERIOD_LABELS: Record<PeriodPreset, string>`
  - `const PERIOD_ORDER: PeriodPreset[]`
  - `resolvePeriod(preset: PeriodPreset, now: Date): { from: string; to: string } | null`

- [ ] **Step 1: Write the failing test**

Create `src/lib/periods.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { resolvePeriod, PERIOD_LABELS, PERIOD_ORDER } from "./periods";

// Woensdag 15 juli 2026. Let op: de lokale constructor, niet new Date("2026-07-15"),
// want die parst als UTC en kan in een andere tijdzone een dag verschuiven.
const wed = new Date(2026, 6, 15);

describe("resolvePeriod", () => {
  it("returns the whole current month", () => {
    expect(resolvePeriod("this-month", wed)).toEqual({ from: "2026-07-01", to: "2026-07-31" });
  });

  it("returns the whole previous month", () => {
    expect(resolvePeriod("last-month", wed)).toEqual({ from: "2026-06-01", to: "2026-06-30" });
  });

  it("returns Monday to Sunday of the current week", () => {
    expect(resolvePeriod("this-week", wed)).toEqual({ from: "2026-07-13", to: "2026-07-19" });
  });

  it("returns Monday to Sunday of the previous week", () => {
    expect(resolvePeriod("last-week", wed)).toEqual({ from: "2026-07-06", to: "2026-07-12" });
  });

  it("returns January 1st up to and including today, not the end of the year", () => {
    expect(resolvePeriod("this-year", wed)).toEqual({ from: "2026-01-01", to: "2026-07-15" });
  });

  it("returns null for custom so the caller keeps its dates", () => {
    expect(resolvePeriod("custom", wed)).toBeNull();
  });
});

describe("resolvePeriod edge cases", () => {
  it("crosses the year boundary for last month and this week", () => {
    // Zaterdag 3 januari 2026: vorige maand is december 2025, en de week
    // begint op maandag 29 december 2025.
    const sat = new Date(2026, 0, 3);
    expect(resolvePeriod("last-month", sat)).toEqual({ from: "2025-12-01", to: "2025-12-31" });
    expect(resolvePeriod("this-week", sat)).toEqual({ from: "2025-12-29", to: "2026-01-04" });
  });

  it("treats a Monday as the first day of its own week", () => {
    const mon = new Date(2026, 6, 13);
    expect(resolvePeriod("this-week", mon)).toEqual({ from: "2026-07-13", to: "2026-07-19" });
  });

  it("treats a Sunday as the last day of the week that started six days earlier", () => {
    // Dit is de test die faalt zodra iemand weekStartsOn weglaat: date-fns
    // valt dan terug op zondag en geeft 2026-07-19 als from.
    const sun = new Date(2026, 6, 19);
    expect(resolvePeriod("this-week", sun)).toEqual({ from: "2026-07-13", to: "2026-07-19" });
  });

  it("does not overflow when the current month is longer than the previous one", () => {
    // 31 maart min een maand is 28 februari; de maandgrenzen moeten februari
    // volledig dekken, niet een geknipt bereik.
    const mar31 = new Date(2026, 2, 31);
    expect(resolvePeriod("last-month", mar31)).toEqual({ from: "2026-02-01", to: "2026-02-28" });
  });
});

describe("PERIOD_ORDER and PERIOD_LABELS", () => {
  it("lists the presets in the order the dropdown shows them", () => {
    expect(PERIOD_ORDER).toEqual([
      "this-month", "last-month", "this-week", "last-week", "this-year", "custom",
    ]);
  });

  it("has a Dutch label for every preset in the order", () => {
    expect(PERIOD_ORDER.map((p) => PERIOD_LABELS[p])).toEqual([
      "Deze maand", "Vorige maand", "Deze week", "Vorige week", "Dit jaar", "Aangepast",
    ]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `source ~/.nvm/nvm.sh && nvm use 20 && npx vitest run src/lib/periods.test.ts`
Expected: FAIL — `Failed to resolve import "./periods"`.

- [ ] **Step 3: Write minimal implementation**

Create `src/lib/periods.ts`:

```ts
import {
  format,
  startOfMonth, endOfMonth, subMonths,
  startOfWeek, endOfWeek, subWeeks,
  startOfYear,
} from "date-fns";

export type PeriodPreset =
  | "this-month"
  | "last-month"
  | "this-week"
  | "last-week"
  | "this-year"
  | "custom";

/** De volgorde waarin de keuzelijst de opties toont. */
export const PERIOD_ORDER: PeriodPreset[] = [
  "this-month",
  "last-month",
  "this-week",
  "last-week",
  "this-year",
  "custom",
];

export const PERIOD_LABELS: Record<PeriodPreset, string> = {
  "this-month": "Deze maand",
  "last-month": "Vorige maand",
  "this-week": "Deze week",
  "last-week": "Vorige week",
  "this-year": "Dit jaar",
  custom: "Aangepast",
};

// Maandag, net als overal elders in deze app.
const WEEK = { weekStartsOn: 1 } as const;

const fmt = (d: Date) => format(d, "yyyy-MM-dd");

/**
 * Zet een preset om in een datumbereik. Geeft null voor "custom", zodat de
 * aanroeper de datums laat staan die de gebruiker zelf heeft ingevuld.
 */
export function resolvePeriod(
  preset: PeriodPreset,
  now: Date,
): { from: string; to: string } | null {
  switch (preset) {
    case "this-month":
      return { from: fmt(startOfMonth(now)), to: fmt(endOfMonth(now)) };
    case "last-month": {
      const ref = subMonths(now, 1);
      return { from: fmt(startOfMonth(ref)), to: fmt(endOfMonth(ref)) };
    }
    case "this-week":
      return { from: fmt(startOfWeek(now, WEEK)), to: fmt(endOfWeek(now, WEEK)) };
    case "last-week": {
      const ref = subWeeks(now, 1);
      return { from: fmt(startOfWeek(ref, WEEK)), to: fmt(endOfWeek(ref, WEEK)) };
    }
    case "this-year":
      // Bewust tot en met vandaag, niet tot en met 31 december.
      return { from: fmt(startOfYear(now)), to: fmt(now) };
    case "custom":
      return null;
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `source ~/.nvm/nvm.sh && nvm use 20 && npx vitest run src/lib/periods.test.ts`
Expected: PASS, 12 tests.

- [ ] **Step 5: Run the whole suite and the linter**

Run: `source ~/.nvm/nvm.sh && nvm use 20 && npm test && npm run lint && npx tsc --noEmit`
Expected: 13 bestanden / 98 tests groen; lint niet boven de 304 baseline-errors; tsc onveranderd op 54 pre-existing fouten, geen in `src/lib/periods.ts`.

- [ ] **Step 6: Commit**

```bash
git add src/lib/periods.ts src/lib/periods.test.ts
git commit -m "feat: period preset helper for the report filters"
```

---

## Task 2: De Periode-keuzelijst in de filterkaart

**Files:**
- Modify: `src/components/reports/report-filters.tsx`
- Modify: `src/components/reports/reports-client.tsx:26-36`

**Interfaces:**
- Consumes: `PeriodPreset`, `PERIOD_LABELS`, `PERIOD_ORDER`, `resolvePeriod` uit Task 1.
- Produces: `FilterState` uit `report-filters.tsx` krijgt een veld `period: PeriodPreset`. Andere componenten geven `FilterState` alleen door en hoeven niets te weten van het nieuwe veld.

- [ ] **Step 1: Breid `FilterState` uit en importeer de helper**

Bovenaan `src/components/reports/report-filters.tsx`, bij de bestaande imports:

```ts
import { resolvePeriod, PERIOD_LABELS, PERIOD_ORDER, type PeriodPreset } from "@/lib/periods";
```

En voeg het veld toe aan het type:

```ts
export type FilterState = {
  period: PeriodPreset;
  from: string;
  to: string;
  customerId: string;
  projectId: string;
  userId: string;
  billable: string;
  tagIds: string[];
  groupByEmployee: boolean;
};
```

- [ ] **Step 2: Voeg de wijzigingshandler toe**

In de component `ReportFilters`, direct onder de bestaande `set`- en `filteredProjects`-regels:

```ts
  function handlePeriodChange(preset: PeriodPreset) {
    const range = resolvePeriod(preset, new Date());
    onChange(range ? { ...value, period: preset, ...range } : { ...value, period: preset });
  }
```

Dat schrijft `period`, `from` en `to` in één `onChange` weg. Bij `"custom"` geeft `resolvePeriod` `null` en blijven `from` en `to` staan zoals ze waren, zodat de velden gevuld openen met wat de vorige preset had gezet in plaats van leeg.

- [ ] **Step 3: Vervang de Van/Tot-velden door de Periode-select**

In de JSX, vervang deze twee blokken — de eerste twee kinderen van de `<div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">`:

```tsx
          <div className="space-y-1">
            <Label>Van</Label>
            <Input type="date" value={value.from} onChange={(e) => set("from", e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label>Tot</Label>
            <Input type="date" value={value.to} onChange={(e) => set("to", e.target.value)} />
          </div>
```

door:

```tsx
          <div className="space-y-1">
            <Label>Periode</Label>
            <Select value={value.period} onValueChange={(v) => handlePeriodChange(v as PeriodPreset)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {PERIOD_ORDER.map((p) => (
                  <SelectItem key={p} value={p}>{PERIOD_LABELS[p]}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {value.period === "custom" && (
            <>
              <div className="space-y-1">
                <Label>Van</Label>
                <Input type="date" value={value.from} onChange={(e) => set("from", e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label>Tot</Label>
                <Input type="date" value={value.to} onChange={(e) => set("to", e.target.value)} />
              </div>
            </>
          )}
```

De `Input`-import blijft dus in gebruik. De grid heeft zes velden bij een preset en acht bij "Aangepast"; met `sm:grid-cols-2 lg:grid-cols-3` loopt dat vanzelf door.

- [ ] **Step 4: Zet de begintoestand in `reports-client.tsx`**

Vervang in `src/components/reports/reports-client.tsx` de regels 26-36 — `const now = new Date();` tot en met het sluiten van de `useState`-aanroep — door:

```tsx
  const [filters, setFilters] = useState<FilterState>(() => {
    const range = resolvePeriod("this-month", new Date())!;
    return {
      period: "this-month",
      from: range.from,
      to: range.to,
      customerId: "",
      projectId: "",
      userId: "",
      billable: "",
      tagIds: [],
      groupByEmployee: false,
    };
  });
```

De lazy vorm van `useState` zorgt dat `new Date()` één keer draait in plaats van bij elke render.

Pas daarna de imports bovenaan aan. Regel 3 is:

```ts
import { format, startOfMonth, endOfMonth } from "date-fns";
```

Die drie werden uitsluitend gebruikt voor de begin-datums die je zojuist hebt vervangen — verwijder de hele regel. Voeg toe:

```ts
import { resolvePeriod } from "@/lib/periods";
```

Controleer met een zoekactie op `format(`, `startOfMonth` en `endOfMonth` in dat bestand dat er echt geen gebruik meer over is voordat je de import weghaalt; een ongebruikte import is een lint-warning, maar een verwijderde import die nog gebruikt wordt breekt de build.

- [ ] **Step 5: Draai de suite, de linter en tsc**

Run: `source ~/.nvm/nvm.sh && nvm use 20 && npm test && npm run lint && npx tsc --noEmit`
Expected: 13 bestanden / 98 tests groen; lint niet boven 304 errors; tsc onveranderd op 54 pre-existing fouten, geen in de twee gewijzigde bestanden.

- [ ] **Step 6: Commit**

```bash
git add src/components/reports/report-filters.tsx src/components/reports/reports-client.tsx
git commit -m "feat: period preset dropdown replaces the report date fields"
```

- [ ] **Step 7: Handmatig na te lopen door een mens**

Je kunt zelf niet inloggen, dus voer dit niet uit en claim het niet. Noteer het in je rapport als openstaand:

- `/reports` opent op "Deze maand" en levert hetzelfde rapport als voorheen.
- Elke preset kiezen en op "Rapport ophalen" klikken geeft het verwachte bereik; de Van/Tot-velden zijn niet zichtbaar.
- "Aangepast" kiezen laat Van en Tot verschijnen, gevuld met de datums van de vorige keuze, en die zijn daarna vrij aan te passen.
- Van "Aangepast" terugschakelen naar een preset verbergt de velden weer en overschrijft de handmatige datums.

---

## Verificatie na afloop

- [ ] `npm test` — 98 tests groen over 13 bestanden.
- [ ] `npm run lint` — niet meer errors dan de 304 van de baseline.
- [ ] `npx tsc --noEmit` — 54 pre-existing fouten, geen nieuwe.
- [ ] De handmatige lijst uit Task 2, Step 7 door een mens laten aflopen.
