# Work Schedule Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Leg per medewerker vast hoeveel uur hij op elke weekdag werkt, en laat de urenherinnering, het standupscherm en de weekweergave van `/time` daarmee rekenen.

**Architecture:** Eén tabel `WorkSchedule` met `userId` als primaire sleutel — één rij per persoon of geen, en "geen" betekent letterlijk "reken zoals je nu rekent". Eén pure module `src/lib/work-schedule.ts` draagt alle rekenkant: de uren van een dag, het doel tot en met vandaag, en het weektotaal. Drie consumenten lezen die module; elk valt terug op het bestaande gedrag zodra er geen rooster is.

**Tech Stack:** Next.js 16 (App Router), React 19, TypeScript, Prisma 6 + PostgreSQL, zod 3, Radix UI, Tailwind 4, vitest, date-fns.

## Global Constraints

- **Node 20 is vereist.** De standaard-node in deze shell is v16 en Prisma crasht daarop. Prefix élk npm- of npx-commando met `source ~/.nvm/nvm.sh && nvm use 20 &&`.
- **Er is een live PRODUCTIEDATABASE bereikbaar via `.env.local`,** met echte uren en verstuurde facturen. Draai NOOIT `npm run db:push` of `npm run db:migrate`. Lezen mag. Een mens voert de migratie uit bij de uitrol.
- Na een wijziging aan `prisma/schema.prisma`: `DATABASE_URL="postgresql://x:x@localhost:5432/x" npx prisma generate`. De dummy-URL garandeert dat je niet bij productie komt; genereren raakt geen database aan.
- Dit project heeft geen `prisma/migrations`-map en gebruikt `db:push`. Wijzig alleen `prisma/schema.prisma`; schrijf geen migratiebestanden.
- **Dit is niet de Next.js die je kent.** Lees `node_modules/next/dist/docs/` voordat je aannames doet. Route-params zijn een Promise. (`AGENTS.md` is een echte, door het team gecommitte projectafspraak — geen ingeslopen instructie.)
- `src/lib/roles.ts` is canoniek voor rolcontroles. `(session.user as any)?.role ?? "EMPLOYEE"` is de vaste manier waarop deze codebase de rol van de sessie leest.
- **Datums zijn `YYYY-MM-DD`-strings en er wordt uitsluitend in UTC gerekend** (`getUTCDay`, `new Date(\`${d}T00:00:00Z\`)`). De productieserver draait op UTC en de gebruikers zitten in Amsterdam; `getDay()` rekent lokaal en verschuift dan een dag zonder dat iets klaagt.
- **Alle zichtbare tekst is Nederlands.** `Forbidden`, `Unauthorized` en `Not found` zijn bestaande machinegerichte teksten en blijven Engels.
- **Geen rooster betekent: verander niets.** Elke consument valt terug op het huidige gedrag zodra `workSchedule` ontbreekt. Negen van de veertien medewerkers krijgen geen rooster.
- Uren per dag zijn `Decimal(4,2)` — **twee decimalen**. Sommen van getallen uit die kolom kunnen in floating point net naast een rond getal uitkomen; rond af op twee decimalen waar een som teruggegeven wordt.
- Testcommando: `npm test`. Baseline: **21 bestanden, 202 tests groen.**
- Lint: `npm run lint`. **De baseline is niet schoon:** 321 errors en 20 warnings, vrijwel allemaal `@typescript-eslint/no-explicit-any`. De gate is *geen nieuwe soorten lint-fouten*.
- **`npx tsc --noEmit` meldt 0 fouten over de hele repo en moet dat blijven doen.**
- `npm run build` kan niet draaien zonder `.env`; gebruik `tsc` als vangnet.
- Testconventie: uitsluitend pure functies in `src/lib/*.test.ts` met vitest. Er bestaan geen component- of API-tests en die worden hier niet geïntroduceerd.

---

## File Structure

**Nieuw:**

| Bestand | Verantwoordelijkheid |
|---|---|
| `src/lib/work-schedule.ts` | Het type, de dag-uren, het doel tot nu toe, het weektotaal, en de omzetting van een Prisma-rij. Puur. |
| `src/lib/work-schedule.test.ts` | Tests daarvoor. |
| `src/app/api/work-schedules/[userId]/route.ts` | `PUT` (upsert) en `DELETE`. Adminonly. |
| `src/components/personeel/work-schedule-client.tsx` | Het blok Weekrooster op de medewerkerspagina. |

**Gewijzigd:**

| Bestand | Wat |
|---|---|
| `prisma/schema.prisma` | `model WorkSchedule`, `User.workSchedule`. |
| `src/app/(app)/personeel/[id]/page.tsx` | Rooster en `weeklyHours` ophalen, blok renderen. |
| `src/app/api/cron/hours-reminder/route.ts` | Doel uit het rooster wanneer dat er is. |
| `src/app/api/standup/route.ts` | `scheduledHours` per medewerker. |
| `src/components/standup/standup-client.tsx` | `werkt niet op <weekdag>` tonen. |
| `src/app/(app)/time/page.tsx` | Rooster van de ingelogde gebruiker meegeven. |
| `src/components/time/time-entries-client.tsx` | Vrije dagen markeren in de weekweergave. |

