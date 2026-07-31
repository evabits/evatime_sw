# Work Level Rates Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Geef elke medewerker een werkniveau, laat het uurtarief per niveau instellen bij de klant en overrulebaar per project, en maak dat de enige bron van het uurtarief.

**Architecture:** Eén pure functie `resolveHourRate` in `src/lib/rates.ts` wordt de enige plek waar een uurtarief tot stand komt; hij geeft `null` als er geen tarief te bepalen valt, zodat "onbepaalbaar" nooit meer als € 0,00 doorglipt. De tarieven komen mee op de urenregel via Prisma-`include`, niet via losse lookup-tabellen. De taken bouwen eerst additief (nieuwe kolommen en tabellen), zetten dan de drie bestaande tariefberekeningen om, en ruimen pas als laatste de oude tariefbronnen op — zo blijft de repo na elke taak werkend.

**Tech Stack:** Next.js 16 (App Router), React 19, TypeScript, Prisma 6 + PostgreSQL, zod 3, react-hook-form, Radix UI, Tailwind 4, vitest.

## Global Constraints

- **Node 20 is vereist.** De standaard-node in deze shell is v16 en npm weigert daarop te draaien. Prefix élk npm- of npx-commando met `source ~/.nvm/nvm.sh && nvm use 20 &&`. De `.nvmrc` vraagt om 24, maar die staat niet geïnstalleerd. Installeer geen andere node-versie.
- **Dit is niet de Next.js die je kent.** Lees `node_modules/next/dist/docs/` voordat je aannames doet. Clientcomponenten hebben `"use client"` bovenaan nodig; route-params zijn een Promise (`const { id } = await params`).
- **Er is geen database beschikbaar.** `npm run db:push`, `npm run db:migrate` en `npm run build` kunnen hier niet draaien (geen `.env`, geen `DATABASE_URL`). Na elke wijziging aan `prisma/schema.prisma` moet je wél `npx prisma generate` draaien, anders kent TypeScript de nieuwe velden niet. Klaagt dat commando over een ontbrekende `DATABASE_URL`, draai het dan als `DATABASE_URL="postgresql://x:x@localhost:5432/x" npx prisma generate` — genereren raakt de database niet aan.
- **Dit project heeft geen `prisma/migrations`-map** en gebruikt `db:push`. Wijzig alleen `prisma/schema.prisma`; schrijf geen migratiebestanden.
- **`src/lib/roles.ts` is canoniek voor rolcontroles.** Gebruik `isAdmin(role)`, nooit een losse stringvergelijking. `(session.user as any)?.role ?? "EMPLOYEE"` is de vaste manier waarop deze codebase de rol van de sessie leest.
- **Alle zichtbare tekst is Nederlands.** De niveaulabels zijn exact: `Productie`, `Junior Engineer`, `Medior Engineer`, `Senior Engineer`. De markering voor een onbepaalbaar tarief is exact `Geen tarief`.
- **Een tarief moet positief zijn.** Nul is niet op te slaan, zodat "geen tarief" en "gratis" niet door elkaar kunnen lopen.
- Testcommando: `npm test`. Losse suite: `npx vitest run src/lib/<naam>.test.ts`. Baseline: 13 bestanden, 98 tests groen.
- Lint: `npm run lint`. **De baseline is niet schoon:** 304 errors en 22 warnings, vrijwel allemaal `@typescript-eslint/no-explicit-any`, want deze codebase gebruikt `any` overal in props en entry-objecten. De gate is *geen nieuwe soorten lint-fouten*, niet nul. Ruim bestaande fouten niet op.
- `npx tsc --noEmit` meldt 54 pre-existing fouten. Geen daarvan hoort in een bestand dat jij aanraakt.
- Tests staan als `src/lib/*.test.ts` en dekken pure functies. Deze repo heeft geen component- of API-tests en die conventie blijft.

---

## File Structure

**Nieuw:**

| Bestand | Verantwoordelijkheid |
|---|---|
| `src/lib/work-levels.ts` | De vier niveaus als string-union, hun Nederlandse labels en hun volgorde. |
| `src/lib/work-levels.test.ts` | Tests daarvoor. |
| `src/lib/rates.ts` | `resolveHourRate` en `effectiveWorkLevel` — de enige plek waar een uurtarief tot stand komt. |
| `src/lib/rates.test.ts` | Tests daarvoor. |
| `src/components/shared/level-rate-fields.tsx` | Vier tariefvelden, één per niveau. Gedeeld door het klant- en het projectformulier. |

**Gewijzigd:** `prisma/schema.prisma`, `src/lib/user-schema.ts`, `src/lib/projects.ts` (+ test), `src/lib/report-totals.ts` (+ test), `src/app/api/users/route.ts`, `src/app/api/users/[id]/route.ts`, `src/app/api/customers/route.ts`, `src/app/api/customers/[id]/route.ts`, `src/app/api/projects/route.ts`, `src/app/api/projects/[id]/route.ts`, `src/app/api/time/route.ts`, `src/app/api/time/[id]/route.ts`, `src/app/api/reports/route.ts`, `src/app/(app)/time/page.tsx`, `src/app/(app)/reports/page.tsx`, `src/app/(app)/invoices/new/page.tsx`, `src/components/users/users-client.tsx`, `src/components/customers/customers-client.tsx`, `src/components/projects/projects-client.tsx`, `src/components/time/time-entries-client.tsx`, `src/components/reports/time-rows.tsx`, `src/components/invoices/new-invoice-client.tsx`, `src/components/activity-types/activity-types-client.tsx`.

**Verwijderd (pas in Task 9):** `src/app/api/projects/[id]/rates/route.ts`.

---

## Task 1: Niveaus en schema (additief)

**Files:**
- Create: `src/lib/work-levels.ts`, `src/lib/work-levels.test.ts`
- Modify: `prisma/schema.prisma`

**Interfaces:**
- Produces:
  - `type WorkLevel = "PRODUCTION" | "JUNIOR" | "MEDIOR" | "SENIOR"`
  - `const WORK_LEVEL_ORDER: WorkLevel[]`
  - `const WORK_LEVEL_LABELS: Record<WorkLevel, string>`
  - Prisma: `enum WorkLevel`, `User.workLevel`, `TimeEntry.workLevel`, `model CustomerLevelRate`, `model ProjectLevelRate`.

