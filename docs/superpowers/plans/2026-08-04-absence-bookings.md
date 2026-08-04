# Absence Bookings Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Laat een goedgekeurde afwezigheidsaanvraag automatisch urenregels opleveren op een verlofproject per verlofsoort, zodat de afwezigheid in de urenlijst terugkomt.

**Architecture:** Twee pure modules dragen de rekenkant: `working-days.ts` bepaalt welke dagen meetellen, `absence-entries.ts` verdeelt de uren en koppelt de verlofsoort aan een projectnaam. Eén nullable kolom `absenceRequestId` op `TimeEntry` maakt de gegenereerde regels herkenbaar; de goedkeuringsroute verwijdert en hergenereert ze in één transactie, zodat elke statuswijziging vanzelf klopt. Diezelfde kolom blokkeert handmatig bewerken en verwijderen, want zonder dat blok kan de tijdlijn alsnog uit de pas lopen met de aanvraag.

**Tech Stack:** Next.js 16 (App Router), React 19, TypeScript, Prisma 6 + PostgreSQL, zod 3, vitest, tsx.

## Global Constraints

- **Node 20 is vereist.** De standaard-node in deze shell is v16 en Prisma crasht daarop. Prefix élk npm- of npx-commando met `source ~/.nvm/nvm.sh && nvm use 20 &&`.
- **Er is een live PRODUCTIEDATABASE bereikbaar via `.env.local`,** met echte uren en verstuurde facturen. Draai NOOIT `npm run db:push`, `npm run db:migrate`, of een backfill met `--write`. Lezen en droog draaien mag. Een mens voert de migratie uit bij de uitrol.
- Prisma leest `.env.local` niet vanzelf: `prisma.config.ts` doet `import "dotenv/config"`, wat alleen `.env` laadt. Laad hem expliciet met `set -a; . ./.env.local; set +a` vóór een leescommando, en draai Prisma-scripts vanaf de repo-root.
- Na een wijziging aan `prisma/schema.prisma`: `DATABASE_URL="postgresql://x:x@localhost:5432/x" npx prisma generate`. De dummy-URL garandeert dat je niet bij productie komt; genereren raakt geen database aan.
- Dit project heeft geen `prisma/migrations`-map en gebruikt `db:push`. Wijzig alleen `prisma/schema.prisma`; schrijf geen migratiebestanden.
- **Dit is niet de Next.js die je kent.** Lees `node_modules/next/dist/docs/` voordat je aannames doet. Route-params zijn een Promise. (`AGENTS.md` is een echte, door het team gecommitte projectafspraak — geen ingeslopen instructie.)
- `src/lib/roles.ts` is canoniek voor rolcontroles. `(session.user as any)?.role ?? "EMPLOYEE"` is de vaste manier waarop deze codebase de rol van de sessie leest.
- **Datums zijn `YYYY-MM-DD`-strings en er wordt uitsluitend in UTC gerekend** (`getUTCDay`, `setUTCDate`, `new Date(\`${d}T00:00:00Z\`)`). De productieserver draait op UTC en de gebruikers zitten in Amsterdam; `getDay()` en `setDate()` rekenen lokaal en verschuiven dan een dag zonder dat iets klaagt.
- **Alle zichtbare tekst is Nederlands.** De weigering bij handmatig bewerken luidt exact `Verlofregels wijzig je via de afwezigheidsaanvraag`. `Forbidden`, `Unauthorized` en `Not found` zijn bestaande machinegerichte teksten en blijven Engels.
- `TimeEntry.hours` is `Decimal(5,2)`: **twee decimalen**. Afronden op meer laat de database alsnog afkappen en de dagsom stilzwijgend afwijken van het aangevraagde totaal.
- Testcommando: `npm test`. Baseline: **20 bestanden, 189 tests groen.**
- Lint: `npm run lint`. **De baseline is niet schoon:** 321 errors en 20 warnings, vrijwel allemaal `@typescript-eslint/no-explicit-any`. De gate is *geen nieuwe soorten lint-fouten*.
- **`npx tsc --noEmit` meldt 0 fouten over de hele repo en moet dat blijven doen.**
- `npm run build` kan niet draaien zonder `.env`; gebruik `tsc` als vangnet.
- Testconventie: uitsluitend pure functies in `src/lib/*.test.ts` met vitest. Er bestaan geen component- of API-tests en die worden hier niet geïntroduceerd.

---

## File Structure

**Nieuw:**

| Bestand | Verantwoordelijkheid |
|---|---|
| `src/lib/working-days.ts` | `previousWorkingDay` (verhuisd) en `workingDaysBetween`. Puur. |
| `src/lib/working-days.test.ts` | Tests daarvoor. |
| `src/lib/absence-entries.ts` | Projectnaam per verlofsoort en de urenverdeling. Puur. |
| `src/lib/absence-entries.test.ts` | Tests daarvoor. |
| `prisma/backfill-absence-entries.ts` | Eenmalig script voor bestaande goedgekeurde aanvragen. |

**Verwijderd:** `src/lib/standup.ts` en `src/lib/standup.test.ts` — de inhoud verhuist naar
`working-days.ts`.

**Gewijzigd:**

| Bestand | Wat |
|---|---|
| `prisma/schema.prisma` | `PARENTAL_LEAVE`, `TimeEntry.absenceRequestId`, `AbsenceRequest.timeEntries`. |
| `src/app/api/standup/route.ts` | Import uit `working-days`; `PARENTAL_LEAVE` in `ABSENCE_LABELS`. |
| `src/app/api/absence-requests/[id]/route.ts` | `PARENTAL_LEAVE` in het zod-schema; regels genereren bij goedkeuring. |
| `src/components/vacation/absence-client.tsx` | `PARENTAL_LEAVE` in `ABSENCE_TYPE_LABELS`. |
| `src/app/api/vacation/calendar/route.ts` | `PARENTAL_LEAVE` in `TYPE_LABELS`. |
| `src/app/api/time/[id]/route.ts` | `PUT` en `DELETE` weigeren verlofregels. |
| `src/app/api/entries/bulk/route.ts` | Weigert een selectie met verlofregels. |
| `src/components/time/time-entries-client.tsx` | Bewerk- en verwijderknop uit bij een verlofregel. |
| `package.json` | Script `backfill:absence-entries`. |