---

## Task 1: De pure module

**Files:**
- Create: `src/lib/work-schedule.ts`, `src/lib/work-schedule.test.ts`

**Interfaces:**
- Produces:
  - `type WeekSchedule = { monday: number; tuesday: number; wednesday: number; thursday: number; friday: number }`
  - `scheduledHoursOn(schedule: WeekSchedule, date: string): number`
  - `targetSoFar(schedule: WeekSchedule, today: string): number`
  - `weekTotal(schedule: WeekSchedule): number`
  - `toWeekSchedule(row: ScheduleRow | null | undefined): WeekSchedule | null`

- [ ] **Step 1: Write the failing test**

Create `src/lib/work-schedule.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { scheduledHoursOn, targetSoFar, weekTotal, toWeekSchedule } from "./work-schedule";

// Merlijn werkt 32 uur: maandag t/m donderdag acht uur, vrijdag vrij.
const MERLIJN = { monday: 8, tuesday: 8, wednesday: 8, thursday: 8, friday: 0 };
// Iemand die middenin de week vrij is — het geval waarvoor de urenherinnering
// vandaag onterecht aanslaat.
const WOENSDAG_VRIJ = { monday: 8, tuesday: 8, wednesday: 0, thursday: 8, friday: 8 };

describe("scheduledHoursOn", () => {
  it("returns zero on a scheduled day off", () => {
    // 2026-08-07 is a Friday.
    expect(scheduledHoursOn(MERLIJN, "2026-08-07")).toBe(0);
  });

  it("returns the scheduled hours on a working day", () => {
    // 2026-08-03 is a Monday.
    expect(scheduledHoursOn(MERLIJN, "2026-08-03")).toBe(8);
  });

  it("returns zero on a Saturday", () => {
    // 2026-08-08 is a Saturday; the schedule has no weekend fields at all.
    expect(scheduledHoursOn(MERLIJN, "2026-08-08")).toBe(0);
  });

  it("returns zero on a Sunday", () => {
    expect(scheduledHoursOn(MERLIJN, "2026-08-09")).toBe(0);
  });
});

describe("targetSoFar", () => {
  it("counts only Monday on a Monday", () => {
    expect(targetSoFar(MERLIJN, "2026-08-03")).toBe(8);
  });

  it("counts through Wednesday on a Wednesday", () => {
    // 2026-08-05 is a Wednesday.
    expect(targetSoFar(MERLIJN, "2026-08-05")).toBe(24);
  });

  it("counts the whole week on a Friday", () => {
    expect(targetSoFar(MERLIJN, "2026-08-07")).toBe(32);
  });

  it("skips a mid-week day off", () => {
    // This is the whole point: today the reminder would expect 40 * 3/5 = 24
    // for a full-timer, and 19.2 for this 32-hour employee — both wrong.
    expect(targetSoFar(WOENSDAG_VRIJ, "2026-08-05")).toBe(16);
  });

  it("counts the whole week on a Saturday", () => {
    expect(targetSoFar(MERLIJN, "2026-08-08")).toBe(32);
  });

  it("counts the whole week on a Sunday", () => {
    // Sunday is day 0, which must not read as "no weekdays elapsed yet".
    expect(targetSoFar(MERLIJN, "2026-08-09")).toBe(32);
  });
});

describe("weekTotal", () => {
  it("adds the five days", () => {
    expect(weekTotal(MERLIJN)).toBe(32);
  });

  it("returns zero for an empty schedule", () => {
    expect(weekTotal({ monday: 0, tuesday: 0, wednesday: 0, thursday: 0, friday: 0 })).toBe(0);
  });

  it("does not leak floating-point noise", () => {
    // 6.4 * 5 is 32.00000000000001 in floating point. The column is
    // Decimal(4,2), so the answer must read back as a clean 32.
    expect(weekTotal({ monday: 6.4, tuesday: 6.4, wednesday: 6.4, thursday: 6.4, friday: 6.4 })).toBe(32);
  });
});

describe("toWeekSchedule", () => {
  it("returns null when there is no row", () => {
    expect(toWeekSchedule(null)).toBeNull();
    expect(toWeekSchedule(undefined)).toBeNull();
  });

  it("converts Prisma Decimals to plain numbers", () => {
    // Prisma hands back Decimal objects, not numbers; everything downstream
    // does arithmetic, so they have to be converted once, here.
    const row = { monday: "8.00", tuesday: "8.00", wednesday: "8.00", thursday: "8.00", friday: "0.00" };
    expect(toWeekSchedule(row)).toEqual(MERLIJN);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `source ~/.nvm/nvm.sh && nvm use 20 && npx vitest run src/lib/work-schedule.test.ts`
Expected: FAIL — `Failed to resolve import "./work-schedule"`.

- [ ] **Step 3: Write the module**

Create `src/lib/work-schedule.ts`:

```ts
/**
 * Het vaste weekrooster van een medewerker: hoeveel uur hij op elke weekdag
 * werkt. Nul betekent nul, niet "niet ingevuld" — één rij per persoon bestaat
 * of bestaat niet, en dat onderscheid draagt het hele ontwerp: geen rooster
 * betekent overal "reken zoals je nu rekent".
 *
 * Er wordt uitsluitend in UTC gerekend, met `YYYY-MM-DD` in. De productieserver
 * draait op UTC en de gebruikers zitten in Amsterdam; `getDay()` rekent lokaal
 * en verschuift dan een dag zonder dat er iets klaagt.
 *
 * Weekend staat niet in het model: niemand werkt hier op zaterdag of zondag.
 */