Deze taak verwijdert nog niets — de repo blijft na afloop werken zoals hij was.

- [ ] **Step 1: Write the failing test**

Create `src/lib/work-levels.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { WORK_LEVEL_ORDER, WORK_LEVEL_LABELS } from "./work-levels";

describe("work levels", () => {
  it("lists the four levels from least to most senior", () => {
    expect(WORK_LEVEL_ORDER).toEqual(["PRODUCTION", "JUNIOR", "MEDIOR", "SENIOR"]);
  });

  it("has a Dutch label for every level", () => {
    expect(WORK_LEVEL_ORDER.map((l) => WORK_LEVEL_LABELS[l])).toEqual([
      "Productie", "Junior Engineer", "Medior Engineer", "Senior Engineer",
    ]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `source ~/.nvm/nvm.sh && nvm use 20 && npx vitest run src/lib/work-levels.test.ts`
Expected: FAIL — `Failed to resolve import "./work-levels"`.

- [ ] **Step 3: Write the module**

Create `src/lib/work-levels.ts`:

```ts
/**
 * De vier werkniveaus. Bewust een string-union en geen import van de door
 * Prisma gegenereerde enum, zodat clientcomponenten dit type kunnen gebruiken
 * zonder @prisma/client mee te bundelen. De waarden zijn identiek aan de enum
 * in schema.prisma.
 */
export type WorkLevel = "PRODUCTION" | "JUNIOR" | "MEDIOR" | "SENIOR";

/** Van minst naar meest senior; dit is ook de volgorde in elke keuzelijst. */
export const WORK_LEVEL_ORDER: WorkLevel[] = ["PRODUCTION", "JUNIOR", "MEDIOR", "SENIOR"];

