# Kwartieruren Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Een van-tot invulhulp bij het boeken van uren, en elk urengetal dat een mens invoert afdwingen op een veelvoud van 0,25.

**Architecture:** Eén nieuw bestandje `src/lib/quarter-hours.ts` met twee pure functies — `isQuarter` en `hoursBetween` — dat de enige bron van waarheid is voor beide regels. De vier API-routes gebruiken `isQuarter` in een zod-`refine`, de twee schermen gebruiken hem om de gebruiker niet op een servermelding te laten wachten, en `splitHoursOverDays` gaat in kwartiereenheden rekenen zodat verlofregels dezelfde regel volgen. Er verandert niets aan het datamodel: van-tot wordt niet opgeslagen.

**Tech Stack:** Next.js 16 (App Router), React 19, TypeScript, Prisma 6 + PostgreSQL, zod 3, react-hook-form, Radix UI, vitest.

## Global Constraints

- **Node 20 is vereist.** De standaard-node in deze shell is v16 en de toolchain crasht daarop. Node 20 staat op `~/.nvm/versions/node/v20.20.1/bin`.
- **Er is een live PRODUCTIEDATABASE bereikbaar via `.env.local`.** Dit traject raakt het datamodel niet: er is geen `prisma`-commando nodig, geen migratie, geen `db:push`, geen backfill. Draai ze niet.
- **Dit is niet de Next.js die je kent.** Lees `node_modules/next/dist/docs/` voordat je aannames doet. (`AGENTS.md` is een echte, door het team gecommitte projectafspraak.)
- **Alle zichtbare tekst is Nederlands.** De weigering luidt overal exact `Uren moeten in stappen van 15 minuten (0,25 uur)` en komt uit één gedeelde constante, zodat scherm en server nooit iets anders zeggen.
- **Afwijzen, nooit stilzwijgend afronden.** Uren worden gefactureerd. De enige plek waar wél afgerond wordt is `hoursBetween`, op twee decimalen, omdat dat een berekening is en geen invoer.
- Uren zijn `Decimal(5,2)` op `TimeEntry` en `Decimal(4,2)` op de verlofkolommen — **twee decimalen**. Elk veelvoud van 0,25 past daar exact in.
- Testcommando: `npm test`. Baseline: **22 bestanden, 229 tests groen.**
- Lint: `npm run lint`. **De baseline is niet schoon:** 323 errors en 20 warnings, vrijwel allemaal `@typescript-eslint/no-explicit-any`. De gate is *geen nieuwe soorten lint-fouten*.
- **`npx tsc --noEmit` meldt 0 fouten over de hele repo en moet dat blijven doen.**
- `npm run build` kan niet draaien zonder `.env`; gebruik `tsc` als vangnet.
- Testconventie: uitsluitend pure functies in `src/lib/*.test.ts` met vitest. Er bestaan geen component- of API-tests en die worden hier niet geïntroduceerd.
- Een zod-fout uit een route komt bij de client aan als `{ error: "Validation failed", issues: [...] }` met status 400 — een generieke tekst. Daarom staat de leesbare melding op het scherm en is de server de garantie, niet de uitleg.

---

## File Structure

**Nieuw:**

| Bestand | Wat |
|---|---|
| `src/lib/quarter-hours.ts` | `QUARTER`, `NOT_A_QUARTER`, `isQuarter`, `hoursBetween`. |
| `src/lib/quarter-hours.test.ts` | Tests daarvoor. |

**Gewijzigd:**

| Bestand | Wat |
|---|---|
| `src/lib/absence-entries.ts` | `splitHoursOverDays` rekent in kwartieren. |
| `src/lib/absence-entries.test.ts` | Twee bestaande tests volgen die wijziging. |
| `src/app/api/time/route.ts` | `refine(isQuarter)` op `hours`. |
| `src/app/api/time/[id]/route.ts` | Idem. |
| `src/app/api/absence-requests/route.ts` | Idem op `hours` en op de vijf patroonwaarden. |
| `src/app/api/absence-requests/[id]/route.ts` | Idem. |
| `src/components/time/time-entries-client.tsx` | Van-tot velden, en `refine` in het formulier-schema. |
| `src/components/reports/entry-edit-dialog.tsx` | Kwartiercontrole in `validate()`. |
| `src/components/vacation/absence-client.tsx` | `step="0.5"` wordt `step="0.25"`. |

Alleen `quarter-hours.ts` is nieuw. Het is bewust een eigen bestandje en geen toevoeging aan `utils.ts`: het wordt door negen plekken gebruikt en heeft één onderwerp.

---

## Task 1: De kwartierhelper

**Files:**
- Create: `src/lib/quarter-hours.ts`
- Test: `src/lib/quarter-hours.test.ts`

**Interfaces:**
- Produces: `QUARTER: number` (0.25), `NOT_A_QUARTER: string`, `isQuarter(hours: number): boolean`, `hoursBetween(from: string, to: string): number | null`. Alle vier worden door Task 2 tot en met 5 gebruikt.