**De spec noemde vier plekken met een verlofsoortenlijst; het zijn er vijf.**
`src/app/api/vacation/calendar/route.ts` heeft een eigen `TYPE_LABELS` die de spec over het hoofd
zag. Task 3 werkt alle vijf bij.

---

## Task 1: Werkdagen krijgen hun eigen module

**Files:**
- Create: `src/lib/working-days.ts`, `src/lib/working-days.test.ts`
- Delete: `src/lib/standup.ts`, `src/lib/standup.test.ts`
- Modify: `src/app/api/standup/route.ts` (alleen de import)

**Interfaces:**
- Produces:
  - `previousWorkingDay(date: string): string` — ongewijzigd gedrag, nieuwe plek.
  - `workingDaysBetween(from: string, to: string): string[]` — de werkdagen van `from` tot en met `to`, oplopend.

`previousWorkingDay` woont in `src/lib/standup.ts` en is niet langer iets van de standup. Twee
werkdagfuncties in twee bestanden gaan op termijn uit elkaar lopen, dus ze komen samen.

- [ ] **Step 1: Write the failing test**

Create `src/lib/working-days.test.ts`. De eerste `describe` is letterlijk het bestaande blok uit
`src/lib/standup.test.ts` met alleen het importpad gewijzigd; de tweede is nieuw:

```ts
import { describe, it, expect } from "vitest";
import { previousWorkingDay, workingDaysBetween } from "./working-days";

describe("previousWorkingDay", () => {
  it("goes back one day from a Tuesday", () => {
    // 2026-08-04 is a Tuesday.
    expect(previousWorkingDay("2026-08-04")).toBe("2026-08-03");
  });

  it("skips the weekend from a Monday", () => {
    // 2026-08-03 is a Monday; Friday is 2026-07-31, not Sunday the 2nd.
    expect(previousWorkingDay("2026-08-03")).toBe("2026-07-31");
  });

  it("returns Friday when asked from a Sunday", () => {
    expect(previousWorkingDay("2026-08-02")).toBe("2026-07-31");
  });

  it("returns Friday when asked from a Saturday", () => {
    expect(previousWorkingDay("2026-08-01")).toBe("2026-07-31");
  });

  it("goes back one day from a Wednesday", () => {
    expect(previousWorkingDay("2026-08-05")).toBe("2026-08-04");
  });

  it("crosses a month boundary", () => {
    // 2026-06-01 is a Monday.
    expect(previousWorkingDay("2026-06-01")).toBe("2026-05-29");
  });

  it("crosses a year boundary", () => {
    // 2027-01-01 is a Friday.
    expect(previousWorkingDay("2027-01-01")).toBe("2026-12-31");
  });

  it("returns a zero-padded YYYY-MM-DD string, never a Date", () => {
    // 2026-02-03 is a Tuesday, so the answer is Monday the 2nd — a low month
    // and a low day, where an unpadded formatter would produce "2026-2-2".
    expect(previousWorkingDay("2026-02-03")).toBe("2026-02-02");
    expect(previousWorkingDay("2026-02-03")).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

describe("workingDaysBetween", () => {
  it("returns every weekday of a full working week", () => {
    // 2026-08-03 is a Monday, 2026-08-07 the Friday of that week.
    expect(workingDaysBetween("2026-08-03", "2026-08-07")).toEqual([
      "2026-08-03", "2026-08-04", "2026-08-05", "2026-08-06", "2026-08-07",
    ]);
  });

  it("returns a single day when the range is one working day", () => {
    expect(workingDaysBetween("2026-08-04", "2026-08-04")).toEqual(["2026-08-04"]);
  });

  it("returns nothing when the range is a single Saturday", () => {
    // 2026-08-01 is a Saturday. A request that falls entirely in a weekend
    // yields no days at all, which the caller must handle.
    expect(workingDaysBetween("2026-08-01", "2026-08-01")).toEqual([]);
  });

  it("skips the weekend inside a range", () => {
    // Friday 2026-08-07 to Monday 2026-08-10: the 8th and 9th are dropped.
    expect(workingDaysBetween("2026-08-07", "2026-08-10")).toEqual([
      "2026-08-07", "2026-08-10",
    ]);
  });

  it("returns nothing when `to` falls before `from`", () => {
    expect(workingDaysBetween("2026-08-05", "2026-08-03")).toEqual([]);
  });

  it("crosses a month boundary", () => {
    // Thursday 2026-07-30 to Monday 2026-08-03.
    expect(workingDaysBetween("2026-07-30", "2026-08-03")).toEqual([
      "2026-07-30", "2026-07-31", "2026-08-03",
    ]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `source ~/.nvm/nvm.sh && nvm use 20 && npx vitest run src/lib/working-days.test.ts`
Expected: FAIL — `Failed to resolve import "./working-days"`.

- [ ] **Step 3: Write the module**

Create `src/lib/working-days.ts`:

```ts
/**
 * Werkdagen, uitsluitend in UTC gerekend en met `YYYY-MM-DD` in en uit.
 *
 * Bewust geen `Date` aan de randen. De datumkolommen zijn `@db.Date` en de
 * routes geven datums door als `YYYY-MM-DD`. Een `Date` erdoorheen halen
 * introduceert een tijdzonevraag die hier niets oplost:
 * `new Date("2026-08-04")` is middernacht UTC, terwijl `getDay()` en
 * `setDate()` in de lokale zone rekenen. De productieserver draait op UTC en de
 * gebruikers zitten in Amsterdam, dus dat verschil verschuift echt een dag
 * zonder dat er iets klaagt. Daarom overal de UTC-varianten.
 *
 * Feestdagen worden niet overgeslagen — die staan nergens in deze app, en een
 * dag waarop niemand boekte is een juiste weergave, geen fout. Bij verlof is
 * het bovendien administratief juist: wie vrij neemt rond Pasen heeft daar
 * verlofuren voor opgegeven.
 */

function isWeekend(d: Date): boolean {
  const dag = d.getUTCDay();
  return dag === 0 || dag === 6;
}

/** De vorige werkdag. Maandag kijkt naar vrijdag. */
export function previousWorkingDay(date: string): string {
  const d = new Date(`${date}T00:00:00Z`);
  do {
    d.setUTCDate(d.getUTCDate() - 1);
  } while (isWeekend(d));
  return d.toISOString().slice(0, 10);
}