export type WeekSchedule = {
  monday: number;
  tuesday: number;
  wednesday: number;
  thursday: number;
  friday: number;
};

/** Ruwe rij zoals Prisma hem geeft: Decimal-objecten, geen getallen. */
export type ScheduleRow = {
  monday: unknown;
  tuesday: unknown;
  wednesday: unknown;
  thursday: unknown;
  friday: unknown;
};

const DAGEN: Array<keyof WeekSchedule> = ["monday", "tuesday", "wednesday", "thursday", "friday"];

/** Index gelijk aan getUTCDay(): 0 = zondag. Weekend heeft geen veld. */
const PER_WEEKDAG: Array<keyof WeekSchedule | null> = [
  null, "monday", "tuesday", "wednesday", "thursday", "friday", null,
];

/** Sommen van Decimal(4,2)-waarden kunnen net naast een rond getal landen. */
function rond(n: number): number {
  return Math.round(n * 100) / 100;
}

/** De geroosterde uren voor een datum. Zaterdag en zondag geven altijd 0. */
export function scheduledHoursOn(schedule: WeekSchedule, date: string): number {
  const veld = PER_WEEKDAG[new Date(`${date}T00:00:00Z`).getUTCDay()];
  return veld ? schedule[veld] : 0;
}

/**
 * De som van de geroosterde uren van de verstreken weekdagen van deze week,
 * de dag zelf meegerekend.
 *
 * In het weekend is de hele week voorbij: zaterdag en zondag geven het
 * weektotaal. Zondag is `getUTCDay() === 0`, en dat mag niet als "nog geen
 * enkele weekdag verstreken" gelezen worden.
 */
export function targetSoFar(schedule: WeekSchedule, today: string): number {
  const dag = new Date(`${today}T00:00:00Z`).getUTCDay();
  const verstreken = dag === 0 ? 5 : Math.min(dag, 5);
  return rond(DAGEN.slice(0, verstreken).reduce((som, d) => som + schedule[d], 0));
}

/** Het weektotaal. Voor het scherm en om met weeklyHours te vergelijken. */
export function weekTotal(schedule: WeekSchedule): number {
  return rond(DAGEN.reduce((som, d) => som + schedule[d], 0));
}

/**
 * Zet een Prisma-rij om naar getallen, of geeft null wanneer er geen rij is.
 * Alle consumenten rekenen met getallen; de omzetting hoort één keer te
 * gebeuren, hier.
 */