- [ ] **Step 1: Schrijf de falende test**

Maak `src/lib/quarter-hours.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { isQuarter, hoursBetween } from "./quarter-hours";

describe("isQuarter", () => {
  it("accepts whole hours", () => {
    expect(isQuarter(8)).toBe(true);
  });

  it("accepts every quarter within an hour", () => {
    expect(isQuarter(0.25)).toBe(true);
    expect(isQuarter(0.5)).toBe(true);
    expect(isQuarter(0.75)).toBe(true);
  });

  it("accepts a large value that is still a quarter", () => {
    expect(isQuarter(416.25)).toBe(true);
  });

  it("rejects a tenth of an hour", () => {
    expect(isQuarter(1.3)).toBe(false);
  });

  it("rejects the values an even split used to produce", () => {
    // 10 uur over 3 dagen leverde vroeger 3.33 en 3.34 op.
    expect(isQuarter(3.33)).toBe(false);
    expect(isQuarter(3.34)).toBe(false);
  });

  it("accepts zero, so a pattern day of nought is not a validation error", () => {
    expect(isQuarter(0)).toBe(true);
  });

  it("rejects values that are not finite", () => {
    expect(isQuarter(NaN)).toBe(false);
    expect(isQuarter(Infinity)).toBe(false);
  });

  it("does not trip over floating-point noise", () => {
    // 0.1 + 0.2 is 0.30000000000000004 en hoort gewoon geweigerd te worden,
    // maar een som van kwartieren die net naast de waarde landt niet.
    expect(isQuarter(0.1 + 0.2)).toBe(false);
    expect(isQuarter(2.75 + 2.75 + 2.5)).toBe(true);
  });
});

describe("hoursBetween", () => {
  it("counts a quarter of an hour", () => {
    expect(hoursBetween("09:00", "09:15")).toBe(0.25);
  });

  it("counts a morning", () => {
    expect(hoursBetween("09:00", "12:15")).toBe(3.25);
  });

  it("counts a whole working day", () => {
    expect(hoursBetween("09:00", "17:00")).toBe(8);
  });

  it("refuses an end time before the start", () => {
    expect(hoursBetween("17:00", "09:00")).toBe(null);
  });

  it("refuses an end time equal to the start", () => {
    expect(hoursBetween("09:00", "09:00")).toBe(null);
  });

  it("refuses a missing or malformed time", () => {
    expect(hoursBetween("", "17:00")).toBe(null);
    expect(hoursBetween("09:00", "")).toBe(null);
    expect(hoursBetween("9:00", "17:00")).toBe(null);
    expect(hoursBetween("25:00", "26:00")).toBe(null);
    expect(hoursBetween("09:60", "10:00")).toBe(null);
  });

  it("rounds to two decimals so the value fits the hours column", () => {
    // Tien over negen tot twaalf uur is 170 minuten: 2.8333... uur. Dat is geen
    // kwartier en wordt verderop geweigerd, maar het veld moet er niet
    // 2.8333333333333335 in zetten.
    expect(hoursBetween("09:10", "12:00")).toBe(2.83);
  });
});
```

- [ ] **Step 2: Draai de test en stel vast dat hij faalt**

Run: `PATH="$HOME/.nvm/versions/node/v20.20.1/bin:$PATH" npx vitest run src/lib/quarter-hours.test.ts`
Expected: FAIL — `Failed to resolve import "./quarter-hours"`.

- [ ] **Step 3: Schrijf de implementatie**

Maak `src/lib/quarter-hours.ts`:

```ts
/**
 * Uren gaan in stappen van een kwartier.
 *
 * Dit bestand is de enige plek waar die regel staat. Hij geldt op vier
 * API-routes en op drie schermen, en als de schermen iets anders zouden
 * rekenen dan de server, dan zou de gebruiker een melding krijgen die nergens
 * op slaat — of erger, er géén krijgen terwijl zijn invoer stilletjes sneuvelt.
 */

/** Eén kwartier, in uren. */
export const QUARTER = 0.25;

/** De weigering. Server en scherm zeggen letterlijk hetzelfde. */
export const NOT_A_QUARTER = "Uren moeten in stappen van 15 minuten (0,25 uur)";

/**
 * Of een urengetal op een kwartier valt.
 *
 * Nul telt mee: een weekpatroon mag een dag op nul zetten, en dat is geen
 * invoerfout maar "die dag niet".
 *
 * Er wordt in kwartiereenheden gerekend in plaats van met `hours % 0.25`,
 * omdat een modulo op floating point net naast nul kan landen. De marge vangt
 * waarden op die uit een som van kwartieren komen; een echte tiende van een uur
 * ligt daar ruim buiten.
 */
export function isQuarter(hours: number): boolean {
  if (!Number.isFinite(hours)) return false;
  const units = hours / QUARTER;
  return Math.abs(units - Math.round(units)) < 1e-9;
}

/**
 * Het aantal uren tussen twee tijdstippen op dezelfde dag, beide als `HH:MM`.
 *
 * Geeft `null` wanneer een van beide ontbreekt, onleesbaar is, of de eindtijd
 * niet ná de begintijd ligt. Een dienst over middernacht bestaat hier niet, dus
 * een omgekeerd paar is altijd een typefout en nooit een nachtdienst.
 *
 * Het resultaat wordt afgerond op twee decimalen omdat het in een
 * `Decimal(5,2)`-kolom belandt. Een tijdvak dat op een kwartier uitkomt is
 * daarmee exact; een tijdvak dat dat niet doet levert een getal op dat verderop
 * door `isQuarter` geweigerd wordt, en dat is de bedoeling.
 */
export function hoursBetween(from: string, to: string): number | null {
  const begin = minutenOpDeDag(from);
  const eind = minutenOpDeDag(to);
  if (begin === null || eind === null || eind <= begin) return null;
  return Math.round(((eind - begin) / 60) * 100) / 100;
}

function minutenOpDeDag(waarde: string): number | null {
  const m = /^(\d{2}):(\d{2})$/.exec(waarde);
  if (!m) return null;
  const uren = Number(m[1]);
  const minuten = Number(m[2]);
  if (uren > 23 || minuten > 59) return null;
  return uren * 60 + minuten;
}
```

- [ ] **Step 4: Draai de test en stel vast dat hij slaagt**

Run: `PATH="$HOME/.nvm/versions/node/v20.20.1/bin:$PATH" npx vitest run src/lib/quarter-hours.test.ts`
Expected: PASS, 15 tests.

- [ ] **Step 5: Commit**

```bash
git add src/lib/quarter-hours.ts src/lib/quarter-hours.test.ts
git commit -m "feat: kwartierregel en van-tot berekening als pure functies"
```

---

## Task 2: `splitHoursOverDays` in kwartieren

**Files:**
- Modify: `src/lib/absence-entries.ts`
- Modify: `src/lib/absence-entries.test.ts`

**Interfaces:**
- Consumes: `QUARTER` uit Task 1.
- Produces: `splitHoursOverDays(totalHours: number, days: string[])` houdt dezelfde signatuur, maar geeft voortaan uitsluitend veelvouden van 0,25 terug en laat dagen zonder kwartier wég in plaats van er een regel van nul uur voor te maken.

- [ ] **Step 1: Pas de twee tests aan die met het oude gedrag meelopen**

In `src/lib/absence-entries.test.ts`, vervang de test `puts the remainder on the last day`:

```ts
  it("puts the remainder on the last day", () => {
    // 10 / 3 does not divide into two decimals; the last day absorbs the rest.
    expect(splitHoursOverDays(10, ["2026-08-03", "2026-08-04", "2026-08-05"])).toEqual([
      { date: "2026-08-03", hours: 3.33 },
      { date: "2026-08-04", hours: 3.33 },
      { date: "2026-08-05", hours: 3.34 },
    ]);
  });
```

door:

```ts
  it("spreads the leftover quarters over the first days", () => {
    // 10 uur is 40 kwartieren; 40 / 3 is 13 kwartieren met 1 over, en die gaat
    // naar de eerste dag. Niet naar de laatste: dan zou de laatste dag van een
    // lange periode structureel de vreemde eend zijn.
    expect(splitHoursOverDays(10, ["2026-08-03", "2026-08-04", "2026-08-05"])).toEqual([
      { date: "2026-08-03", hours: 3.5 },
      { date: "2026-08-04", hours: 3.25 },
      { date: "2026-08-05", hours: 3.25 },
    ]);
  });
```

En vervang de test `always sums to exactly the requested total`:

```ts
  it("always sums to exactly the requested total", () => {
    // The property that matters: an approval must never quietly book more or
    // fewer hours than the employee asked for.
    for (const totaal of [40, 10, 7.5, 1, 36.4, 13.33]) {
      expect(totaalInCenten(splitHoursOverDays(totaal, week))).toBe(Math.round(totaal * 100));
    }
  });
```

door:

```ts
  it("always sums to exactly the requested total", () => {
    // The property that matters: an approval must never quietly book more or
    // fewer hours than the employee asked for.
    //
    // De lijst bevat alleen kwartiertotalen, want dat is wat de invoercontrole
    // voortaan doorlaat. 36,4 en 13,33 stonden hier vroeger ook in; die kunnen
    // per definitie niet in kwartieren opgaan.
    for (const totaal of [40, 10, 7.5, 1, 36.25, 13.75, 0.25]) {
      expect(totaalInCenten(splitHoursOverDays(totaal, week))).toBe(Math.round(totaal * 100));
    }
  });
```

- [ ] **Step 2: Voeg de tests toe voor het nieuwe gedrag**

Voeg in `src/lib/absence-entries.test.ts` toe, direct ná de test `always sums to exactly the requested total` en binnen hetzelfde `describe("splitHoursOverDays", ...)`:

```ts
  it("only ever produces quarters", () => {
    for (const totaal of [40, 10, 7.5, 1, 36.25, 13.75]) {
      for (const regel of splitHoursOverDays(totaal, week)) {
        expect(isQuarter(regel.hours)).toBe(true);
      }
    }
  });

  it("skips days that do not get a quarter instead of booking nought hours", () => {
    // Eén uur over vijf dagen is vier kwartieren. De vijfde dag krijgt niets en
    // hoort dan geen urenregel op te leveren.
    expect(splitHoursOverDays(1, week)).toEqual([
      { date: "2026-08-03", hours: 0.25 },
      { date: "2026-08-04", hours: 0.25 },
      { date: "2026-08-05", hours: 0.25 },
      { date: "2026-08-06", hours: 0.25 },
    ]);
  });

  it("rounds a legacy total that is not a quarter to the nearest one", () => {
    // Kan alleen bij aanvragen die al in productie stonden voordat de
    // kwartierregel ging gelden. 3,30 wordt 13 kwartieren, dus 3,25.
    expect(totaalInCenten(splitHoursOverDays(3.3, ["2026-08-03"]))).toBe(325);
  });
```

En breid de import bovenaan datzelfde bestand uit:

```ts
import { ABSENCE_PROJECT_NAMES, splitHoursOverDays } from "./absence-entries";
```

wordt:

```ts
import { ABSENCE_PROJECT_NAMES, splitHoursOverDays } from "./absence-entries";
import { isQuarter } from "./quarter-hours";
```

- [ ] **Step 3: Draai de tests en stel vast dat ze falen**

Run: `PATH="$HOME/.nvm/versions/node/v20.20.1/bin:$PATH" npx vitest run src/lib/absence-entries.test.ts`
Expected: FAIL. `spreads the leftover quarters over the first days` verwacht 3.5/3.25/3.25 en krijgt 3.33/3.33/3.34; `only ever produces quarters` en `skips days that do not get a quarter` falen ook.

- [ ] **Step 4: Schrijf de implementatie**

In `src/lib/absence-entries.ts`, vervang de hele functie `splitHoursOverDays` inclusief zijn commentaarblok:

```ts
/**
 * Verdeelt het totaal van een aanvraag over de gegeven dagen.
 *
 * Elke dag behalve de laatste krijgt het totaal gedeeld door het aantal dagen,
 * naar BENEDEN afgerond op twee decimalen; de laatste dag krijgt het totaal
 * minus de som van de voorgaande. Daarmee is de som exact het aangevraagde
 * totaal — een goedkeuring mag nooit stilzwijgend meer of minder uren boeken
 * dan de medewerker opgaf.
 *
 * Twee decimalen omdat `TimeEntry.hours` een `Decimal(5,2)` is. Fijner afronden
 * laat de database alsnog afkappen en de dagsom stil afwijken.
 */
export function splitHoursOverDays(
  totalHours: number,
  days: string[],
): Array<{ date: string; hours: number }> {
  if (days.length === 0) return [];

  const perDag = Math.floor((totalHours / days.length) * 100) / 100;
  const regels = days.slice(0, -1).map((date) => ({ date, hours: perDag }));
  const rest = Math.round((totalHours - perDag * (days.length - 1)) * 100) / 100;
  regels.push({ date: days[days.length - 1], hours: rest });
  return regels;
}
```

door:

```ts
/**
 * Verdeelt het totaal van een aanvraag over de gegeven dagen, in kwartieren.
 *
 * Er wordt in hele kwartiereenheden gerekend en niet in centen: daardoor is elk
 * getal dat hieruit komt per constructie een kwartier, net als elk urengetal dat
 * een mens zelf invoert. De eerste dagen krijgen het restje erbij, niet de
 * laatste — bij een lange periode zou de laatste dag anders structureel de
 * vreemde eend zijn.
 *
 * De som is exact het aangevraagde totaal zolang dat totaal zelf een kwartier
 * is, en dat bewaakt de invoercontrole aan de voorkant. Een oude aanvraag van
 * vóór die regel wordt op het dichtstbijzijnde kwartier afgerond; dat scheelt
 * hooguit 7½ minuut en alleen bij wat er al stond.
 *
 * Een dag die geen kwartier krijgt levert geen urenregel op. Een regel van nul
 * uur boeken heeft geen betekenis, en `patternedEntries` doet hetzelfde voor
 * dagen waarop het patroon nul staat.
 */
export function splitHoursOverDays(
  totalHours: number,
  days: string[],
): Array<{ date: string; hours: number }> {
  if (days.length === 0) return [];

  const units = Math.round(totalHours / QUARTER);
  const basis = Math.floor(units / days.length);
  const rest = units % days.length;

  return days
    .map((date, i) => ({ date, hours: (basis + (i < rest ? 1 : 0)) * QUARTER }))
    .filter((r) => r.hours > 0);
}
```