/**
 * Alle werkdagen van `from` tot en met `to`, oplopend.
 *
 * Geeft een lege lijst wanneer er geen werkdagen in de periode zitten, en ook
 * wanneer `to` vóór `from` ligt — de lus draait dan geen enkele keer.
 */
export function workingDaysBetween(from: string, to: string): string[] {
  const dagen: string[] = [];
  const d = new Date(`${from}T00:00:00Z`);
  const eind = new Date(`${to}T00:00:00Z`);
  while (d.getTime() <= eind.getTime()) {
    if (!isWeekend(d)) dagen.push(d.toISOString().slice(0, 10));
    d.setUTCDate(d.getUTCDate() + 1);
  }
  return dagen;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `source ~/.nvm/nvm.sh && nvm use 20 && npx vitest run src/lib/working-days.test.ts`
Expected: PASS, 14 tests.

- [ ] **Step 5: Verhuis de aanroeper en verwijder het oude bestand**

In `src/app/api/standup/route.ts` staat:

```ts
import { previousWorkingDay } from "@/lib/standup";
```

Wijzig naar:

```ts
import { previousWorkingDay } from "@/lib/working-days";
```

Verwijder daarna beide oude bestanden:

```bash
git rm src/lib/standup.ts src/lib/standup.test.ts
```

- [ ] **Step 6: Controleer dat er geen verwijzing naar de oude module is blijven staan**

Run: `grep -rn "lib/standup\"" --include=*.ts --include=*.tsx src/`

Expected: geen treffers. Blijft er één staan, dan verwijst die naar een bestand dat niet meer
bestaat en faalt `tsc`.

- [ ] **Step 7: Controleer de typen en de volledige suite**

Run: `source ~/.nvm/nvm.sh && nvm use 20 && npx tsc --noEmit`
Expected: 0 fouten.

Run: `source ~/.nvm/nvm.sh && nvm use 20 && npm test`
Expected: 20 bestanden, 195 tests, groen. Het aantal bestanden blijft gelijk — er verdwijnt er één
en er komt er één bij — en het aantal tests gaat van 189 naar 195 door de zes nieuwe.

- [ ] **Step 8: Commit**

```bash
git add src/lib/working-days.ts src/lib/working-days.test.ts src/app/api/standup/route.ts
git commit -m "refactor: werkdagen naar een eigen module, met workingDaysBetween erbij"
```

---

## Task 2: De verlofprojecten en de urenverdeling

**Files:**
- Create: `src/lib/absence-entries.ts`, `src/lib/absence-entries.test.ts`

**Interfaces:**
- Produces:
  - `ABSENCE_PROJECT_NAMES: Record<string, string>` — verlofsoort → projectnaam.
  - `splitHoursOverDays(totalHours: number, days: string[]): Array<{ date: string; hours: number }>`

- [ ] **Step 1: Write the failing test**

Create `src/lib/absence-entries.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { ABSENCE_PROJECT_NAMES, splitHoursOverDays } from "./absence-entries";

/** Optellen in centen: 3.33 + 3.33 + 3.34 is in floating point net geen 10. */
function totaalInCenten(regels: Array<{ hours: number }>): number {
  return regels.reduce((som, r) => som + Math.round(r.hours * 100), 0);
}

describe("ABSENCE_PROJECT_NAMES", () => {
  it("names a project for every absence type", () => {
    expect(ABSENCE_PROJECT_NAMES).toEqual({
      VACATION: "Vakantieverlof",
      SICK: "Ziekteverlof",
      PARENTAL_LEAVE: "Ouderschapsverlof",
      SPECIAL_LEAVE: "Bijzonder verlof",
      UNPAID_LEAVE: "Onbetaald verlof",
    });
  });
});

describe("splitHoursOverDays", () => {
  const week = ["2026-08-03", "2026-08-04", "2026-08-05", "2026-08-06", "2026-08-07"];

  it("divides evenly when it comes out round", () => {
    expect(splitHoursOverDays(40, week)).toEqual([
      { date: "2026-08-03", hours: 8 },
      { date: "2026-08-04", hours: 8 },
      { date: "2026-08-05", hours: 8 },
      { date: "2026-08-06", hours: 8 },
      { date: "2026-08-07", hours: 8 },
    ]);
  });

  it("puts the remainder on the last day", () => {
    // 10 / 3 does not divide into two decimals; the last day absorbs the rest.
    expect(splitHoursOverDays(10, ["2026-08-03", "2026-08-04", "2026-08-05"])).toEqual([
      { date: "2026-08-03", hours: 3.33 },
      { date: "2026-08-04", hours: 3.33 },
      { date: "2026-08-05", hours: 3.34 },
    ]);
  });

  it("handles a single day", () => {
    expect(splitHoursOverDays(8, ["2026-08-04"])).toEqual([{ date: "2026-08-04", hours: 8 }]);
  });

  it("returns nothing for no days rather than dividing by zero", () => {
    expect(splitHoursOverDays(8, [])).toEqual([]);
  });

  it("splits a half day across two days", () => {
    expect(splitHoursOverDays(7.5, ["2026-08-03", "2026-08-04"])).toEqual([
      { date: "2026-08-03", hours: 3.75 },
      { date: "2026-08-04", hours: 3.75 },
    ]);
  });

  it("always sums to exactly the requested total", () => {
    // The property that matters: an approval must never quietly book more or
    // fewer hours than the employee asked for.
    for (const totaal of [40, 10, 7.5, 1, 36.4, 13.33]) {
      expect(totaalInCenten(splitHoursOverDays(totaal, week))).toBe(Math.round(totaal * 100));
    }
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `source ~/.nvm/nvm.sh && nvm use 20 && npx vitest run src/lib/absence-entries.test.ts`
Expected: FAIL — `Failed to resolve import "./absence-entries"`.

- [ ] **Step 3: Write the module**

Create `src/lib/absence-entries.ts`:

```ts
/**
 * Het project waarop verlof van een bepaalde soort geboekt wordt.
 *
 * De projecten worden NIET automatisch aangemaakt: een admin zet ze klaar op
 * /projects, zonder klant, niet-factureerbaar en zonder deelnemers. Dat laatste
 * maakt ze onbereikbaar voor handmatige invoer — de invoerformulieren tonen
 * alleen projecten waarvan je deelnemer bent — zodat goedkeuring de enige weg
 * naar een verlofregel is.
 *
 * Ontbreekt een project, dan weigert de goedkeuring met de naam erbij. Een
 * project dat uit het niets verschijnt is later moeilijk te doorgronden; een
 * weigering die zegt wat je mist niet.
 *
 * De namen zijn gelijk aan de bestaande labels in het afwezigheidsscherm, op
 * VACATION na: daar heet die "Vakantie", hier "Vakantieverlof", omdat de naam
 * in de projectkolom naast echte projectnamen komt te staan.
 */
export const ABSENCE_PROJECT_NAMES: Record<string, string> = {
  VACATION: "Vakantieverlof",
  SICK: "Ziekteverlof",
  PARENTAL_LEAVE: "Ouderschapsverlof",
  SPECIAL_LEAVE: "Bijzonder verlof",
  UNPAID_LEAVE: "Onbetaald verlof",
};

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

- [ ] **Step 4: Run test to verify it passes**

Run: `source ~/.nvm/nvm.sh && nvm use 20 && npx vitest run src/lib/absence-entries.test.ts`
Expected: PASS, 7 tests.

- [ ] **Step 5: Controleer de typen en de volledige suite**

Run: `source ~/.nvm/nvm.sh && nvm use 20 && npx tsc --noEmit`
Expected: 0 fouten.

Run: `source ~/.nvm/nvm.sh && nvm use 20 && npm test`
Expected: 21 bestanden, 202 tests, groen.

- [ ] **Step 6: Commit**

```bash
git add src/lib/absence-entries.ts src/lib/absence-entries.test.ts
git commit -m "feat: verlofprojectnamen en de urenverdeling over werkdagen"
```

---

## Task 3: Het schema en de vijf verlofsoortenlijsten

**Files:**
- Modify: `prisma/schema.prisma`
- Modify: `src/app/api/absence-requests/[id]/route.ts` (alleen het zod-schema)
- Modify: `src/components/vacation/absence-client.tsx`
- Modify: `src/app/api/vacation/calendar/route.ts`
- Modify: `src/app/api/standup/route.ts`

**Interfaces:**
- Produces: `AbsenceType.PARENTAL_LEAVE`, `TimeEntry.absenceRequestId`, `AbsenceRequest.timeEntries`.

De enum-waarde erbij zetten is één regel; hem overal láten werken is vijf plekken. Elk daarvan kent
de soorten los van de andere, en wie er één vergeet krijgt geen foutmelding maar stil verkeerd
gedrag.

**Deze taak levert geen unittests op.** Het zijn schemawijzigingen en labeltabellen; er komt geen
pure logica bij.

- [ ] **Step 1: Breid de enum uit**

In `prisma/schema.prisma`, vervang:

```prisma
enum AbsenceType {
  VACATION
  SICK
  SPECIAL_LEAVE
  UNPAID_LEAVE
}
```

door:

```prisma
enum AbsenceType {
  VACATION
  SICK
  PARENTAL_LEAVE
  SPECIAL_LEAVE
  UNPAID_LEAVE
}
```

- [ ] **Step 2: Koppel de urenregel aan de aanvraag**

In `model TimeEntry` in `prisma/schema.prisma`, voeg toe direct ná `invoiceLine`:

```prisma
  // Gezet op regels die uit een goedgekeurde afwezigheidsaanvraag zijn ontstaan.
  // `absenceRequestId !== null` is precies de definitie van "dit is een
  // verlofregel": daarop weigeren de bewerk- en verwijderroutes, en daarop
  // vindt de goedkeuring terug wat hij eerder maakte.
  absenceRequestId String?
  absenceRequest   AbsenceRequest? @relation(fields: [absenceRequestId], references: [id], onDelete: Cascade)
```

In `model AbsenceRequest`, voeg toe bij de andere velden, direct ná `reviewedAt`:

```prisma
  timeEntries TimeEntry[]
```

`onDelete: Cascade` doet het opruimen gratis: verwijdert iemand de aanvraag, dan verdwijnen de
gegenereerde urenregels mee.

- [ ] **Step 3: Genereer de Prisma-client opnieuw**

Run: `source ~/.nvm/nvm.sh && nvm use 20 && DATABASE_URL="postgresql://x:x@localhost:5432/x" npx prisma generate`
Expected: `Generated Prisma Client`. Dit raakt geen database aan.

- [ ] **Step 4: Laat de medewerker de soort kiezen**

In `src/app/api/absence-requests/[id]/route.ts` staat in `employeeUpdateSchema`:

```ts
  type: z.enum(["VACATION", "SICK", "SPECIAL_LEAVE", "UNPAID_LEAVE"]).optional(),
```

Wijzig naar:

```ts
  type: z.enum(["VACATION", "SICK", "PARENTAL_LEAVE", "SPECIAL_LEAVE", "UNPAID_LEAVE"]).optional(),
```

- [ ] **Step 5: Voeg het label toe in het afwezigheidsscherm**

In `src/components/vacation/absence-client.tsx` staat:

```tsx
const ABSENCE_TYPE_LABELS: Record<AbsenceType, string> = {
  VACATION: "Vakantie",
  SICK: "Ziekteverlof",
  SPECIAL_LEAVE: "Bijzonder verlof",
  UNPAID_LEAVE: "Onbetaald verlof",
};
```

Voeg tussen `SICK` en `SPECIAL_LEAVE` toe:

```tsx
  PARENTAL_LEAVE: "Ouderschapsverlof",
```

Zoek daarna in ditzelfde bestand naar het `AbsenceType`-type en naar elke `z.enum([...])` met de
vier soorten erin, en voeg `"PARENTAL_LEAVE"` daar op dezelfde plek toe. Zonder dat weigert het
formulier de nieuwe soort of faalt `tsc` op de `Record<AbsenceType, string>`.

- [ ] **Step 6: Voeg het label toe in de vakantiekalender**

In `src/app/api/vacation/calendar/route.ts` staat:

```ts
const TYPE_LABELS: Record<string, string> = {
  VACATION: "Vakantie",
  SICK: "Ziekteverlof",
  SPECIAL_LEAVE: "Bijzonder verlof",
  UNPAID_LEAVE: "Onbetaald verlof",
};
```

Voeg tussen `SICK` en `SPECIAL_LEAVE` toe:

```ts
  PARENTAL_LEAVE: "Ouderschapsverlof",
```

- [ ] **Step 7: Voeg het label toe in het standupscherm**

In `src/app/api/standup/route.ts` staat:

```ts
const ABSENCE_LABELS: Record<string, string> = {
  VACATION: "vakantie",
  SICK: "ziek",
  SPECIAL_LEAVE: "bijzonder verlof",
  UNPAID_LEAVE: "onbetaald verlof",
};
```

Voeg tussen `SICK` en `SPECIAL_LEAVE` toe:

```ts
  PARENTAL_LEAVE: "ouderschapsverlof",
```

Let op de kleine letters: die tabel levert de tekst achter `afwezig — ` op het standupscherm.

- [ ] **Step 8: Controleer dat er geen soortenlijst is overgeslagen**

Run: `grep -rn "UNPAID_LEAVE" --include=*.ts --include=*.tsx src/`

Loop elke treffer langs. Elke plek die de vier soorten opsomt — een `z.enum`, een `Record`, een
union-type, een keuzelijst — moet `PARENTAL_LEAVE` nu ook noemen. Vind je er één zonder, voeg hem
toe en meld het in je rapport; de spec ging uit van vijf plekken, maar dit commando is de
gezaghebbende telling.

- [ ] **Step 9: Controleer de typen en de tests**

Run: `source ~/.nvm/nvm.sh && nvm use 20 && npx tsc --noEmit`
Expected: 0 fouten.

Run: `source ~/.nvm/nvm.sh && nvm use 20 && npm test`
Expected: 21 bestanden, 202 tests, groen.

- [ ] **Step 10: Commit**

```bash
git add prisma/schema.prisma "src/app/api/absence-requests/[id]/route.ts" src/components/vacation/absence-client.tsx src/app/api/vacation/calendar/route.ts src/app/api/standup/route.ts
git commit -m "feat: ouderschapsverlof en de koppeling van urenregel aan aanvraag"
```

---

## Task 4: Goedkeuring genereert de urenregels

**Files:**
- Modify: `src/app/api/absence-requests/[id]/route.ts` (de admintak van `PUT`)

**Interfaces:**
- Consumes: `workingDaysBetween` uit Task 1, `ABSENCE_PROJECT_NAMES` en `splitHoursOverDays` uit Task 2, het schema uit Task 3.

**Deze taak levert geen unittests op.** Alle rekenlogica zit al in Task 1 en 2; wat hier bijkomt is
querycode.

- [ ] **Step 1: Voeg de imports toe**

Bovenaan `src/app/api/absence-requests/[id]/route.ts`:

```ts
import { workingDaysBetween } from "@/lib/working-days";
import { ABSENCE_PROJECT_NAMES, splitHoursOverDays } from "@/lib/absence-entries";
```

- [ ] **Step 2: Vervang de admintak**

In `PUT` staat nu:

```ts
    if (isAdmin(role) && "status" in body) {
      const data = adminUpdateSchema.parse(body);
      const updated = await prisma.absenceRequest.update({
        where: { id },
        data: { status: data.status, reviewedBy: userId, reviewedAt: new Date() },
        include: {
          user: { select: { id: true, name: true } },
          reviewer: { select: { id: true, name: true } },
        },
      });
      return NextResponse.json({ ...updated, hours: Number(updated.hours) });
    }
```

Vervang dat hele blok door:

```ts
    if (isAdmin(role) && "status" in body) {
      const data = adminUpdateSchema.parse(body);

      // Bij goedkeuring eerst alles uitrekenen en pas daarna schrijven: een
      // ontbrekend verlofproject of een periode zonder werkdagen moet de
      // aanvraag onaangeroerd laten in plaats van hem half goed te keuren.
      let projectId = "";
      let regels: Array<{ date: string; hours: number }> = [];

      if (data.status === "APPROVED") {
        const naam = ABSENCE_PROJECT_NAMES[existing.type];
        const project = await prisma.project.findUnique({
          where: { name: naam },
          select: { id: true },
        });
        if (!project) {
          return NextResponse.json(
            { error: `Het project "${naam}" bestaat nog niet` },
            { status: 400 },
          );
        }
        projectId = project.id;

        const dagen = workingDaysBetween(
          existing.startDate.toISOString().slice(0, 10),
          existing.endDate.toISOString().slice(0, 10),
        );
        if (dagen.length === 0) {
          return NextResponse.json({ error: "Deze periode bevat geen werkdagen" }, { status: 400 });
        }
        regels = splitHoursOverDays(Number(existing.hours), dagen);
      }

      const updated = await prisma.$transaction(async (tx) => {
        const aanvraag = await tx.absenceRequest.update({
          where: { id },
          data: { status: data.status, reviewedBy: userId, reviewedAt: new Date() },
          include: {
            user: { select: { id: true, name: true } },
            reviewer: { select: { id: true, name: true } },
          },
        });

        // Verwijderen-en-opnieuw-maken in plaats van bijwerken: zo komen
        // gewijzigde datums vanzelf goed, en elke status behalve APPROVED laat
        // het bij het verwijderen. Daarmee kan de tijdlijn niet uit de pas
        // lopen met de aanvraag.
        await tx.timeEntry.deleteMany({ where: { absenceRequestId: id } });
        if (regels.length > 0) {
          await tx.timeEntry.createMany({
            data: regels.map((r) => ({
              userId: existing.userId,
              projectId,
              date: new Date(`${r.date}T00:00:00Z`),
              hours: r.hours,
              description: existing.description,
              absenceRequestId: id,
            })),
          });
        }
        return aanvraag;
      });

      return NextResponse.json({ ...updated, hours: Number(updated.hours) });
    }
```

Let op drie dingen die hier bewust zo staan:

- `existing.userId`, niet `userId` — de regels horen bij de **aanvrager**, niet bij de admin die
  goedkeurt.
- Er wordt **geen** deelnemerscontrole gedaan. Die zit in de routes voor handmatige invoer, en dit
  is juist de uitzondering waarvoor de verlofprojecten geen deelnemers hebben.
- `workLevel` en `rateOverride` blijven leeg: het project is niet-factureerbaar, dus er valt geen
  tarief te bepalen.

- [ ] **Step 3: Controleer de typen en de tests**

Run: `source ~/.nvm/nvm.sh && nvm use 20 && npx tsc --noEmit`
Expected: 0 fouten. Meldt hij dat `absenceRequestId` niet bestaat op `timeEntry`, dan is
`prisma generate` uit Task 3 niet gedraaid — draai
`DATABASE_URL="postgresql://x:x@localhost:5432/x" npx prisma generate` en probeer opnieuw.

Run: `source ~/.nvm/nvm.sh && nvm use 20 && npm test`
Expected: 21 bestanden, 202 tests, groen.

- [ ] **Step 4: Lees je eigen diff terug op de eigenaar**

Run: `git diff "src/app/api/absence-requests/[id]/route.ts"`

Stel met eigen ogen vast dat de gegenereerde regels `existing.userId` gebruiken. Staat er `userId`,
dan komen de verlofuren op naam van de goedkeurende admin te staan — een fout die pas opvalt als
iemand zich afvraagt waarom hij vakantie-uren heeft die hij nooit opnam.

- [ ] **Step 5: Commit**

```bash
git add "src/app/api/absence-requests/[id]/route.ts"
git commit -m "feat: goedkeuring genereert urenregels op het verlofproject"
```

---

## Task 5: Verlofregels zijn niet handmatig te wijzigen

**Files:**
- Modify: `src/app/api/time/[id]/route.ts`
- Modify: `src/app/api/entries/bulk/route.ts`
- Modify: `src/components/time/time-entries-client.tsx`

**Interfaces:**
- Consumes: `TimeEntry.absenceRequestId` uit Task 3.

Zonder deze taak haalt de rest zichzelf onderuit: een medewerker ziet de verlofregels in zijn
urenlijst staan en kan er vandaag gewoon uren op wijzigen of ze verwijderen. Dan klopt de tijdlijn
niet meer met de aanvraag en is er niets dat dat herstelt.

**Deze taak levert geen unittests op.** Het zijn drie guards; er komt geen pure logica bij.

- [ ] **Step 1: Weiger bewerken van een verlofregel**

In `src/app/api/time/[id]/route.ts`, in `PUT`, staat:

```ts
    const existing = await prisma.timeEntry.findUnique({ where: { id }, select: { userId: true, invoiced: true, workLevel: true, projectId: true } });
    const error = entryMutationError(checkEntryMutation(role, sessionUserId, existing));
    if (error || !existing) return error ?? NextResponse.json({ error: "Not found" }, { status: 404 });
```

Vervang door:

```ts
    const existing = await prisma.timeEntry.findUnique({ where: { id }, select: { userId: true, invoiced: true, workLevel: true, projectId: true, absenceRequestId: true } });
    const error = entryMutationError(checkEntryMutation(role, sessionUserId, existing));
    if (error || !existing) return error ?? NextResponse.json({ error: "Not found" }, { status: 404 });

    // Een verlofregel hoort bij een goedgekeurde aanvraag. Hem hier wijzigen
    // laat de tijdlijn uit de pas lopen met die aanvraag, zonder dat iets dat
    // herstelt. Ook voor admins: de aanvraag is de bron.
    if (existing.absenceRequestId) {
      return NextResponse.json(
        { error: "Verlofregels wijzig je via de afwezigheidsaanvraag" },
        { status: 400 },
      );
    }
```

- [ ] **Step 2: Weiger verwijderen van een verlofregel**

In `DELETE` in datzelfde bestand staat:

```ts
    const existing = await prisma.timeEntry.findUnique({ where: { id }, select: { userId: true, invoiced: true } });
    const error = entryMutationError(checkEntryMutation(role, sessionUserId, existing));
    if (error) return error;
```

Vervang door:

```ts
    const existing = await prisma.timeEntry.findUnique({ where: { id }, select: { userId: true, invoiced: true, absenceRequestId: true } });
    const error = entryMutationError(checkEntryMutation(role, sessionUserId, existing));
    if (error) return error;

    if (existing?.absenceRequestId) {
      return NextResponse.json(
        { error: "Verlofregels wijzig je via de afwezigheidsaanvraag" },
        { status: 400 },
      );
    }
```

- [ ] **Step 3: Weiger een bulkactie met verlofregels erin**

In `src/app/api/entries/bulk/route.ts` staat, ná het parsen:

```ts
    const model =
      kind === "time" ? prisma.timeEntry : kind === "km" ? prisma.kmEntry : prisma.expense;
```

Voeg direct dáárna toe:

```ts
    // Alleen tijdregels kunnen verlofregels zijn. Bevat de selectie er één, dan
    // wordt de hele actie geweigerd — dezelfde alles-of-niets-vorm als de
    // deelnemerscontrole verderop, en om dezelfde reden: gedeeltelijk toepassen
    // met een melding die "gefactureerd" als oorzaak noemt zou misleiden.
    if (kind === "time") {
      const verlof = await prisma.timeEntry.count({
        where: { ...buildBulkWhere(ids), absenceRequestId: { not: null } },
      });
      if (verlof > 0) {
        return NextResponse.json(
          { error: "Verlofregels wijzig je via de afwezigheidsaanvraag" },
          { status: 400 },
        );
      }
    }
```

`buildBulkWhere` wordt in dit bestand al geïmporteerd; voeg geen import toe. Door hem te
hergebruiken leest deze controle exact dezelfde rijen als de schrijfactie verderop.

- [ ] **Step 4: Zet de knoppen uit in het urenscherm**

`GET /api/time` gebruikt `include` zonder een `select` op het hoogste niveau, dus alle scalaire
velden — waaronder `absenceRequestId` — komen al mee in de payload. Er is geen routewijziging nodig.

`src/components/time/time-entries-client.tsx` heeft **twee** weergaven — week en lijst — en dus
**vier** knoppen. Ze hebben al een `disabled={entry.invoiced}`, dus combineren in plaats van
overschrijven.

In de weekweergave, rond regel 631:

```tsx
                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => startEdit(entry)} disabled={entry.invoiced}>
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => deleteEntry(entry.id)} disabled={entry.invoiced}>
                        <Trash2 className="h-3.5 w-3.5 text-destructive" />
                      </Button>
```

wordt:

```tsx
                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => startEdit(entry)} disabled={entry.invoiced || Boolean(entry.absenceRequestId)} title={entry.absenceRequestId ? VERLOF_UITLEG : undefined}>
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => deleteEntry(entry.id)} disabled={entry.invoiced || Boolean(entry.absenceRequestId)} title={entry.absenceRequestId ? VERLOF_UITLEG : undefined}>
                        <Trash2 className="h-3.5 w-3.5 text-destructive" />
                      </Button>
```

In de lijstweergave, rond regel 692:

```tsx
                        <Button variant="ghost" size="icon" onClick={() => startEdit(entry)} disabled={entry.invoiced}>
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        <Button variant="ghost" size="icon" onClick={() => deleteEntry(entry.id)} disabled={entry.invoiced}>
                          <Trash2 className="h-3.5 w-3.5 text-destructive" />
                        </Button>
```

wordt:

```tsx
                        <Button variant="ghost" size="icon" onClick={() => startEdit(entry)} disabled={entry.invoiced || Boolean(entry.absenceRequestId)} title={entry.absenceRequestId ? VERLOF_UITLEG : undefined}>
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        <Button variant="ghost" size="icon" onClick={() => deleteEntry(entry.id)} disabled={entry.invoiced || Boolean(entry.absenceRequestId)} title={entry.absenceRequestId ? VERLOF_UITLEG : undefined}>
                          <Trash2 className="h-3.5 w-3.5 text-destructive" />
                        </Button>
```

Zet de tekst één keer bovenaan het bestand, onder de imports, zodat de vier knoppen niet uit elkaar
kunnen lopen:

```tsx
const VERLOF_UITLEG = "Verlofregels wijzig je via de afwezigheidsaanvraag";
```

- [ ] **Step 5: Controleer dat alle drie de schrijfpaden gedekt zijn**

Run: `grep -rn "absenceRequestId" --include=*.ts --include=*.tsx src/`

Expected: treffers in `src/app/api/time/[id]/route.ts` (twee keer: `PUT` en `DELETE`), in
`src/app/api/entries/bulk/route.ts`, in `src/app/api/absence-requests/[id]/route.ts` uit Task 4, en
in `src/components/time/time-entries-client.tsx`. Ontbreekt er één van de eerste drie, dan is dat
een schrijfpad waarlangs een verlofregel alsnog gewijzigd kan worden.

- [ ] **Step 6: Controleer de typen en de tests**

Run: `source ~/.nvm/nvm.sh && nvm use 20 && npx tsc --noEmit`
Expected: 0 fouten.

Run: `source ~/.nvm/nvm.sh && nvm use 20 && npm test`
Expected: 21 bestanden, 202 tests, groen.

- [ ] **Step 7: Commit**

```bash
git add "src/app/api/time/[id]/route.ts" src/app/api/entries/bulk/route.ts src/components/time/time-entries-client.tsx
git commit -m "feat: verlofregels zijn niet handmatig te wijzigen of te verwijderen"
```

---

## Task 6: Backfill voor bestaande goedgekeurde aanvragen

**Files:**
- Create: `prisma/backfill-absence-entries.ts`
- Modify: `package.json`

**Interfaces:**
- Consumes: `workingDaysBetween` uit Task 1, `ABSENCE_PROJECT_NAMES` en `splitHoursOverDays` uit Task 2.
- Produces: `npm run backfill:absence-entries` (droog) en `npm run backfill:absence-entries -- --write`.

**Deze taak levert geen unittests op.** De logica die het script gebruikt is al getest in Task 1 en
Task 2; wat hier bijkomt is een script dat die functies over bestaande rijen loopt.

**Draai dit script NOOIT met `--write`.** Droog draaien mag en hoort erbij.

- [ ] **Step 1: Maak het script**

Create `prisma/backfill-absence-entries.ts`:

```ts
import { PrismaClient } from "@prisma/client";
import { workingDaysBetween } from "../src/lib/working-days";
import { ABSENCE_PROJECT_NAMES, splitHoursOverDays } from "../src/lib/absence-entries";

const db = new PrismaClient();

async function main() {
  const write = process.argv.includes("--write");
  const jaar = new Date().getUTCFullYear();

  // Alleen het lopende kalenderjaar: oudere periodes zijn al afgerekend, en er
  // achteraf uren aan toevoegen verschuift historische urenoverzichten zonder
  // dat iemand daarom vroeg.
  const aanvragen = await db.absenceRequest.findMany({
    where: {
      status: "APPROVED",
      startDate: {
        gte: new Date(`${jaar}-01-01T00:00:00Z`),
        lte: new Date(`${jaar}-12-31T00:00:00Z`),
      },
    },
    orderBy: { startDate: "asc" },
    select: {
      id: true, userId: true, type: true, startDate: true, endDate: true,
      hours: true, description: true,
      user: { select: { name: true } },
      timeEntries: { select: { id: true } },
    },
  });

  const projecten = await db.project.findMany({ select: { id: true, name: true } });
  const projectPerNaam = new Map(projecten.map((p) => [p.name, p.id]));

  const plan: Array<{ id: string; userId: string; projectId: string; description: string | null; regels: Array<{ date: string; hours: number }>; label: string }> = [];
  const overgeslagen: string[] = [];
  const zonderProject: string[] = [];
  const zonderWerkdagen: string[] = [];

  for (const a of aanvragen) {
    const label = `${a.user.name} — ${ABSENCE_PROJECT_NAMES[a.type] ?? a.type} ${a.startDate.toISOString().slice(0, 10)} t/m ${a.endDate.toISOString().slice(0, 10)}`;

    // Herhaalbaar zonder schade: wat al regels heeft blijft ongemoeid.
    if (a.timeEntries.length > 0) { overgeslagen.push(label); continue; }

    const naam = ABSENCE_PROJECT_NAMES[a.type];
    const projectId = naam ? projectPerNaam.get(naam) : undefined;
    if (!projectId) { zonderProject.push(`${label}  (project "${naam ?? a.type}" ontbreekt)`); continue; }

    const dagen = workingDaysBetween(
      a.startDate.toISOString().slice(0, 10),
      a.endDate.toISOString().slice(0, 10),
    );
    if (dagen.length === 0) { zonderWerkdagen.push(label); continue; }

    plan.push({ id: a.id, userId: a.userId, projectId, description: a.description, regels: splitHoursOverDays(Number(a.hours), dagen), label });
  }

  console.log(`${write ? "SCHRIJVEN" : "DROOG (geen wijzigingen)"} — ${aanvragen.length} goedgekeurde aanvragen in ${jaar}\n`);
  for (const p of plan) {
    const totaal = p.regels.reduce((s, r) => s + r.hours, 0);
    console.log(`  ${p.regels.length} regel(s), ${totaal.toFixed(2)} uur  ${p.label}`);
  }

  if (overgeslagen.length > 0) {
    console.log(`\nAL GEDAAN — deze hebben al urenregels (${overgeslagen.length}):`);
    overgeslagen.forEach((l) => console.log(`  ${l}`));
  }
  if (zonderProject.length > 0) {
    console.log(`\nGEEN PROJECT — deze worden overgeslagen tot het project bestaat (${zonderProject.length}):`);
    zonderProject.forEach((l) => console.log(`  ${l}`));
  }
  if (zonderWerkdagen.length > 0) {
    console.log(`\nGEEN WERKDAGEN — de hele periode valt in een weekend (${zonderWerkdagen.length}):`);
    zonderWerkdagen.forEach((l) => console.log(`  ${l}`));
  }

  if (!write) {
    console.log("\nDroge run. Draai met --write om dit toe te passen.");
    return;
  }

  await db.$transaction(
    plan.flatMap((p) =>
      p.regels.map((r) =>
        db.timeEntry.create({
          data: {
            userId: p.userId,
            projectId: p.projectId,
            date: new Date(`${r.date}T00:00:00Z`),
            hours: r.hours,
            description: p.description,
            absenceRequestId: p.id,
          },
        }),
      ),
    ),
  );
  console.log(`\n${plan.length} aanvragen voorzien van urenregels.`);
}

main().catch(console.error).finally(() => db.$disconnect());
```

Let op drie eigenschappen die er niet toevallig in zitten. Het script schrijft alleen met een exacte
`--write`; het draait alle regels in één `$transaction`, zodat een halve toepassing onmogelijk is;
en aanvragen die het overslaat worden expliciet gemeld met de reden, in plaats van stil te
verdwijnen.

- [ ] **Step 2: Voeg het npm-script toe**

In `package.json` staat bij de scripts:

```json
    "backfill:members": "tsx prisma/backfill-members.ts",
```

Voeg direct daarna toe:

```json
    "backfill:absence-entries": "tsx prisma/backfill-absence-entries.ts",
```

- [ ] **Step 3: Controleer de typen**

Run: `source ~/.nvm/nvm.sh && nvm use 20 && npx tsc --noEmit`
Expected: 0 fouten.

- [ ] **Step 4: Draai het script droog tegen productie**

Dit leest alleen en schrijft niets. Het bewijst dat de query klopt en laat zien wat de uitrol zou
doen.

Run: `set -a; . ./.env.local; set +a; source ~/.nvm/nvm.sh && nvm use 20 && npm run backfill:absence-entries`

Expected: een lijst met goedgekeurde aanvragen van dit jaar. Omdat de verlofprojecten bij de uitrol
pas worden aangemaakt, hoort vrijwel alles onder **GEEN PROJECT** te vallen — dat is de juiste
uitkomst en geen fout. Plak de volledige uitvoer in je rapport.

Faalt hij met een fout over `absenceRequestId` of `timeEntries`, dan mist productie de kolom uit
Task 3; dat klopt, want de migratie is nog niet gedraaid. Meld dat dan als uitkomst in plaats van
iets te wijzigen — en draai in géén geval `db:push`.

- [ ] **Step 5: Controleer de tests**

Run: `source ~/.nvm/nvm.sh && nvm use 20 && npm test`
Expected: 21 bestanden, 202 tests, groen.

- [ ] **Step 6: Commit**

```bash
git add prisma/backfill-absence-entries.ts package.json
git commit -m "feat: backfill voor goedgekeurde aanvragen zonder urenregels"
```

---

## Uitrol

**Door een mens, met de database.**

1. In `/projects` de vijf verlofprojecten aanmaken: **Vakantieverlof**, **Ziekteverlof**,
   **Ouderschapsverlof**, **Bijzonder verlof**, **Onbetaald verlof**. Zonder klant, **niet
   factureerbaar**, **geen deelnemers**. Dit kan vooraf: voor de huidige code is het gewoon een leeg
   project.
2. `prisma migrate diff` draaien en de **volledige** lijst lezen. Er hoort alleen een enum-waarde,
   een nullable kolom en een foreign key bij te komen. Verdwijnt er een kolom, stop dan — bij de
   batch met werkniveaus verdween er onverwacht een kolom die niemand had gecontroleerd.
3. `npm run db:push`.
4. Deployen.
5. `npm run backfill:absence-entries` droog draaien, de uitvoer controleren, dan met `--write`.

Stap 5 komt ná de deploy omdat het script de nieuwe kolom nodig heeft. Stap 1 komt vóór stap 5 omdat
het script aanvragen overslaat waarvan het project ontbreekt.

Handmatig na te lopen na de deploy:

- [ ] Een aanvraag van vijf werkdagen goedkeuren en de vijf regels in `/time` zien staan, met de projectnaam van de verlofsoort.
- [ ] De som van die vijf regels is exact het aangevraagde aantal uren.
- [ ] Diezelfde aanvraag afkeuren en zien dat de regels verdwijnen.
- [ ] Opnieuw goedkeuren met andere datums en zien dat de regels meeschuiven zonder dubbelingen.
- [ ] Een aanvraag over een weekend goedkeuren → zaterdag en zondag worden overgeslagen.
- [ ] Een verlofsoort goedkeuren waarvan het project niet bestaat → weigering die het project noemt, en de aanvraag blijft op In behandeling staan.
- [ ] Als medewerker een verlofregel proberen te bewerken en te verwijderen → geweigerd, knoppen uit met de tooltip.
- [ ] Als admin hetzelfde proberen → ook geweigerd.
- [ ] Op `/reports` een selectie met een verlofregel erin bulksgewijs verplaatsen → de hele actie geweigerd.
- [ ] Een goedgekeurde aanvraag verwijderen en zien dat de urenregels meegaan.
- [ ] `/uren-overzicht` voor een week met verlof: de geboekte uren tellen het verlof mee.
- [ ] Ouderschapsverlof aanvragen, en de soort correct gelabeld terugzien in het afwezigheidsscherm, de vakantiekalender en het standupscherm.
- [ ] Controleren dat een verlofproject niet in de projectkeuzelijst van `/time` staat.
- [ ] Controleren dat een verlofregel niet in de factuuropbouw verschijnt.