export const WORK_LEVEL_LABELS: Record<WorkLevel, string> = {
  PRODUCTION: "Productie",
  JUNIOR: "Junior Engineer",
  MEDIOR: "Medior Engineer",
  SENIOR: "Senior Engineer",
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `source ~/.nvm/nvm.sh && nvm use 20 && npx vitest run src/lib/work-levels.test.ts`
Expected: PASS, 2 tests.

- [ ] **Step 5: Breid het Prisma-schema uit**

In `prisma/schema.prisma`, voeg de enum toe direct onder `enum Role`:

```prisma
enum WorkLevel {
  PRODUCTION
  JUNIOR
  MEDIOR
  SENIOR
}
```

Voeg aan `model User` toe, onder `weeklyHours`:

```prisma
  workLevel         WorkLevel?
```

Voeg aan `model TimeEntry` toe, onder `billable`:

```prisma
  workLevel      WorkLevel?
```

Voeg aan `model Customer` toe, bij de relaties onderaan:

```prisma
  levelRates CustomerLevelRate[]
```

Voeg aan `model Project` toe, bij de relaties:

```prisma
  levelRates        ProjectLevelRate[]
```

En twee nieuwe modellen, direct onder `model ProjectActivityRate`:

```prisma
model CustomerLevelRate {
  id         String    @id @default(cuid())
  customerId String
  customer   Customer  @relation(fields: [customerId], references: [id], onDelete: Cascade)
  level      WorkLevel
  rate       Decimal   @db.Decimal(10, 2)
  createdAt  DateTime  @default(now())
  updatedAt  DateTime  @updatedAt

  @@unique([customerId, level])
}

model ProjectLevelRate {
  id        String    @id @default(cuid())
  projectId String
  project   Project   @relation(fields: [projectId], references: [id], onDelete: Cascade)
  level     WorkLevel
  rate      Decimal   @db.Decimal(10, 2)
  createdAt DateTime  @default(now())
  updatedAt DateTime  @updatedAt

  @@unique([projectId, level])
}
```

- [ ] **Step 6: Genereer de Prisma-client en controleer**

Run: `source ~/.nvm/nvm.sh && nvm use 20 && DATABASE_URL="postgresql://x:x@localhost:5432/x" npx prisma generate`
Expected: "Generated Prisma Client".

Run daarna: `source ~/.nvm/nvm.sh && nvm use 20 && npm test && npm run lint && npx tsc --noEmit`
Expected: 14 bestanden / 100 tests groen; lint niet boven 304 errors; tsc onveranderd op 54 fouten.

- [ ] **Step 7: Commit**

```bash
git add src/lib/work-levels.ts src/lib/work-levels.test.ts prisma/schema.prisma
git commit -m "feat: work level enum, per-level rate tables and level columns"
```

---

## Task 2: De tariefresolutie

**Files:**
- Create: `src/lib/rates.ts`, `src/lib/rates.test.ts`

**Interfaces:**
- Consumes: `WorkLevel` uit `src/lib/work-levels.ts`.
- Produces:
  - `type LevelRate = { level: WorkLevel; rate: number | string }`
  - `type RateEntry` (zie implementatie)
  - `effectiveWorkLevel(entry: RateEntry): WorkLevel | null`
  - `resolveHourRate(entry: RateEntry): number | null`

- [ ] **Step 1: Write the failing test**

Create `src/lib/rates.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { resolveHourRate, effectiveWorkLevel } from "./rates";

const customerRates = [
  { level: "JUNIOR" as const, rate: 80 },
  { level: "SENIOR" as const, rate: 140 },
];

function entry(over: Record<string, any> = {}) {
  return {
    rateOverride: null,
    workLevel: "SENIOR" as const,
    user: { workLevel: "JUNIOR" as const },
    project: { levelRates: [], customer: { levelRates: customerRates } },
    ...over,
  };
}

describe("effectiveWorkLevel", () => {
  it("prefers the level frozen on the entry", () => {
    expect(effectiveWorkLevel(entry())).toBe("SENIOR");
  });

  it("falls back to the owner's current level when the entry has none", () => {
    expect(effectiveWorkLevel(entry({ workLevel: null }))).toBe("JUNIOR");
  });

  it("is null when neither the entry nor the owner has a level", () => {
    expect(effectiveWorkLevel(entry({ workLevel: null, user: { workLevel: null } }))).toBeNull();
  });
});

describe("resolveHourRate", () => {
  it("lets a manual override win over every level rate", () => {
    expect(resolveHourRate(entry({ rateOverride: 200 }))).toBe(200);
  });

  it("uses the customer rate for the entry's level", () => {
    expect(resolveHourRate(entry())).toBe(140);
  });

  it("lets a project rate override the customer rate for the same level", () => {
    const e = entry({ project: { levelRates: [{ level: "SENIOR", rate: 175 }], customer: { levelRates: customerRates } } });
    expect(resolveHourRate(e)).toBe(175);
  });

  it("falls back to the customer when the project has a rate for a different level only", () => {
    const e = entry({ project: { levelRates: [{ level: "JUNIOR", rate: 90 }], customer: { levelRates: customerRates } } });
    expect(resolveHourRate(e)).toBe(140);
  });

  it("returns null when neither project nor customer has a rate for the level", () => {
    const e = entry({ workLevel: "MEDIOR" });
    expect(resolveHourRate(e)).toBeNull();
  });

  it("returns null when there is no level to resolve", () => {
    expect(resolveHourRate(entry({ workLevel: null, user: { workLevel: null } }))).toBeNull();
  });

  it("does not fall back to a customer rate for a project without a customer", () => {
    const e = entry({ project: { levelRates: [], customer: null } });
    expect(resolveHourRate(e)).toBeNull();
  });

  it("returns null instead of throwing when the rates were not included", () => {
    // Vangnet voor een vergeten Prisma-include: liever een zichtbare
    // "Geen tarief"-badge dan een crash of een stil verkeerd bedrag.
    expect(resolveHourRate({ workLevel: "SENIOR", project: {} })).toBeNull();
    expect(resolveHourRate({ workLevel: "SENIOR" })).toBeNull();
  });

  it("accepts Decimal-shaped string rates from Prisma", () => {
    const e = entry({ project: { levelRates: [{ level: "SENIOR", rate: "175.50" }], customer: null } });
    expect(resolveHourRate(e)).toBe(175.5);
  });

  it("treats an empty-string override as no override", () => {
    expect(resolveHourRate(entry({ rateOverride: "" }))).toBe(140);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `source ~/.nvm/nvm.sh && nvm use 20 && npx vitest run src/lib/rates.test.ts`
Expected: FAIL — `Failed to resolve import "./rates"`.

- [ ] **Step 3: Write the module**

Create `src/lib/rates.ts`:

```ts
import type { WorkLevel } from "./work-levels";

export type LevelRate = { level: WorkLevel; rate: number | string };

export type RateEntry = {
  rateOverride?: number | string | null;
  workLevel?: WorkLevel | null;
  user?: { workLevel?: WorkLevel | null } | null;
  project?: {
    levelRates?: LevelRate[];
    customer?: { levelRates?: LevelRate[] } | null;
  } | null;
};

/**
 * Het niveau dat voor deze regel geldt: de momentopname op de regel zelf, en
 * anders het huidige niveau van de eigenaar. Die tweede helft is de
 * overgangsregel voor regels van vóór de invoering van werkniveaus.
 */
export function effectiveWorkLevel(entry: RateEntry): WorkLevel | null {
  return entry.workLevel ?? entry.user?.workLevel ?? null;
}

function findRate(rates: LevelRate[] | undefined, level: WorkLevel): number | null {
  const hit = rates?.find((r) => r.level === level);
  return hit == null ? null : Number(hit.rate);
}

/**
 * Het uurtarief voor een urenregel, of null als er geen te bepalen valt.
 *
 * null betekent onbepaalbaar, niet nul: aanroepers tonen "Geen tarief" en
 * laten zo'n regel buiten de omzet, in plaats van hem stil als € 0,00 mee te
 * rekenen.
 */
export function resolveHourRate(entry: RateEntry): number | null {
  if (entry.rateOverride != null && entry.rateOverride !== "") return Number(entry.rateOverride);
  const level = effectiveWorkLevel(entry);
  if (!level) return null;
  return (
    findRate(entry.project?.levelRates, level) ??
    findRate(entry.project?.customer?.levelRates, level)
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `source ~/.nvm/nvm.sh && nvm use 20 && npx vitest run src/lib/rates.test.ts`
Expected: PASS, 13 tests.

- [ ] **Step 5: Commit**

```bash
git add src/lib/rates.ts src/lib/rates.test.ts
git commit -m "feat: resolveHourRate as the single source of the hourly rate"
```

---

## Task 3: Werkniveau bij de medewerker

**Files:**
- Modify: `src/lib/user-schema.ts`, `src/app/api/users/route.ts`, `src/app/api/users/[id]/route.ts`, `src/components/users/users-client.tsx`
- Test: `src/lib/user-schema.test.ts`

**Interfaces:**
- Consumes: `WORK_LEVEL_ORDER`, `WORK_LEVEL_LABELS`, `WorkLevel` uit Task 1.
- Produces: `workLevelField` uit `src/lib/user-schema.ts` — een zod-veld dat `""`/`null`/`undefined` naar `undefined` normaliseert en verder een van de vier niveaus eist. Aanroepers slaan `workLevel ?? null` op.

- [ ] **Step 1: Write the failing test**

Voeg toe aan `src/lib/user-schema.test.ts`:

```ts
import { workLevelField } from "./user-schema";

describe("workLevelField", () => {
  it("accepts each of the four levels", () => {
    for (const level of ["PRODUCTION", "JUNIOR", "MEDIOR", "SENIOR"]) {
      expect(workLevelField.parse(level)).toBe(level);
    }
  });

  it("treats empty input as not set", () => {
    expect(workLevelField.parse("")).toBeUndefined();
    expect(workLevelField.parse(null)).toBeUndefined();
    expect(workLevelField.parse(undefined)).toBeUndefined();
  });

  it("rejects an unknown level", () => {
    expect(() => workLevelField.parse("PRINCIPAL")).toThrow();
  });
});
```

Laat de bestaande imports en tests in dat bestand staan; voeg alleen dit blok toe.

- [ ] **Step 2: Run test to verify it fails**

Run: `source ~/.nvm/nvm.sh && nvm use 20 && npx vitest run src/lib/user-schema.test.ts`
Expected: FAIL — `workLevelField` bestaat niet.

- [ ] **Step 3: Voeg het veld toe**

In `src/lib/user-schema.ts`, onder `weeklyHoursField`:

```ts
import { WORK_LEVEL_ORDER } from "./work-levels";

// Empty input ("" / null / undefined) means "not set" -> undefined.
// Callers store `workLevel ?? null`.
export const workLevelField = z.preprocess(
  (v) => (v === "" || v == null ? undefined : v),
  z.enum(WORK_LEVEL_ORDER as [string, ...string[]]).optional(),
) as z.ZodType<string | undefined>;
```

- [ ] **Step 4: Run test to verify it passes**

Run: `source ~/.nvm/nvm.sh && nvm use 20 && npx vitest run src/lib/user-schema.test.ts`
Expected: PASS.

- [ ] **Step 5: Bedraad de API**

In `src/app/api/users/route.ts`: importeer `workLevelField` naast `weeklyHoursField`, voeg `workLevel: workLevelField,` toe aan `createSchema`, voeg `workLevel: true,` toe aan `userSelect`, en sla op als `workLevel: data.workLevel ?? null` waar `weeklyHours` ook wordt opgeslagen.

Doe hetzelfde in `src/app/api/users/[id]/route.ts` voor het update-schema en de update-aanroep.

`serializeUser` hoeft niet aangepast: `workLevel` is een string, geen Decimal.

- [ ] **Step 6: Bedraad de UI**

In `src/components/users/users-client.tsx`:

- Importeer `WORK_LEVEL_ORDER, WORK_LEVEL_LABELS` uit `@/lib/work-levels` en `workLevelField` uit `@/lib/user-schema`.
- Voeg `workLevel: workLevelField,` toe aan beide zod-schema's (regels 23 en 31).
- Voeg `workLevel: user.workLevel ?? undefined,` toe waar `weeklyHours` in het bewerkformulier wordt gevuld (rond regel 79).
- Voeg `workLevel: string | null;` toe aan het user-type (rond regel 42).
- Voeg in beide formulieren, direct naast het "uren per week"-veld, dit blok toe:

```tsx
                  <div className="space-y-2">
                    <Label>Werkniveau</Label>
                    <Select
                      onValueChange={(v) => editForm.setValue("workLevel", v === "_none" ? "" : v)}
                      value={editForm.watch("workLevel") || "_none"}
                    >
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="_none">Niet ingesteld</SelectItem>
                        {WORK_LEVEL_ORDER.map((l) => (
                          <SelectItem key={l} value={l}>{WORK_LEVEL_LABELS[l]}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
```

Gebruik in het aanmaakformulier `createForm` in plaats van `editForm`. Controleer of `Select` en zijn onderdelen al geïmporteerd zijn in dit bestand en voeg de import toe als dat niet zo is.

- Voeg een kolom **Werkniveau** toe aan de tabel, naast de kolom met de weekuren:

```tsx
                    <TableCell>
                      {user.workLevel
                        ? WORK_LEVEL_LABELS[user.workLevel as keyof typeof WORK_LEVEL_LABELS]
                        : <span className="text-muted-foreground">Niet ingesteld</span>}
                    </TableCell>
```

Voeg de bijbehorende `<TableHead>Werkniveau</TableHead>` toe en verhoog elke `colSpan` in dit bestand met één.

- [ ] **Step 7: Controleer**

Run: `source ~/.nvm/nvm.sh && nvm use 20 && npm test && npm run lint && npx tsc --noEmit`
Expected: tests groen; lint niet boven 304; tsc geen fouten in de aangeraakte bestanden.

- [ ] **Step 8: Commit**

```bash
git add src/lib/user-schema.ts src/lib/user-schema.test.ts src/app/api/users src/components/users
git commit -m "feat: work level on the employee record"
```

---

## Task 4: Gedeelde tariefvelden en tarieven per klant

**Files:**
- Create: `src/components/shared/level-rate-fields.tsx`
- Modify: `src/app/api/customers/route.ts`, `src/app/api/customers/[id]/route.ts`, `src/components/customers/customers-client.tsx`

**Interfaces:**
- Consumes: `WORK_LEVEL_ORDER`, `WORK_LEVEL_LABELS` uit Task 1.
- Produces:
  - `LevelRateFields(props: { value: Record<string, string>; onChange: (next: Record<string, string>) => void; hint?: string })` — vier prijsvelden, gekeyd op niveau, waarden als string zodat een leeg veld "niet ingesteld" betekent.
  - `levelRatesField` — het zod-veld voor de API, geëxporteerd uit `src/lib/rates.ts`.

- [ ] **Step 1: Voeg het zod-veld toe aan `src/lib/rates.ts`**

```ts
import { z } from "zod";
import { WORK_LEVEL_ORDER } from "./work-levels";

/** De payload-vorm voor tarieven per niveau op een klant of project. */
export const levelRatesField = z
  .array(
    z.object({
      level: z.enum(WORK_LEVEL_ORDER as [string, ...string[]]),
      rate: z.number().positive(),
    }),
  )
  .optional();
```

- [ ] **Step 2: Schrijf de gedeelde velden**

Create `src/components/shared/level-rate-fields.tsx`:

```tsx
"use client";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { WORK_LEVEL_ORDER, WORK_LEVEL_LABELS } from "@/lib/work-levels";

interface Props {
  /** Gekeyd op niveau; een lege string betekent "niet ingesteld". */
  value: Record<string, string>;
  onChange: (next: Record<string, string>) => void;
  hint?: string;
}

export function LevelRateFields({ value, onChange, hint }: Props) {
  return (
    <div className="space-y-2">
      <Label>Uurtarieven per werkniveau</Label>
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
      <div className="grid gap-2 sm:grid-cols-2">
        {WORK_LEVEL_ORDER.map((level) => (
          <div key={level} className="flex items-center gap-2">
            <span className="text-sm w-36 shrink-0">{WORK_LEVEL_LABELS[level]}</span>
            <Input
              type="number"
              step="0.01"
              min="0.01"
              placeholder="Niet ingesteld"
              value={value[level] ?? ""}
              onChange={(e) => onChange({ ...value, [level]: e.target.value })}
            />
          </div>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Bedraad de klant-API**

In `src/app/api/customers/route.ts` en `src/app/api/customers/[id]/route.ts`: voeg `levelRates: levelRatesField,` toe aan het zod-schema, met `import { levelRatesField } from "@/lib/rates";`.

Schrijf ze in dezelfde transactie weg als de klant. Het patroon, na het aanmaken of bijwerken van de klant:

```ts
    if (data.levelRates) {
      await prisma.$transaction([
        prisma.customerLevelRate.deleteMany({ where: { customerId: customer.id } }),
        ...data.levelRates.map((r) =>
          prisma.customerLevelRate.create({
            data: { customerId: customer.id, level: r.level as any, rate: r.rate },
          }),
        ),
      ]);
    }
```

Alles-weg-en-opnieuw is hier eenvoudiger dan per regel upserten, en binnen één transactie even veilig. `levelRates` weglaten uit de payload laat de bestaande tarieven ongemoeid; een lege array wist ze.

Voeg `levelRates: true` toe aan de `include` van de GET-routes, zodat de client de huidige waarden kan tonen.

- [ ] **Step 4: Bedraad het klantformulier**

In `src/components/customers/customers-client.tsx`: houd de tarieven in een aparte state naast het react-hook-form-formulier, want het zijn er vier en ze horen niet in het zod-schema van de klantvelden:

```tsx
  const [levelRates, setLevelRates] = useState<Record<string, string>>({});
```

Vul hem bij het openen van het bewerkformulier vanuit `customer.levelRates`:

```tsx
    setLevelRates(
      Object.fromEntries((customer.levelRates ?? []).map((r: any) => [r.level, String(r.rate)])),
    );
```

Zet hem leeg (`{}`) bij het openen van het aanmaakformulier. Render `<LevelRateFields value={levelRates} onChange={setLevelRates} />` in het formulier, en stuur bij het opslaan mee:

```ts
      levelRates: Object.entries(levelRates)
        .filter(([, v]) => v !== "" && Number(v) > 0)
        .map(([level, v]) => ({ level, rate: Number(v) })),
```

- [ ] **Step 5: Controleer**

Run: `source ~/.nvm/nvm.sh && nvm use 20 && npm test && npm run lint && npx tsc --noEmit`
Expected: tests groen; lint niet boven 304; tsc geen fouten in de aangeraakte bestanden.

- [ ] **Step 6: Commit**

```bash
git add src/lib/rates.ts src/components/shared src/app/api/customers src/components/customers
git commit -m "feat: per-level hourly rates on the customer"
```

---

## Task 5: Tarieven per project

**Files:**
- Modify: `src/app/api/projects/route.ts`, `src/app/api/projects/[id]/route.ts`, `src/components/projects/projects-client.tsx`

**Interfaces:**
- Consumes: `levelRatesField` uit Task 4, `LevelRateFields` uit Task 4.

- [ ] **Step 1: Bedraad de project-API**

In `src/app/api/projects/route.ts` en `src/app/api/projects/[id]/route.ts`: voeg `levelRates: levelRatesField,` toe aan het zod-schema, met `import { levelRatesField } from "@/lib/rates";`.

Schrijf ze weg met hetzelfde patroon als bij de klant, maar op `projectLevelRate` en `projectId`:

```ts
    if (data.levelRates) {
      await prisma.$transaction([
        prisma.projectLevelRate.deleteMany({ where: { projectId: project.id } }),
        ...data.levelRates.map((r) =>
          prisma.projectLevelRate.create({
            data: { projectId: project.id, level: r.level as any, rate: r.rate },
          }),
        ),
      ]);
    }
```

Voeg `levelRates: true` toe aan de `include` van de GET-routes.

- [ ] **Step 2: Sluit de aanmaakregel voor conceptprojecten aan**

`projectCreateDenialReason` in `src/lib/projects.ts` weigert nu een conceptproject van een niet-admin dat tarieven meestuurt. Breid `NewProjectInput` uit met `levelRates?: unknown[] | null` en neem die mee in dezelfde controle:

```ts
  if (input.defaultHourlyRate != null || input.defaultKmRate != null || (input.levelRates?.length ?? 0) > 0)
    return "Een conceptproject kan geen tarieven hebben";
```

Voeg een test toe aan `src/lib/projects.test.ts`:

```ts
  it("refuses a concept project with level rates from a non-admin", () => {
    expect(
      projectCreateDenialReason("EMPLOYEE", {
        status: "CONCEPT",
        levelRates: [{ level: "SENIOR", rate: 140 }],
      }),
    ).toBe("Een conceptproject kan geen tarieven hebben");
  });
```

- [ ] **Step 3: Bedraad het projectformulier**

In `src/components/projects/projects-client.tsx`, met `import { LevelRateFields } from "@/components/shared/level-rate-fields";`.

Voeg de state toe naast het bestaande formulier:

```tsx
  const [levelRates, setLevelRates] = useState<Record<string, string>>({});
```

Vul hem bij het openen van het bewerkformulier, naast het bestaande `form.reset(...)`:

```tsx
    setLevelRates(
      Object.fromEntries((project.levelRates ?? []).map((r: any) => [r.level, String(r.rate)])),
    );
```

Zet hem op `{}` bij het openen van het aanmaakformulier en na een geslaagde opslag.

Render in het formulier:

```tsx
<LevelRateFields
  value={levelRates}
  onChange={setLevelRates}
  hint="Leeg laten betekent: gebruik het tarief van de klant."
/>
```

En stuur mee in de opslag-payload:

```ts
      levelRates: Object.entries(levelRates)
        .filter(([, v]) => v !== "" && Number(v) > 0)
        .map(([level, v]) => ({ level, rate: Number(v) })),
```

- [ ] **Step 4: Controleer**

Run: `source ~/.nvm/nvm.sh && nvm use 20 && npm test && npm run lint && npx tsc --noEmit`
Expected: tests groen, inclusief de nieuwe projecttest; lint niet boven 304.

- [ ] **Step 5: Commit**

```bash
git add src/lib/projects.ts src/lib/projects.test.ts src/app/api/projects src/components/projects
git commit -m "feat: per-level hourly rates on the project, overriding the customer"
```

---

## Task 6: Het niveau vastleggen op de urenregel

**Files:**
- Modify: `src/app/api/time/route.ts`, `src/app/api/time/[id]/route.ts`

**Interfaces:**
- Consumes: `resolveEntryUserId` uit `src/lib/entry-owner.ts` (bestaat al).

- [ ] **Step 1: Leg het niveau vast bij het aanmaken**

In `src/app/api/time/route.ts` staat nu een controle die de eigenaar alleen opzoekt als die van de sessiegebruiker verschilt. Vervang dat door de eigenaar altíjd op te halen — je hebt zijn niveau hoe dan ook nodig, en het scheelt een tak:

```ts
    const { userId: requestedUserId, ...entryData } = data;
    const ownerId = resolveEntryUserId(role, userId, requestedUserId);
    const owner = await prisma.user.findUnique({
      where: { id: ownerId },
      select: { id: true, workLevel: true },
    });
    if (!owner) return NextResponse.json({ error: "Onbekende medewerker" }, { status: 400 });
```

en geef in de `create` mee: `workLevel: owner.workLevel`.

- [ ] **Step 2: Werk het niveau bij als de eigenaar wijzigt**

In `src/app/api/time/[id]/route.ts` haalt de PUT al `existing` op voor `checkEntryMutation`. Breid die `select` uit naar `{ userId: true, invoiced: true, workLevel: true }`. Bepaal daarna:

```ts
    let workLevel = existing.workLevel;
    if (ownerId !== existing.userId) {
      const owner = await prisma.user.findUnique({
        where: { id: ownerId },
        select: { id: true, workLevel: true },
      });
      if (!owner) return NextResponse.json({ error: "Onbekende medewerker" }, { status: 400 });
      workLevel = owner.workLevel;
    }
```

en geef `workLevel` mee in de `update`. Wordt de eigenaar niet gewijzigd, dan blijft het niveau staan zoals het was — ook als die medewerker inmiddels een ander niveau heeft. Dat is de bevriezing uit de spec.

Let op dat de bestaande controle op een onbekende medewerker hierdoor overbodig wordt: de opzoeking hierboven doet hem al. Laat er één staan, niet twee.

- [ ] **Step 3: Controleer**

Run: `source ~/.nvm/nvm.sh && nvm use 20 && npm test && npm run lint && npx tsc --noEmit`
Expected: tests groen; lint niet boven 304; tsc geen fouten in de twee routes.

- [ ] **Step 4: Commit**

```bash
git add src/app/api/time
git commit -m "feat: snapshot the owner's work level onto the time entry"
```

---

## Task 7: Het rapport op de nieuwe tariefbron

**Files:**
- Modify: `src/lib/report-totals.ts`, `src/lib/report-totals.test.ts`, `src/app/api/reports/route.ts`, `src/components/reports/time-rows.tsx`

**Interfaces:**
- Consumes: `resolveHourRate` uit Task 2.
- Produces: `timeRate(entry): number | null` — let op de gewijzigde retourwaarde.

- [ ] **Step 1: Breid de tests uit**

Voeg toe aan `src/lib/report-totals.test.ts`, en pas de bestaande fixture aan zodat de urenregels een `workLevel` en tarieven hebben. De nieuwe assertie die telt:

```ts
describe("entries without a determinable rate", () => {
  const data = {
    timeEntries: [
      {
        hours: 5, billable: true, rateOverride: null, workLevel: "SENIOR",
        user: { id: "u1", name: "Anne", workLevel: "SENIOR" },
        project: { levelRates: [], customer: { levelRates: [] } },
      },
    ],
    kmEntries: [],
    expenses: [],
  };

  it("counts the hours but not any revenue", () => {
    const t = reportTotals(data);
    expect(t.hours).toBe(5);
    expect(t.revenue).toBe(0);
  });

  it("counts the hours but not any revenue per employee", () => {
    const rows = groupByEmployee(data, [{ id: "u1", weeklyHours: 40 }]);
    expect(rows[0].hours).toBe(5);
    expect(rows[0].revenue).toBe(0);
  });

  it("reports the rate as null rather than zero", () => {
    expect(timeRate(data.timeEntries[0])).toBeNull();
  });
});
```

Importeer `timeRate` in dat bestand als dat nog niet gebeurt.

- [ ] **Step 2: Run tests to verify they fail**

Run: `source ~/.nvm/nvm.sh && nvm use 20 && npx vitest run src/lib/report-totals.test.ts`
Expected: FAIL — `timeRate` geeft nu 0 in plaats van null.

- [ ] **Step 3: Zet `report-totals.ts` om**

Vervang `timeRate` door een doorgeefluik naar de gedeelde functie, en laat de sommen een `null`-tarief overslaan:

```ts
import { resolveHourRate } from "./rates";

/** Uurtarief van een urenregel, of null als er geen te bepalen valt. */
export function timeRate(entry: any): number | null {
  return resolveHourRate(entry);
}
```

In `reportTotals`, vervang de urenregel in de omzetsom door:

```ts
    data.timeEntries.reduce((s, e) => {
      const rate = timeRate(e);
      return rate == null ? s : s + Number(e.hours) * rate;
    }, 0) +
```

En in `groupByEmployee`:

```ts
  for (const e of data.timeEntries) {
    const row = bucket(e.user);
    row.hours += Number(e.hours);
    const rate = timeRate(e);
    if (rate != null) row.revenue += Number(e.hours) * rate;
  }
```

`kmRate` blijft ongewijzigd — ritten vallen buiten deze wijziging.

- [ ] **Step 4: Run tests to verify they pass**

Run: `source ~/.nvm/nvm.sh && nvm use 20 && npx vitest run src/lib/report-totals.test.ts`
Expected: PASS.

- [ ] **Step 5: Laad de tarieven mee in de rapport-API**

In `src/app/api/reports/route.ts`, bij de `timeEntry.findMany`, vervang de `project`-include door:

```ts
          project: {
            select: {
              id: true, name: true,
              levelRates: true,
              customer: { select: { id: true, name: true, levelRates: true } },
            },
          },
          user: { select: { id: true, name: true, workLevel: true } },
```

Laat de `kmEntry`- en `expense`-queries ongemoeid.

Twee queries die deze include bewust **niet** krijgen, zodat je er niet naar hoeft te zoeken:
`GET /api/time` en de serverpagina van `/reports`. De urenlijst op `/time` toont in zijn
tariefkolom alleen een handmatig `rateOverride`, geen uitgerekend tarief, en de pagina `/reports`
haalt zelf geen urenregels op — die komen via `GET /api/reports`. Beide hebben de tarieven dus
niet nodig.

- [ ] **Step 6: Toon de markering in de urentabel**

In `src/components/reports/time-rows.tsx` haalt elke rij nu `const rate = timeRate(e)`. Die kan `null` zijn. Vervang de tarief- en bedragcellen door:

```tsx
                              <TableCell className="text-right">
                                {rate == null
                                  ? <Badge variant="secondary" className="text-xs">Geen tarief</Badge>
                                  : formatCurrency(rate)}
                              </TableCell>
                              <TableCell className="text-right">
                                {rate == null ? "—" : formatCurrency(Number(e.hours) * rate)}
                              </TableCell>
```

Controleer of `Badge` al geïmporteerd is in dit bestand en voeg de import toe als dat niet zo is. Pas ook de tabelvoet aan zodat hij dezelfde `null`-overslaan-logica gebruikt als `reportTotals`.

- [ ] **Step 7: Controleer**

Run: `source ~/.nvm/nvm.sh && nvm use 20 && npm test && npm run lint && npx tsc --noEmit`
Expected: tests groen; lint niet boven 304.

- [ ] **Step 8: Commit**

```bash
git add src/lib/report-totals.ts src/lib/report-totals.test.ts src/app/api/reports src/components/reports/time-rows.tsx
git commit -m "feat: reports use the level rate and flag entries without one"
```

---

## Task 8: Urenformulier en factuuropbouw

**Files:**
- Modify: `src/app/(app)/time/page.tsx`, `src/components/time/time-entries-client.tsx`, `src/app/(app)/invoices/new/page.tsx`, `src/components/invoices/new-invoice-client.tsx`

**Interfaces:**
- Consumes: `resolveHourRate` uit Task 2, `WORK_LEVEL_LABELS` uit Task 1.

- [ ] **Step 1: Laad de tarieven en niveaus mee op de urenpagina**

In `src/app/(app)/time/page.tsx`, in de `project.findMany`-select: vervang `defaultHourlyRate: true` en `activityRates: { include: { activityType: true } }` door

```ts
        levelRates: true,
        customer: { select: { id: true, name: true, levelRates: true } },
```

(laat `id`, `name` en `status` staan). Voeg in de `user.findMany` voor admins `workLevel: true` toe aan de select, en voeg `workLevel: true` toe aan de select van de ingelogde gebruiker als die er is — zo niet, laad hem apart:

```ts
    prisma.user.findUnique({ where: { id: userId }, select: { workLevel: true } }),
```

Geef die door als prop `currentUserLevel`.

- [ ] **Step 2: Vervang de tariefvoorspelling in het urenformulier**

In `src/components/time/time-entries-client.tsx`, vervang `getEffectiveRate` volledig:

```ts
  function getEffectiveRate(): number | null {
    if (!selectedProject) return null;
    const targetUserId = form.watch("userId") || userId;
    const level =
      users.find((u: any) => u.id === targetUserId)?.workLevel ?? currentUserLevel ?? null;
    return resolveHourRate({
      workLevel: level,
      project: {
        levelRates: selectedProject.levelRates,
        customer: selectedProject.customer,
      },
    });
  }
```

met `import { resolveHourRate } from "@/lib/rates";`. De functie had een `atId`-parameter voor het activiteitstarief; die is er niet meer, dus haal het argument weg bij de aanroeper (`const effectiveRate = getEffectiveRate();`).

Toon onder het tariefveld dezelfde markering als het rapport:

```tsx
                  {effectiveRate == null
                    ? <span className="text-muted-foreground font-normal"> · geen tarief voor dit niveau</span>
                    : <span className="text-muted-foreground font-normal"> · standaard: €{effectiveRate.toFixed(2)}</span>}
```

Verwijder ook de activiteitstarief-vermelding in de activiteitenlijst — de regel die `a.defaultRate` toont in het `<SelectItem>`. Activiteiten hebben geen tarief meer.

- [ ] **Step 3: Laad de tarieven mee op de factuurpagina**

In `src/app/(app)/invoices/new/page.tsx`: voeg aan de queries die ongefactureerde urenregels ophalen dezelfde project-include toe als in Task 7 Step 5, plus `user: { select: { id: true, name: true, workLevel: true } }`.

- [ ] **Step 4: Reken per regel en groepeer per tarief**

In `src/components/invoices/new-invoice-client.tsx`, vervang het urenblok in `addLinesFromSelection`. Het groepeert nu op activiteitsnaam en pakt het tarief van de eerste regel in de groep — dat is met niveautarieven onjuist, want één activiteit kan meerdere tarieven hebben. Groepeer op activiteit **en** tarief:

```ts
    const selectedTime = unbilledTime.filter((e) => selectedTimeIds.has(e.id));
    const withRate = selectedTime.filter((e) => resolveHourRate(e) != null);
    if (withRate.length > 0) {
      const grouped = new Map<string, typeof withRate>();
      withRate.forEach((e) => {
        const key = `${e.activityType?.name ?? "Werkzaamheden"}|${resolveHourRate(e)}`;
        if (!grouped.has(key)) grouped.set(key, []);
        grouped.get(key)!.push(e);
      });

      // Splitst één activiteit in meerdere regels zodra er meerdere tarieven in
      // zitten; dan pas komt het niveau in de omschrijving, zodat facturen met
      // één tarief er ongewijzigd uitzien.
      const labelCounts = new Map<string, number>();
      grouped.forEach((_v, key) => {
        const label = key.split("|")[0];
        labelCounts.set(label, (labelCounts.get(label) ?? 0) + 1);
      });

      grouped.forEach((entries, key) => {
        const label = key.split("|")[0];
        const rate = resolveHourRate(entries[0])!;
        const level = effectiveWorkLevel(entries[0]);
        const description =
          (labelCounts.get(label) ?? 0) > 1 && level
            ? `${label} (${WORK_LEVEL_LABELS[level]})`
            : label;
        newLines.push({
          description,
          quantity: entries.reduce((s, e) => s + Number(e.hours), 0),
          unitPrice: rate,
          lineType: "HOURS",
          timeEntryIds: entries.map((e) => e.id),
        });
      });
    }
```

met `import { resolveHourRate, effectiveWorkLevel } from "@/lib/rates";` en `import { WORK_LEVEL_LABELS } from "@/lib/work-levels";`.

- [ ] **Step 5: Markeer regels zonder tarief in de selectielijst**

In dezelfde component, in de lijst met ongefactureerde uren: toon bij een regel waarvoor `resolveHourRate(e)` `null` geeft een `<Badge variant="secondary" className="text-xs">Geen tarief</Badge>` in plaats van het bedrag, en zet het selectievakje van die regel op `disabled`. Zo kan zo'n regel niet op een factuur belanden. Voeg boven de lijst een regel toe wanneer er zulke regels zijn:

```tsx
{unbilledTime.some((e) => resolveHourRate(e) == null) && (
  <p className="text-sm text-muted-foreground px-4 py-2">
    Sommige uren hebben geen tarief. Stel een tarief in bij de klant of het project, of zet een handmatig tarief op de regel.
  </p>
)}
```

- [ ] **Step 6: Controleer**

Run: `source ~/.nvm/nvm.sh && nvm use 20 && npm test && npm run lint && npx tsc --noEmit`
Expected: tests groen; lint niet boven 304; tsc geen fouten in de aangeraakte bestanden.

- [ ] **Step 7: Commit**

```bash
git add "src/app/(app)/time/page.tsx" src/components/time "src/app/(app)/invoices/new/page.tsx" src/components/invoices
git commit -m "feat: entry form and invoice builder use the level rate"
```

---

## Task 9: De oude tariefbronnen opruimen

Pas nu veilig: na Task 7 en 8 leest niets meer uit deze velden.

**Files:**
- Modify: `prisma/schema.prisma`, `src/app/api/projects/route.ts`, `src/app/api/projects/[id]/route.ts`, `src/app/api/activity-types/route.ts`, `src/app/api/activity-types/[id]/route.ts`, `src/components/projects/projects-client.tsx`, `src/components/activity-types/activity-types-client.tsx`, `src/lib/projects.ts`, `src/lib/projects.test.ts`
- Delete: `src/app/api/projects/[id]/rates/route.ts`

- [ ] **Step 1: Verwijder de route voor projecttarieven per activiteit**

```bash
git rm "src/app/api/projects/[id]/rates/route.ts"
```

Die route had geen enkele rolcontrole — elke ingelogde medewerker kon er projecttarieven mee zetten. Door hem te verwijderen is dat dicht.

- [ ] **Step 2: Haal de velden uit het schema**

In `prisma/schema.prisma`:
- Verwijder `defaultRate` uit `model ActivityType` en `projectRates ProjectActivityRate[]`.
- Verwijder `defaultHourlyRate` uit `model Project` en `activityRates ProjectActivityRate[]`.
- Verwijder het hele `model ProjectActivityRate`.

Laat `defaultKmRate` op `Project` staan — ritten veranderen niet.

Run: `source ~/.nvm/nvm.sh && nvm use 20 && DATABASE_URL="postgresql://x:x@localhost:5432/x" npx prisma generate`

- [ ] **Step 3: Haal de velden uit de API's**

Verwijder `defaultHourlyRate` uit de zod-schema's in `src/app/api/projects/route.ts` en `src/app/api/projects/[id]/route.ts`, en de `activityRates`-include uit `src/app/api/projects/[id]/route.ts`.

Verwijder `defaultRate` uit de zod-schema's in `src/app/api/activity-types/route.ts` en `src/app/api/activity-types/[id]/route.ts`.

- [ ] **Step 4: Haal de velden uit de UI**

In `src/components/projects/projects-client.tsx`: verwijder `defaultHourlyRate` uit het zod-schema, uit de opslag-payload, uit het vullen van het bewerkformulier, de tabelkolom met het uurtarief (inclusief zijn `<TableHead>`, en verlaag elke `colSpan` met één), en het invoerveld.

In `src/components/activity-types/activity-types-client.tsx`: hetzelfde voor `defaultRate`.

- [ ] **Step 5: Werk `projectCreateDenialReason` bij**

Verwijder `defaultHourlyRate` uit `NewProjectInput` en uit de controle in `src/lib/projects.ts`; die wordt:

```ts
  if (input.defaultKmRate != null || (input.levelRates?.length ?? 0) > 0)
    return "Een conceptproject kan geen tarieven hebben";
```

Werk `src/lib/projects.test.ts` bij: elke test die `defaultHourlyRate` meegeeft moet nu `defaultKmRate` of `levelRates` gebruiken om dezelfde regel te controleren.

- [ ] **Step 6: Controleer dat er niets achterblijft**

Run: `grep -rn "defaultHourlyRate\|defaultRate\|activityRates\|ProjectActivityRate\|projectActivityRate" src/ prisma/`
Expected: geen treffers behalve `defaultKmRate`.

Run: `source ~/.nvm/nvm.sh && nvm use 20 && npm test && npm run lint && npx tsc --noEmit`
Expected: tests groen; lint niet boven 304; tsc geen fouten in de aangeraakte bestanden.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "refactor: drop activity rates and the project default hourly rate"
```

---

## Verificatie na afloop

- [ ] `npm test` — alle suites groen, inclusief `work-levels`, `rates`, de uitgebreide `report-totals` en `projects`.
- [ ] `npm run lint` — niet meer errors dan de 304 van de baseline.
- [ ] `npx tsc --noEmit` — 54 pre-existing fouten, geen nieuwe.
- [ ] `grep -rn "defaultHourlyRate\|defaultRate\|ProjectActivityRate" src/ prisma/` — leeg.

**Door een mens, met een database.** Niets hiervan kon tijdens de bouw gedraaid worden: er is geen `.env`, dus `db:push` en `npm run build` zijn nooit uitgevoerd.

- [ ] `npm run db:push` draaien. **Dit laat `ActivityType.defaultRate`, `Project.defaultHourlyRate` en de tabel `ProjectActivityRate` vallen. Die gegevens zijn daarna weg.** Maak eerst een back-up.
- [ ] `npm run build` draaien.
- [ ] Een medewerker een werkniveau geven en tarieven bij een klant zetten; uren boeken en controleren dat het urenformulier, het rapport en de factuuropbouw hetzelfde bedrag tonen.
- [ ] Een projecttarief voor hetzelfde niveau invullen en zien dat het het klanttarief overruled; het weer leegmaken en zien dat het terugvalt op de klant.
- [ ] Een medewerker zonder niveau laten boeken en de markering "Geen tarief" krijgen in plaats van € 0,00, zowel in het rapport als in de factuuropbouw, met een niet-aanvinkbaar selectievakje.
- [ ] Uren van twee medewerkers met verschillende niveaus op dezelfde activiteit selecteren bij het opstellen van een factuur, en controleren dat er twee regels ontstaan met het niveau in de omschrijving.
- [ ] Controleren dat een al gefactureerde regel zijn oorspronkelijke bedrag houdt.