Breid de import bovenaan `src/lib/absence-entries.ts` uit:

```ts
import { workingDaysBetween } from "./working-days";
import { scheduledHoursOn, type WeekSchedule } from "./work-schedule";
```

wordt:

```ts
import { workingDaysBetween } from "./working-days";
import { scheduledHoursOn, type WeekSchedule } from "./work-schedule";
import { QUARTER } from "./quarter-hours";
```

- [ ] **Step 5: Draai de tests en stel vast dat ze slagen**

Run: `PATH="$HOME/.nvm/versions/node/v20.20.1/bin:$PATH" npx vitest run src/lib/absence-entries.test.ts`
Expected: PASS, 21 tests.

- [ ] **Step 6: Draai de volledige suite**

Run: `PATH="$HOME/.nvm/versions/node/v20.20.1/bin:$PATH" npm test`
Expected: 23 bestanden, 247 tests, groen.

- [ ] **Step 7: Commit**

```bash
git add src/lib/absence-entries.ts src/lib/absence-entries.test.ts
git commit -m "feat: verlofregels worden in kwartieren over de dagen verdeeld"
```

---

## Task 3: De servergrens

**Files:**
- Modify: `src/app/api/time/route.ts`
- Modify: `src/app/api/time/[id]/route.ts`
- Modify: `src/app/api/absence-requests/route.ts`
- Modify: `src/app/api/absence-requests/[id]/route.ts`

**Interfaces:**
- Consumes: `isQuarter` en `NOT_A_QUARTER` uit Task 1.

**Deze taak levert geen unittests op.** Het is zod-configuratie; de logica erachter is in Task 1 getest.

- [ ] **Step 1: `POST /api/time`**

In `src/app/api/time/route.ts`, voeg toe bij de imports:

```ts
import { isQuarter, NOT_A_QUARTER } from "@/lib/quarter-hours";
```

Wijzig in `const schema` de regel:

```ts
  hours: z.number().positive(),
```

naar:

```ts
  hours: z.number().positive().refine(isQuarter, NOT_A_QUARTER),
```

- [ ] **Step 2: `PUT /api/time/[id]`**

In `src/app/api/time/[id]/route.ts`, voeg toe bij de imports:

```ts
import { isQuarter, NOT_A_QUARTER } from "@/lib/quarter-hours";
```

Wijzig in `const schema` de regel:

```ts
  hours: z.number().positive(),
```

naar:

```ts
  hours: z.number().positive().refine(isQuarter, NOT_A_QUARTER),
```

- [ ] **Step 3: `POST /api/absence-requests`**

In `src/app/api/absence-requests/route.ts`, voeg toe bij de imports:

```ts
import { isQuarter, NOT_A_QUARTER } from "@/lib/quarter-hours";
```

Wijzig `const patternSchema` van:

```ts
const patternSchema = z.object({
  monday: z.number().min(0).max(24),
  tuesday: z.number().min(0).max(24),
  wednesday: z.number().min(0).max(24),
  thursday: z.number().min(0).max(24),
  friday: z.number().min(0).max(24),
});
```

naar:

```ts
// De vijf waarden zijn urenregistratie zodra de aanvraag goedgekeurd wordt, dus
// ze vallen onder dezelfde kwartierregel. Nul mag: dat betekent "die dag niet".
const patroonUren = z.number().min(0).max(24).refine(isQuarter, NOT_A_QUARTER);

const patternSchema = z.object({
  monday: patroonUren,
  tuesday: patroonUren,
  wednesday: patroonUren,
  thursday: patroonUren,
  friday: patroonUren,
});
```

Wijzig in `createSchema` de regel:

```ts
  hours: z.number().positive(),
```

naar:

```ts
  hours: z.number().positive().refine(isQuarter, NOT_A_QUARTER),
```

- [ ] **Step 4: `PUT /api/absence-requests/[id]`**

In `src/app/api/absence-requests/[id]/route.ts`, voeg toe bij de imports:

```ts
import { isQuarter, NOT_A_QUARTER } from "@/lib/quarter-hours";
```

Vervang het hele `employeeUpdateSchema`:

```ts
const employeeUpdateSchema = z.object({
  type: z.enum(["VACATION", "SICK", "PARENTAL_LEAVE", "SPECIAL_LEAVE", "UNPAID_LEAVE"]).optional(),
  startDate: z.string(),
  endDate: z.string(),
  hours: z.number().positive(),
  description: z.string().optional(),
  pattern: z.object({
    monday: z.number().min(0).max(24),
    tuesday: z.number().min(0).max(24),
    wednesday: z.number().min(0).max(24),
    thursday: z.number().min(0).max(24),
    friday: z.number().min(0).max(24),
  }).nullable().optional(),
});
```

door:

```ts
const patroonUren = z.number().min(0).max(24).refine(isQuarter, NOT_A_QUARTER);

const employeeUpdateSchema = z.object({
  type: z.enum(["VACATION", "SICK", "PARENTAL_LEAVE", "SPECIAL_LEAVE", "UNPAID_LEAVE"]).optional(),
  startDate: z.string(),
  endDate: z.string(),
  hours: z.number().positive().refine(isQuarter, NOT_A_QUARTER),
  description: z.string().optional(),
  pattern: z.object({
    monday: patroonUren,
    tuesday: patroonUren,
    wednesday: patroonUren,
    thursday: patroonUren,
    friday: patroonUren,
  }).nullable().optional(),
});
```

- [ ] **Step 5: Controleer dat de goedkeuringstak ongemoeid is**

Run: `git diff "src/app/api/absence-requests/[id]/route.ts"`

Stel met eigen ogen vast dat `adminUpdateSchema` en het blok onder `if (isAdmin(role) && "status" in body)` niet zijn gewijzigd. Goedkeuren stuurt alleen een status mee en mag niet op uren stuklopen; het afgeleide totaal van een patroonaanvraag komt uit `patternSummary` en is een som van kwartieren, dus per constructie zelf een kwartier. Meld in je rapport wat je vaststelde.

- [ ] **Step 6: Controleer de typen en de tests**

Run: `PATH="$HOME/.nvm/versions/node/v20.20.1/bin:$PATH" npx tsc --noEmit`
Expected: 0 fouten.

Run: `PATH="$HOME/.nvm/versions/node/v20.20.1/bin:$PATH" npm test`
Expected: 23 bestanden, 247 tests, groen.

- [ ] **Step 7: Commit**

```bash
git add src/app/api/time/route.ts "src/app/api/time/[id]/route.ts" src/app/api/absence-requests/route.ts "src/app/api/absence-requests/[id]/route.ts"
git commit -m "feat: server weigert uren die niet op een kwartier vallen"
```

---

## Task 4: Van-tot in het urenformulier

**Files:**
- Modify: `src/components/time/time-entries-client.tsx`

**Interfaces:**
- Consumes: `isQuarter`, `NOT_A_QUARTER` en `hoursBetween` uit Task 1.

**Deze taak levert geen unittests op.** Het rekenwerk zit in Task 1; wat hier bijkomt is formuliertoestand, en de repo heeft geen componenttests.

- [ ] **Step 1: Voeg de import toe en scherp het formulier-schema aan**

Voeg bovenaan `src/components/time/time-entries-client.tsx` toe bij de imports:

```ts
import { isQuarter, NOT_A_QUARTER, hoursBetween } from "@/lib/quarter-hours";
```

Wijzig in `const schema` de regel:

```ts
  hours: z.coerce.number().positive("Moet positief zijn"),
```

naar:

```ts
  hours: z.coerce.number().positive("Moet positief zijn").refine(isQuarter, NOT_A_QUARTER),
```

Daarmee blokkeert react-hook-form het verzenden en verschijnt de melding onder het urenveld, dat de bestaande `errors.hours`-regel al toont.

- [ ] **Step 2: Voeg de toestand voor de twee tijden toe**

De tijden horen niet in het zod-schema: ze worden niet verzonden en niet opgeslagen. Zoek de regel waar het formulier gedeclareerd wordt:

```tsx
  const form = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: { date: today, userId },
  });
```

en voeg daaronder toe:

```tsx
  // Van-tot is invoerhulp en geen veld: het wordt niet meegestuurd en niet
  // opgeslagen. Daarom losse toestand naast het formulier in plaats van in het
  // zod-schema.
  const [vanTijd, setVanTijd] = useState("");
  const [totTijd, setTotTijd] = useState("");
  const tijdvak = hoursBetween(vanTijd, totTijd);
  const tijdvakFout = vanTijd !== "" && totTijd !== "" && tijdvak === null;
```

`useState` staat al in de React-import bovenaan dit bestand; er hoeft niets aan die regel te veranderen.

- [ ] **Step 3: Schrijf het berekende aantal uren in het urenveld**

Voeg direct ónder het blok uit Step 2 toe:

```tsx
  useEffect(() => {
    if (tijdvak === null) return;
    form.setValue("hours", tijdvak, { shouldValidate: true });
  }, [tijdvak, form]);
```

`shouldValidate: true` zorgt dat een tijdvak dat geen kwartier is — 09:10 tot 12:00 — meteen de melding onder het urenveld laat zien in plaats van pas bij het verzenden.

`useEffect` staat al in diezelfde React-import; ook daar hoeft niets aan te veranderen.

- [ ] **Step 4: Maak de velden leeg bij het openen en na het opslaan**

In `startEdit` staat:

```tsx
  function startEdit(entry: any) {
    setEditing(entry.id);
    setSelectedCustomerId(entry.project?.customer?.id ?? "");
    form.reset({
```

Voeg direct ná `setEditing(entry.id);` toe:

```tsx
    // De tijden zijn niet opgeslagen, dus bij het bewerken van een bestaande
    // regel is er niets om te tonen. Leeg laten is eerlijker dan gokken.
    setVanTijd("");
    setTotTijd("");
```

Er zijn nog drie plekken die het formulier leegmaken. **Twee ervan zijn woordelijk
identiek**, dus zoek ze op hun omringende regels en niet op de regel zelf — een
zoek-en-vervang op de losse regel raakt de verkeerde.

*Plek 1 — in `onSubmit`, in de tak die een bewerking opslaat:*

```tsx
        if (res.ok) {
          setEditing(null);
          form.reset({ date: selectedDay ?? today, userId });
```

wordt:

```tsx
        if (res.ok) {
          setEditing(null);
          form.reset({ date: selectedDay ?? today, userId });
          setVanTijd("");
          setTotTijd("");
```

*Plek 2 — in `onSubmit`, in de tak die een nieuwe regel toevoegt:*

```tsx
          form.reset({ date: data.date, userId: data.userId ?? userId });
          if (switchedFilter) {
```

wordt:

```tsx
          form.reset({ date: data.date, userId: data.userId ?? userId });
          setVanTijd("");
          setTotTijd("");
          if (switchedFilter) {
```

*Plek 3 — de annuleerknop, verderop in de JSX. Herkenbaar aan de `onClick` waarin
de reset de láátste regel is:*

```tsx
                <Button type="button" variant="outline" onClick={() => {
                  setEditing(null);
                  setSelectedCustomerId("");
                  form.reset({ date: selectedDay ?? today, userId });
                }}>Annuleren</Button>
```

wordt:

```tsx
                <Button type="button" variant="outline" onClick={() => {
                  setEditing(null);
                  setSelectedCustomerId("");
                  form.reset({ date: selectedDay ?? today, userId });
                  setVanTijd("");
                  setTotTijd("");
                }}>Annuleren</Button>
```

Controleer na afloop met `grep -n "setVanTijd(\"\")" src/components/time/time-entries-client.tsx`
dat er vier plekken zijn: deze drie plus die uit `startEdit`.

- [ ] **Step 5: Voeg de twee velden toe aan het formulier**

Zoek het urenveld:

```tsx
            <div className="space-y-2">
              <Label>Uren *</Label>
              <Input type="number" step="0.25" min="0.25" placeholder="1.5" {...form.register("hours")} />
              {form.formState.errors.hours && <p className="text-xs text-destructive">{form.formState.errors.hours.message}</p>}
            </div>
```

Vervang dat hele blok door:

```tsx
            <div className="space-y-2">
              <Label>Van — tot</Label>
              <div className="flex items-center gap-2">
                {/* step={900} is de native kwartierstap: de browser levert de
                    keuze-UI en de validatie, dus hier komt geen tijdbibliotheek
                    aan te pas. */}
                <Input
                  type="time"
                  step={900}
                  value={vanTijd}
                  onChange={(e) => setVanTijd(e.target.value)}
                  className="w-32"
                />
                <span className="text-muted-foreground">—</span>
                <Input
                  type="time"
                  step={900}
                  value={totTijd}
                  onChange={(e) => setTotTijd(e.target.value)}
                  className="w-32"
                />
              </div>
              {tijdvakFout ? (
                <p className="text-xs text-destructive">De eindtijd moet ná de begintijd liggen</p>
              ) : (
                <p className="text-xs text-muted-foreground">Optioneel — vult het aantal uren voor u in</p>
              )}
            </div>

            <div className="space-y-2">
              <Label>Uren *</Label>
              <Input type="number" step="0.25" min="0.25" placeholder="1.5" {...form.register("hours")} />
              {form.formState.errors.hours && <p className="text-xs text-destructive">{form.formState.errors.hours.message}</p>}
            </div>
```

- [ ] **Step 6: Controleer de typen**

Run: `PATH="$HOME/.nvm/versions/node/v20.20.1/bin:$PATH" npx tsc --noEmit`
Expected: 0 fouten.

- [ ] **Step 7: Controleer dat het formulier zonder tijden werkt zoals het werkte**

Run: `git diff src/components/time/time-entries-client.tsx`

Loop de diff langs en stel per wijziging vast wat er gebeurt als beide tijdvelden leeg zijn: `hoursBetween` geeft dan `null`, de `useEffect` doet niets, `tijdvakFout` is `false`, en het urenveld gedraagt zich precies zoals nu. Stel ook vast dat de tijden nergens in `payload` terechtkomen — ze zitten niet in `FormData` en `onSubmit` spreidt alleen `data`. Meld in je rapport wat je vaststelde.

- [ ] **Step 8: Commit**

```bash
git add src/components/time/time-entries-client.tsx
git commit -m "feat: uren invullen met een van-tot tijdvak"
```

---

## Task 5: De twee overige schermen

**Files:**
- Modify: `src/components/reports/entry-edit-dialog.tsx`
- Modify: `src/components/vacation/absence-client.tsx`