export function toWeekSchedule(row: ScheduleRow | null | undefined): WeekSchedule | null {
  if (!row) return null;
  return {
    monday: Number(row.monday),
    tuesday: Number(row.tuesday),
    wednesday: Number(row.wednesday),
    thursday: Number(row.thursday),
    friday: Number(row.friday),
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `source ~/.nvm/nvm.sh && nvm use 20 && npx vitest run src/lib/work-schedule.test.ts`
Expected: PASS, 15 tests.

- [ ] **Step 5: Controleer de typen en de volledige suite**

Run: `source ~/.nvm/nvm.sh && nvm use 20 && npx tsc --noEmit`
Expected: 0 fouten.

Run: `source ~/.nvm/nvm.sh && nvm use 20 && npm test`
Expected: 22 bestanden, 217 tests, groen.

- [ ] **Step 6: Commit**

```bash
git add src/lib/work-schedule.ts src/lib/work-schedule.test.ts
git commit -m "feat: pure module voor het vaste weekrooster"
```

---

## Task 2: Het datamodel en de routes

**Files:**
- Modify: `prisma/schema.prisma`
- Create: `src/app/api/work-schedules/[userId]/route.ts`

**Interfaces:**
- Consumes: niets uit Task 1.
- Produces:
  - Prisma: `model WorkSchedule` met `userId` als `@id`, en `User.workSchedule`.
  - `PUT /api/work-schedules/[userId]` met `{ monday, tuesday, wednesday, thursday, friday }` → de opgeslagen rij met getallen.
  - `DELETE /api/work-schedules/[userId]` → `{ success: true }`.

**Deze taak levert geen unittests op.** Het zijn schemawijzigingen en twee handlers; de rekenlogica
zit al in Task 1.

- [ ] **Step 1: Voeg het model toe**

Voeg in `prisma/schema.prisma` toe, direct ná `model VacationBudget { ... }`:

```prisma
model WorkSchedule {
  // userId is meteen de sleutel: één rooster per persoon, of geen. Dat
  // onderscheid draagt het ontwerp — het ontbreken van een rij betekent overal
  // "reken zoals je nu rekent", en een rij die bestaat is een bewuste keuze
  // van een admin, geen default die per ongeluk voor iedereen aan staat.
  userId    String   @id
  user      User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  // Verplicht en niet nullable: een dag leeg laten is dubbelzinnig — nul uur,
  // of niet ingevuld? Nul is nul.
  monday    Decimal  @db.Decimal(4, 2)
  tuesday   Decimal  @db.Decimal(4, 2)
  wednesday Decimal  @db.Decimal(4, 2)
  thursday  Decimal  @db.Decimal(4, 2)
  friday    Decimal  @db.Decimal(4, 2)
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
}
```

In `model User`, voeg toe bij de andere relatievelden (direct ná `standupNotes`):

```prisma
  workSchedule        WorkSchedule?
```

- [ ] **Step 2: Genereer de Prisma-client opnieuw**

Run: `source ~/.nvm/nvm.sh && nvm use 20 && DATABASE_URL="postgresql://x:x@localhost:5432/x" npx prisma generate`
Expected: `Generated Prisma Client`. Dit raakt geen database aan.

- [ ] **Step 3: Maak de route**

Create `src/app/api/work-schedules/[userId]/route.ts`:

```ts
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { z } from "zod";
import { handleError } from "@/lib/api";
import { isAdmin } from "@/lib/roles";

const dag = z.number().min(0).max(24);

const schema = z.object({
  monday: dag,
  tuesday: dag,
  wednesday: dag,
  thursday: dag,
  friday: dag,
});

export async function PUT(req: Request, { params }: { params: Promise<{ userId: string }> }) {
  try {
    const session = await auth();
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const role = (session.user as any)?.role ?? "EMPLOYEE";
    if (!isAdmin(role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    const { userId } = await params;

    const data = schema.parse(await req.json());

    const user = await prisma.user.findUnique({ where: { id: userId }, select: { id: true } });
    if (!user) return NextResponse.json({ error: "Onbekende medewerker" }, { status: 400 });

    const rooster = await prisma.workSchedule.upsert({
      where: { userId },
      create: { userId, ...data },
      update: data,
    });

    // Decimals worden als object geserialiseerd; de client rekent met getallen.
    return NextResponse.json({
      monday: Number(rooster.monday),
      tuesday: Number(rooster.tuesday),
      wednesday: Number(rooster.wednesday),
      thursday: Number(rooster.thursday),
      friday: Number(rooster.friday),
    });
  } catch (e) { return handleError(e); }
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ userId: string }> }) {
  try {
    const session = await auth();
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const role = (session.user as any)?.role ?? "EMPLOYEE";
    if (!isAdmin(role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    const { userId } = await params;

    // deleteMany, niet delete: een rooster verwijderen dat er niet is hoort
    // geen fout te geven maar een no-op te zijn.
    await prisma.workSchedule.deleteMany({ where: { userId } });
    return NextResponse.json({ success: true });
  } catch (e) { return handleError(e); }
}
```

- [ ] **Step 4: Controleer de typen en de tests**

Run: `source ~/.nvm/nvm.sh && nvm use 20 && npx tsc --noEmit`
Expected: 0 fouten.

Run: `source ~/.nvm/nvm.sh && nvm use 20 && npm test`
Expected: 22 bestanden, 217 tests, groen.

- [ ] **Step 5: Commit**

```bash
git add prisma/schema.prisma "src/app/api/work-schedules/[userId]/route.ts"
git commit -m "feat: WorkSchedule-tabel en de routes om hem te beheren"
```

---

## Task 3: Het blok op de medewerkerspagina

**Files:**
- Create: `src/components/personeel/work-schedule-client.tsx`
- Modify: `src/app/(app)/personeel/[id]/page.tsx`

**Interfaces:**
- Consumes: `WeekSchedule`, `weekTotal`, `toWeekSchedule` uit Task 1; de routes uit Task 2.

**Deze taak levert geen unittests op.** Het is een clientcomponent met formuliertoestand; de repo
heeft geen componenttests.

- [ ] **Step 1: Maak de clientcomponent**

Create `src/components/personeel/work-schedule-client.tsx`:

```tsx
"use client";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { weekTotal, type WeekSchedule } from "@/lib/work-schedule";

const LEEG: WeekSchedule = { monday: 0, tuesday: 0, wednesday: 0, thursday: 0, friday: 0 };

const VELDEN: Array<{ key: keyof WeekSchedule; label: string }> = [
  { key: "monday", label: "Ma" },
  { key: "tuesday", label: "Di" },
  { key: "wednesday", label: "Wo" },
  { key: "thursday", label: "Do" },
  { key: "friday", label: "Vr" },
];

interface Props {
  employeeId: string;
  initialSchedule: WeekSchedule | null;
  weeklyHours: number | null;
}

export function WorkScheduleClient({ employeeId, initialSchedule, weeklyHours }: Props) {
  const [rooster, setRooster] = useState<WeekSchedule>(initialSchedule ?? LEEG);
  const [bestaat, setBestaat] = useState(initialSchedule !== null);
  const [loading, setLoading] = useState(false);
  const [fout, setFout] = useState("");

  const totaal = weekTotal(rooster);
  const wijktAf = weeklyHours !== null && Math.round(totaal * 100) !== Math.round(weeklyHours * 100);

  async function opslaan() {
    setLoading(true);
    setFout("");
    try {
      const res = await fetch(`/api/work-schedules/${employeeId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(rooster),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setFout(body.error ?? `Fout ${res.status}`);
        return;
      }
      setRooster(body);
      setBestaat(true);
    } finally {
      setLoading(false);
    }
  }

  async function verwijderen() {
    if (!confirm("Weet u zeker dat u het weekrooster wilt verwijderen? Deze medewerker valt dan terug op de standaardberekening.")) return;
    setLoading(true);
    setFout("");
    try {
      const res = await fetch(`/api/work-schedules/${employeeId}`, { method: "DELETE" });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setFout(body.error ?? `Fout ${res.status}`);
        return;
      }
      setRooster(LEEG);
      setBestaat(false);
    } finally {
      setLoading(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Weekrooster</CardTitle>
        <CardDescription>
          Hoeveel uur deze medewerker op elke weekdag werkt. Zonder rooster blijft de
          urenherinnering rekenen met de weekuren gedeeld over vijf dagen.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap gap-3">
          {VELDEN.map((v) => (
            <div key={v.key} className="space-y-1">
              <Label>{v.label}</Label>
              <Input
                type="number"
                step="0.25"
                min="0"
                max="24"
                className="w-20"
                value={rooster[v.key]}
                onChange={(e) =>
                  setRooster((prev) => ({ ...prev, [v.key]: Number(e.target.value) || 0 }))
                }
              />
            </div>
          ))}
        </div>

        <p className="text-sm">
          <span className="font-medium tabular-nums">{totaal.toFixed(2)}</span> uur per week
        </p>

        {wijktAf && (
          <p className="text-sm text-muted-foreground">
            Weekuren staan op {weeklyHours!.toFixed(2)} — dit rooster telt op tot {totaal.toFixed(2)}.
          </p>
        )}

        {fout && <p className="text-sm text-destructive">{fout}</p>}

        <div className="flex gap-2">
          <Button onClick={opslaan} disabled={loading}>
            {loading ? "Opslaan..." : bestaat ? "Rooster bijwerken" : "Rooster instellen"}
          </Button>
          {bestaat && (
            <Button variant="outline" onClick={verwijderen} disabled={loading}>
              Rooster verwijderen
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
```

De afwijkingsmelding is bewust **niet blokkerend**. `weeklyHours` en het rooster zijn twee
onafhankelijke velden, en op productie zijn `weeklyHours` en `Contract.contractHours` voor drie van
de veertien medewerkers al niet in overeenstemming terwijl er niets mis is. Een harde controle zou
daar meteen op stuklopen.

- [ ] **Step 2: Haal het rooster op en render het blok**

In `src/app/(app)/personeel/[id]/page.tsx`, voeg bovenaan toe bij de imports:

```tsx
import { WorkScheduleClient } from "@/components/personeel/work-schedule-client";
import { toWeekSchedule } from "@/lib/work-schedule";
```

In de `prisma.user.findUnique`-select staat:

```tsx
      id: true, name: true, email: true, role: true,
```

Wijzig die regel naar:

```tsx
      id: true, name: true, email: true, role: true, weeklyHours: true, workSchedule: true,
```

Voeg in de `return` een blok toe, direct ná `<CommuteTemplateClient ... />`:

```tsx
      <WorkScheduleClient
        employeeId={user.id}
        initialSchedule={toWeekSchedule(user.workSchedule)}
        weeklyHours={user.weeklyHours === null ? null : Number(user.weeklyHours)}
      />
```

- [ ] **Step 3: Controleer de typen en de tests**

Run: `source ~/.nvm/nvm.sh && nvm use 20 && npx tsc --noEmit`
Expected: 0 fouten.

Run: `source ~/.nvm/nvm.sh && nvm use 20 && npm test`
Expected: 22 bestanden, 217 tests, groen.

- [ ] **Step 4: Commit**

```bash
git add src/components/personeel/work-schedule-client.tsx "src/app/(app)/personeel/[id]/page.tsx"
git commit -m "feat: weekrooster instellen op de medewerkerspagina"
```

---

## Task 4: De urenherinnering

**Files:**
- Modify: `src/app/api/cron/hours-reminder/route.ts`

**Interfaces:**
- Consumes: `targetSoFar`, `weekTotal`, `toWeekSchedule` uit Task 1.

**Deze taak levert geen unittests op.** De rekenlogica zit al in Task 1; wat hier bijkomt is de
keuze tussen twee berekeningen en een ruimere query.

- [ ] **Step 1: Voeg de import toe**

Bovenaan `src/app/api/cron/hours-reminder/route.ts`:

```ts
import { targetSoFar, weekTotal, toWeekSchedule } from "@/lib/work-schedule";
```

- [ ] **Step 2: Verruim de query**

Er staat nu:

```ts
  const users = await prisma.user.findMany({
    where: { weeklyHours: { not: null }, archivedAt: null },
    select: { id: true, name: true, email: true, weeklyHours: true },
  });
```

Vervang door:

```ts
  const users = await prisma.user.findMany({
    // Wie een rooster heeft doet mee, ook zonder weeklyHours: het rooster
    // vertelt precies wat er van hem verwacht wordt. Zonder deze OR zouden de
    // medewerkers die wél een rooster krijgen maar geen weeklyHours hebben
    // nooit een herinnering ontvangen.
    where: {
      archivedAt: null,
      OR: [{ weeklyHours: { not: null } }, { workSchedule: { isNot: null } }],
    },
    select: { id: true, name: true, email: true, weeklyHours: true, workSchedule: true },
  });
```

- [ ] **Step 3: Kies de berekening per medewerker**

In de `for (const user of users)`-lus staat nu:

```ts
    const weeklyHours = Number(user.weeklyHours!);
    // Pro-rate target based on elapsed working days
    const proratedTarget = weeklyHours * (elapsedDays / 5);
    const loggedHours = hoursMap.get(user.id) ?? 0;
```

Vervang door:

```ts
    // Met rooster: het doel is de som van de verstreken weekdagen. Zonder
    // rooster blijft het exact zoals het was — weekuren gedeeld over vijf
    // dagen. Negen van de veertien medewerkers hebben geen rooster en mogen
    // hier niets van merken.
    const rooster = toWeekSchedule(user.workSchedule);
    const weeklyHours = rooster ? weekTotal(rooster) : Number(user.weeklyHours!);
    const proratedTarget = rooster
      ? targetSoFar(rooster, vandaag)
      : weeklyHours * (elapsedDays / 5);
    const loggedHours = hoursMap.get(user.id) ?? 0;
```

`weeklyHours` gaat als vierde argument naar `sendHoursReminderEmail`, waar de parameter
`hoursExpected` heet — het weektotaal uit het rooster past daar zonder verdere wijziging in.

- [ ] **Step 4: Bepaal de datum in UTC**

`targetSoFar` neemt een `YYYY-MM-DD`-string. Voeg direct ná de bestaande regel
`const elapsedDays = ...` toe:

```ts
  // UTC, net als de rest van de datumberekeningen in deze codebase. De cron
  // draait op vrijdag 14:00 UTC, dus dit is dezelfde dag als lokaal.
  const vandaag = now.toISOString().slice(0, 10);
```

- [ ] **Step 5: Controleer de typen en de tests**

Run: `source ~/.nvm/nvm.sh && nvm use 20 && npx tsc --noEmit`
Expected: 0 fouten.

Run: `source ~/.nvm/nvm.sh && nvm use 20 && npm test`
Expected: 22 bestanden, 217 tests, groen.

- [ ] **Step 6: Commit**

```bash
git add src/app/api/cron/hours-reminder/route.ts
git commit -m "feat: urenherinnering rekent met het weekrooster wanneer dat er is"
```

---

## Task 5: Het standupscherm

**Files:**
- Modify: `src/app/api/standup/route.ts`
- Modify: `src/components/standup/standup-client.tsx`

**Interfaces:**
- Consumes: `scheduledHoursOn`, `toWeekSchedule` uit Task 1.
- Produces: `scheduledHours: number | null` per lid in het antwoord van `GET /api/standup`.

**Deze taak levert geen unittests op.** Het is één veld erbij in een route en één regel tekst in een
clientcomponent.

- [ ] **Step 1: Voeg het veld toe aan de route**

In `src/app/api/standup/route.ts`, voeg bovenaan toe bij de imports:

```ts
import { scheduledHoursOn, toWeekSchedule } from "@/lib/work-schedule";
```

In de `prisma.user.findMany` binnen de `Promise.all` staat:

```ts
        select: { id: true, name: true },
```

Wijzig naar:

```ts
        select: { id: true, name: true, workSchedule: true },
```

In het antwoord staat:

```ts
      members: users.map((u) => ({
        userId: u.id,
        userName: u.name,
        entries: urenPer.get(u.id) ?? [],
        absence: afwezigPer.get(u.id) ?? null,
        previousNote: vorigePer.get(u.id) ?? null,
        note: huidigePer.get(u.id) ?? "",
      })),
```

Vervang door:

```ts
      members: users.map((u) => {
        // null betekent "geen rooster" en niet "nul uur": het scherm mag dan
        // niets zeggen over werkdagen.
        const rooster = toWeekSchedule(u.workSchedule);
        return {
          userId: u.id,
          userName: u.name,
          entries: urenPer.get(u.id) ?? [],
          absence: afwezigPer.get(u.id) ?? null,
          scheduledHours: rooster ? scheduledHoursOn(rooster, vorigeWerkdag) : null,
          previousNote: vorigePer.get(u.id) ?? null,
          note: huidigePer.get(u.id) ?? "",
        };
      }),
```

- [ ] **Step 2: Toon het in de client**

In `src/components/standup/standup-client.tsx` staat de `Member`-interface:

```tsx
interface Member {
  userId: string;
  userName: string | null;
  entries: Entry[];
  absence: string | null;
  previousNote: string | null;
  note: string;
}
```

Voeg toe ná `absence`:

```tsx
  scheduledHours: number | null;
```

Voeg onder de bestaande `nl()`-functie een tweede helper toe:

```tsx
function weekdag(d: string) {
  return new Date(`${d}T00:00:00Z`).toLocaleDateString("nl-NL", { weekday: "long", timeZone: "UTC" });
}
```

In de urenlijst per medewerker staat:

```tsx
              {m.entries.length === 0 ? (
                <p className="text-muted-foreground">geen uren geboekt</p>
              ) : (
```

Vervang de lege-tak door:

```tsx
              {m.entries.length === 0 ? (
                // Een afwezigheid is de uitzonderlijkere mededeling en wint
                // daarom van het rooster: wie op zijn vaste vrije dag ook nog
                // vakantie opnam, ziet die badge al naast zijn naam staan.
                <p className="text-muted-foreground">
                  {m.scheduledHours === 0 && !m.absence
                    ? `werkt niet op ${weekdag(data.previousWorkingDay)}`
                    : "geen uren geboekt"}
                </p>
              ) : (
```

- [ ] **Step 3: Controleer de typen en de tests**

Run: `source ~/.nvm/nvm.sh && nvm use 20 && npx tsc --noEmit`
Expected: 0 fouten.

Run: `source ~/.nvm/nvm.sh && nvm use 20 && npm test`
Expected: 22 bestanden, 217 tests, groen.

- [ ] **Step 4: Commit**

```bash
git add src/app/api/standup/route.ts src/components/standup/standup-client.tsx
git commit -m "feat: standup toont wie er die dag niet werkt"
```

---

## Task 6: De weekweergave van /time

**Files:**
- Modify: `src/app/(app)/time/page.tsx`
- Modify: `src/components/time/time-entries-client.tsx`

**Interfaces:**
- Consumes: `scheduledHoursOn`, `toWeekSchedule`, `WeekSchedule` uit Task 1.

**Deze taak levert geen unittests op.** Het is één prop en één markering in de weekweergave.

- [ ] **Step 1: Geef het rooster van de ingelogde gebruiker mee**

In `src/app/(app)/time/page.tsx`, voeg bovenaan toe bij de imports:

```tsx
import { toWeekSchedule } from "@/lib/work-schedule";
```

Direct ná de bestaande `const currentUserLevel = ...` (regel 65-67) staat de `return`. Voeg vóór die
`return` toe:

```tsx
  // Het rooster van de INGELOGDE gebruiker. De weekweergave is één raster, niet
  // één per persoon, dus een admin die andermans uren bekijkt ziet zijn eigen
  // vrije dagen gemarkeerd. Zonder rooster verandert er niets.
  const eigenRooster = userId
    ? await prisma.workSchedule.findUnique({ where: { userId } })
    : null;
```

`userId` is in dit bestand al `session?.user?.id ?? ""` (regel 9); de lege string wordt afgevangen
zodat een sessie zonder id geen query doet.

Voeg in de bestaande `<TimeEntriesClient ... />` een prop toe, ná `currentUserLevel`:

```tsx
      workSchedule={toWeekSchedule(eigenRooster)}
```

- [ ] **Step 2: Markeer de vrije dagen**

In `src/components/time/time-entries-client.tsx`, voeg bovenaan toe bij de imports:

```tsx
import { scheduledHoursOn, type WeekSchedule } from "@/lib/work-schedule";
```

Voeg `workSchedule: WeekSchedule | null;` toe aan de `Props`-interface van de component, en
`workSchedule` aan de gedestructureerde parameters.

In de dagkoppen van de weekweergave staat:

```tsx
                {weekDays.map((day, i) => {
                  const dayStr = format(day, "yyyy-MM-dd");
                  const isToday = dayStr === today;
                  const isSelected = selectedDay === dayStr;
                  const h = hoursPerDay[i];
```

Voeg direct ná `const h = hoursPerDay[i];` toe:

```tsx
                  // Alleen markeren als er ook niets geboekt is: boekte je toch
                  // uren op je vrije dag, dan is dát de informatie die telt.
                  const vrijeDag = workSchedule !== null && scheduledHoursOn(workSchedule, dayStr) === 0 && h === 0;
```

En vervang in datzelfde blok:

```tsx
                      <span className={cn("text-sm tabular-nums mt-1", h === 0 ? "text-muted-foreground" : "font-medium")}>
                        {formatHours(h)}
                      </span>
```

door:

```tsx
                      <span className={cn("text-sm tabular-nums mt-1", h === 0 ? "text-muted-foreground" : "font-medium")}>
                        {vrijeDag ? "vrij" : formatHours(h)}
                      </span>
```

Let op: `weekDays` telt zeven dagen, dus zaterdag en zondag komen hier ook langs.
`scheduledHoursOn` geeft voor het weekend altijd 0, dus die dagen krijgen ook `vrij` te zien — voor
iemand met een rooster is dat juist, en voor iemand zonder rooster verandert er niets omdat
`workSchedule` dan `null` is.

- [ ] **Step 3: Controleer de typen en de tests**

Run: `source ~/.nvm/nvm.sh && nvm use 20 && npx tsc --noEmit`
Expected: 0 fouten.

Run: `source ~/.nvm/nvm.sh && nvm use 20 && npm test`
Expected: 22 bestanden, 217 tests, groen.

- [ ] **Step 4: Controleer dat elke consument terugvalt zonder rooster**

Run: `grep -rn "toWeekSchedule\|scheduledHoursOn\|targetSoFar" --include=*.ts --include=*.tsx src/`

Loop elke treffer langs en stel per stuk vast wat er gebeurt wanneer er géén rooster is. Overal moet
het antwoord zijn: precies het gedrag van vóór dit traject. Vind je een plek waar een ontbrekend
rooster als nul uur gelezen wordt in plaats van als "geen rooster", meld dat dan — dat is het ene
foutpatroon dat dit hele ontwerp onderuithaalt.

- [ ] **Step 5: Commit**

```bash
git add "src/app/(app)/time/page.tsx" src/components/time/time-entries-client.tsx
git commit -m "feat: weekweergave markeert de vaste vrije dagen"
```

---

## Uitrol

**Door een mens, met de database.**

1. `prisma migrate diff` draaien en de **volledige** lijst lezen. Er hoort alleen één tabel bij te
   komen. Verdwijnt er een kolom, stop dan — bij de batch met werkniveaus verdween er onverwacht
   een kolom die niemand had gecontroleerd.
2. `npm run db:push`.
3. Deployen.
4. Per medewerker onder de 40 uur het weekrooster invullen op `/personeel/[id]`. Dat zijn er vijf:
   Erik Kallen (8), Jort Oosterveld (16), Jasper de Waal (24), Paul van Gelderen (24) en
   Merlijn Kunst (32).

Geen backfill: een rooster is een keuze, geen afgeleide. Zolang stap 4 niet gedaan is verandert er
voor niemand iets, en dat is precies de bedoeling — de deploy is daarmee risicoloos.

Handmatig na te lopen na de deploy:

- [ ] Bij een medewerker een rooster invullen en het totaal onder de velden zien meelopen.
- [ ] Een rooster invullen dat niet optelt tot de weekuren → de opmerking verschijnt, opslaan lukt gewoon.
- [ ] De pagina verversen en het rooster terugzien zoals je het opsloeg.
- [ ] Een rooster verwijderen en zien dat het blok terugvalt op nullen en de verwijderknop weg is.
- [ ] Als niet-admin `PUT` en `DELETE` op `/api/work-schedules/<id>` aanroepen → 403.
- [ ] De standup openen op een dag waarop iemand met een rooster niet werkt → `werkt niet op <weekdag>`.
- [ ] Diezelfde persoon met een goedgekeurde vakantie op die dag → `afwezig — vakantie` wint.
- [ ] Iemand zonder rooster op de standup → nog steeds `geen uren geboekt`.
- [ ] In de weekweergave van `/time` als iemand met een rooster: de vrije dag toont `vrij`.
- [ ] Op een vrije dag toch uren boeken → de dag toont die uren, niet `vrij`.
- [ ] Als iemand zonder rooster: er is niets veranderd aan `/time`.
- [ ] De urenherinnering van vrijdag: iemand met een rooster krijgt geen mail meer als hij zijn geroosterde uren gehaald heeft, en iemand zonder rooster krijgt precies wat hij vorige week kreeg.