**Interfaces:**
- Consumes: `isQuarter` en `NOT_A_QUARTER` uit Task 1.

**Deze taak levert geen unittests op.** Het zijn twee formuliercontroles.

- [ ] **Step 1: Kwartiercontrole in het admin-bewerkscherm**

In `src/components/reports/entry-edit-dialog.tsx`, voeg toe bij de imports:

```ts
import { isQuarter, NOT_A_QUARTER } from "@/lib/quarter-hours";
```

In `validate()` staat:

```ts
      if (kind === "time" && !(Number(form.hours) > 0)) return "Uren moet groter dan 0 zijn";
```

Vervang die regel door:

```ts
      if (kind === "time" && !(Number(form.hours) > 0)) return "Uren moet groter dan 0 zijn";
      if (kind === "time" && !isQuarter(Number(form.hours))) return NOT_A_QUARTER;
```

De volgorde is bewust: "groter dan 0" komt eerst, zodat een leeg veld de melding over nul krijgt en niet die over kwartieren. Alleen `kind === "time"`; kilometers en bedragen hebben niets met kwartieren te maken.

- [ ] **Step 2: Het verlofformulier op kwartierstappen**

In `src/components/vacation/absence-client.tsx` staat het urenveld van het aanvraagdialoog:

```tsx
              <Input
                id="hours"
                type="number"
                step="0.5"
                min="0.5"
                readOnly={herhaald}
                className={herhaald ? "bg-muted text-muted-foreground" : undefined}
                {...requestForm.register("hours")}
              />
```

Wijzig `step` en `min`:

```tsx
              <Input
                id="hours"
                type="number"
                step="0.25"
                min="0.25"
                readOnly={herhaald}
                className={herhaald ? "bg-muted text-muted-foreground" : undefined}
                {...requestForm.register("hours")}
              />
```

Scherp daarna het formulier-schema in datzelfde bestand aan. Voeg toe bij de imports:

```ts
import { isQuarter, NOT_A_QUARTER } from "@/lib/quarter-hours";
```

en wijzig in `const requestSchema` de regel:

```ts
  hours: z.coerce.number({ invalid_type_error: "Verplicht" }).positive("Moet positief zijn"),
```

naar:

```ts
  hours: z.coerce.number({ invalid_type_error: "Verplicht" }).positive("Moet positief zijn").refine(isQuarter, NOT_A_QUARTER),
```

Laat `countWorkingHours` ongemoeid: die rondt af op halve uren en een half uur is altijd ook een kwartier.

- [ ] **Step 3: Controleer de typen en de tests**

Run: `PATH="$HOME/.nvm/versions/node/v20.20.1/bin:$PATH" npx tsc --noEmit`
Expected: 0 fouten.

Run: `PATH="$HOME/.nvm/versions/node/v20.20.1/bin:$PATH" npm test`
Expected: 23 bestanden, 247 tests, groen.

- [ ] **Step 4: Controleer de lint**

Run: `PATH="$HOME/.nvm/versions/node/v20.20.1/bin:$PATH" npm run lint`
Expected: 323 errors en 20 warnings, net als de baseline. Meer mag, maar niet van een nieuwe soort; kijk bij afwijking naar wat er nieuw bij staat.

- [ ] **Step 5: Commit**

```bash
git add src/components/reports/entry-edit-dialog.tsx src/components/vacation/absence-client.tsx
git commit -m "feat: kwartierregel in het bewerkscherm en het verlofformulier"
```

---

## Uitrol

Geen migratie, geen `db:push`, geen backfill — het datamodel verandert niet. Pushen naar `main` volstaat en Vercel deployt.

Handmatig na te lopen na de deploy:

- [ ] Een urenregel boeken zonder de tijdvelden aan te raken: gaat precies zoals het ging.
- [ ] Van 09:00 tot 12:15 → het urenveld springt op **3.25**.
- [ ] Van 09:00 tot 17:00 → **8**.
- [ ] Van 17:00 tot 09:00 → `De eindtijd moet ná de begintijd liggen`, en het urenveld blijft staan wat het was.
- [ ] 1,3 uur intypen → `Uren moeten in stappen van 15 minuten (0,25 uur)` onder het urenveld, en verzenden lukt niet.
- [ ] Een bestaande urenregel bewerken: de tijdvelden zijn leeg en de uren staan er gewoon.
- [ ] Als admin een urenregel bewerken via het rapportagescherm en 2,4 invullen → dezelfde weigering.
- [ ] Een verlofaanvraag van 8 uur over drie dagen goedkeuren → **2,75 / 2,75 / 2,50** in `/time`, samen exact 8.
- [ ] Een verlofaanvraag van 1 uur over vijf werkdagen goedkeuren → **vier** regels van 0,25, niet vijf.
- [ ] Een weekpatroon met 7,2 uur op een dag opslaan → geweigerd.
- [ ] Een verlofaanvraag afkeuren → de regels verdwijnen zoals voorheen.
