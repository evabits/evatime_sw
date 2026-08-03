# Project Billable Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Verwijder activiteiten uit EvaTime en laat het project bepalen of uren, ritten en uitgaven factureerbaar zijn.

**Architecture:** `Project.billable` wordt de enige bron, gelezen via één pure functie `isBillable` die drie uitkomsten kent — `true`, `false`, en `null` voor "project niet meegeladen", zodat een vergeten Prisma-`include` zichtbaar wordt in plaats van stilzwijgend omzet te laten verdampen. De taken bouwen eerst additief, zetten dan alle lezers om, verwijderen daarna de UI, en laten pas als allerlaatste de kolommen en de activiteitentabellen vallen. Na elke taak draait de applicatie.

**Tech Stack:** Next.js 16 (App Router), React 19, TypeScript, Prisma 6 + PostgreSQL, zod 3, react-hook-form, Radix UI, Tailwind 4, vitest.

## Global Constraints

- **Node 20 is vereist.** De standaard-node in deze shell is v16 en npm weigert daarop te draaien. Prefix élk npm- of npx-commando met `source ~/.nvm/nvm.sh && nvm use 20 &&`. De `.nvmrc` vraagt om 24, maar die staat niet geïnstalleerd.
- **Er is een productiedatabase bereikbaar via `.env.local`.** Prisma leest dat bestand **niet** vanzelf: `prisma.config.ts` doet `import "dotenv/config"`, wat alleen `.env` laadt. Laad hem expliciet met `set -a; . ./.env.local; set +a` vóór een commando dat de database nodig heeft.
- **Draai NOOIT `npm run db:push`, `npm run db:migrate` of een schrijvend script tegen die database.** Dit is productie met echte uren en facturen. Schemawijzigingen en de backfill worden door een mens gedraaid, op het juiste moment in de uitrol. Jij mag wél lezen en `--dry-run` draaien.
- Na elke wijziging aan `prisma/schema.prisma` moet je `npx prisma generate` draaien, anders kent TypeScript de nieuwe velden niet. Gebruik daarvoor een dummy-URL zodat je zeker niet aan productie zit: `DATABASE_URL="postgresql://x:x@localhost:5432/x" npx prisma generate`.
- Dit project heeft geen `prisma/migrations`-map en gebruikt `db:push`. Wijzig alleen `prisma/schema.prisma`; schrijf geen migratiebestanden.
- **Dit is niet de Next.js die je kent.** Lees `node_modules/next/dist/docs/` voordat je aannames doet. Clientcomponenten hebben `"use client"` nodig; route-params zijn een Promise (`const { id } = await params`).
- `src/lib/roles.ts` is canoniek voor rolcontroles. `(session.user as any)?.role ?? "EMPLOYEE"` is de vaste manier waarop deze codebase de rol van de sessie leest.
- **Alle zichtbare tekst is Nederlands.** De markering voor een onbekende factureerbaarheid is exact `Onbekend`, naast de bestaande `Geen tarief`.
- Testcommando: `npm test`. Baseline: 15 bestanden, 124 tests groen.
- Lint: `npm run lint`. **De baseline is niet schoon:** 316 errors en 21 warnings, vrijwel allemaal `@typescript-eslint/no-explicit-any`, want deze codebase gebruikt `any` overal. De gate is *geen nieuwe soorten lint-fouten*. Ruim bestaande fouten niet op; door code te verwijderen zal het aantal dalen.
- **`npx tsc --noEmit` meldt 0 fouten over de hele repo en moet dat blijven doen.** Dat is een echt signaal, geen ruis, en je belangrijkste gereedschap om te vinden wat je brak.
- `npm run build` kan niet draaien zonder `.env`; gebruik `tsc` als vangnet.

---

## File Structure

**Nieuw:**

| Bestand | Verantwoordelijkheid |
|---|---|
| `src/lib/billable.ts` | `isBillable` (de afleiding) en `deriveProjectBillable` (de backfill-logica). |
| `src/lib/billable.test.ts` | Tests daarvoor. |
| `prisma/backfill-billable.ts` | Eenmalig script dat `Project.billable` vult. Draait standaard droog. |

**Verwijderd (pas in Task 10):** `src/app/(app)/activity-types/page.tsx`, `src/components/activity-types/activity-types-client.tsx`, `src/app/api/activity-types/route.ts`, `src/app/api/activity-types/[id]/route.ts`, `src/app/api/activity-types/[id]/impact/route.ts`.

**Gewijzigd:** 24 bestanden, verdeeld over de taken hieronder.

---

## Task 1: `Project.billable` en de afleiding

**Files:**
- Create: `src/lib/billable.ts`, `src/lib/billable.test.ts`
- Modify: `prisma/schema.prisma`

**Interfaces:**
- Produces:
  - `isBillable(entry: { project?: { billable: boolean } | null }): boolean | null`
  - `type BillableDerivation = { status: "ok"; value: boolean; reason: "override" | "all-billable" | "all-non-billable" | "empty" } | { status: "needs-choice" }`
  - `deriveProjectBillable(entryFlags: boolean[], override?: boolean): BillableDerivation`

Deze taak is puur additief. Er wordt niets verwijderd en niets leest de nieuwe kolom nog.

- [ ] **Step 1: Write the failing test**

Create `src/lib/billable.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { isBillable, deriveProjectBillable } from "./billable";

describe("isBillable", () => {
  it("follows a loaded, billable project", () => {
    expect(isBillable({ project: { billable: true } })).toBe(true);
  });

  it("follows a loaded, non-billable project", () => {
    expect(isBillable({ project: { billable: false } })).toBe(false);
  });

  it("treats a record without a project as not billable", () => {
    // Een uitgave zonder project: er is geen project om het aan te vragen.
    expect(isBillable({ project: null })).toBe(false);
  });

  it("returns null when the project relation was never loaded", () => {
    // Dit is het hele punt: een vergeten Prisma-include mag geen stille false
    // worden, want dan verdwijnt er omzet zonder dat iets klaagt.
    expect(isBillable({})).toBeNull();
    expect(isBillable({ project: undefined })).toBeNull();
  });
});

describe("deriveProjectBillable", () => {
  it("uses the override when one is given, whatever the entries say", () => {
    expect(deriveProjectBillable([true, false], true)).toEqual({
      status: "ok", value: true, reason: "override",
    });
    expect(deriveProjectBillable([true, true], false)).toEqual({
      status: "ok", value: false, reason: "override",
    });
  });

  it("defaults an empty project to billable", () => {
    expect(deriveProjectBillable([])).toEqual({
      status: "ok", value: true, reason: "empty",
    });
  });

  it("follows the entries when they all agree", () => {
    expect(deriveProjectBillable([true, true, true])).toEqual({
      status: "ok", value: true, reason: "all-billable",
    });
    expect(deriveProjectBillable([false, false])).toEqual({
      status: "ok", value: false, reason: "all-non-billable",
    });
  });

  it("refuses to guess for a mixed project", () => {
    expect(deriveProjectBillable([true, false])).toEqual({ status: "needs-choice" });
    expect(deriveProjectBillable([false, true, false])).toEqual({ status: "needs-choice" });
  });

  it("accepts an explicit false override for a mixed project", () => {
    expect(deriveProjectBillable([true, false], false)).toEqual({
      status: "ok", value: false, reason: "override",
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `source ~/.nvm/nvm.sh && nvm use 20 && npx vitest run src/lib/billable.test.ts`
Expected: FAIL — `Failed to resolve import "./billable"`.

- [ ] **Step 3: Write the module**

Create `src/lib/billable.ts`:

```ts
/**
 * Of een registratie factureerbaar is, komt volledig van het project.
 *
 * Drie uitkomsten, en het onderscheid tussen de laatste twee is het punt:
 *   true   het project is geladen en factureerbaar
 *   false  het project is geladen en niet factureerbaar, of er is geen project
 *   null   de projectrelatie is niet meegeladen, dus we weten het niet
 *
 * null mag nooit als false behandeld worden. Vergeet een query zijn include,
 * dan zou een stille false omzet uit een rapport laten verdwijnen zonder dat
 * iets klaagt. Aanroepers tonen null zichtbaar en laten zo'n regel buiten de
 * omzet en buiten de factuur.
 */
export function isBillable(entry: { project?: { billable: boolean } | null }): boolean | null {
  if (!("project" in entry) || entry.project === undefined) return null;
  if (entry.project === null) return false;
  return entry.project.billable;
}

export type BillableDerivation =
  | { status: "ok"; value: boolean; reason: "override" | "all-billable" | "all-non-billable" | "empty" }
  | { status: "needs-choice" };

/**
 * Bepaalt de waarde van Project.billable bij de eenmalige backfill, op basis
 * van de vlaggen die vandaag op de boekingen van dat project staan.
 *
 * Een gemengd project kan er straks maar één zijn; daar weigert deze functie
 * te gokken en moet de gebruiker kiezen.
 */
export function deriveProjectBillable(entryFlags: boolean[], override?: boolean): BillableDerivation {
  if (override !== undefined) return { status: "ok", value: override, reason: "override" };
  if (entryFlags.length === 0) return { status: "ok", value: true, reason: "empty" };
  if (entryFlags.every((f) => f)) return { status: "ok", value: true, reason: "all-billable" };
  if (entryFlags.every((f) => !f)) return { status: "ok", value: false, reason: "all-non-billable" };
  return { status: "needs-choice" };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `source ~/.nvm/nvm.sh && nvm use 20 && npx vitest run src/lib/billable.test.ts`
Expected: PASS, 9 tests.

- [ ] **Step 5: Voeg de kolom toe aan het schema**

In `prisma/schema.prisma`, in `model Project`, onder `status`:

```prisma
  billable          Boolean               @default(true)
```

Verwijder in deze taak niets. `TimeEntry.billable`, `KmEntry.billable`, `Expense.billable`, de drie `activityTypeId`-velden en de modellen `ActivityType` en `ActivityTypeProject` blijven staan tot Task 10.

Run: `source ~/.nvm/nvm.sh && nvm use 20 && DATABASE_URL="postgresql://x:x@localhost:5432/x" npx prisma generate`

- [ ] **Step 6: Controleer**

Run: `source ~/.nvm/nvm.sh && nvm use 20 && npm test && npm run lint && npx tsc --noEmit`
Expected: 16 bestanden / 133 tests groen; lint niet boven 316 errors; tsc 0 fouten.

- [ ] **Step 7: Commit**

```bash
git add src/lib/billable.ts src/lib/billable.test.ts prisma/schema.prisma
git commit -m "feat: Project.billable and the isBillable derivation"
```

---

## Task 2: Het backfill-script

**Files:**
- Create: `prisma/backfill-billable.ts`
- Modify: `package.json` (npm-script)

**Interfaces:**
- Consumes: `deriveProjectBillable` uit Task 1.
- Produces: `npm run backfill:billable` (droog) en `npm run backfill:billable -- --write`.

Dit script vult `Project.billable`. Het draait **standaard droog** en schrijft alleen met een expliciete vlag. Jij draait het nooit met `--write`; dat doet een mens.

- [ ] **Step 1: Schrijf het script**

Create `prisma/backfill-billable.ts`:

```ts
import { PrismaClient } from "@prisma/client";
import { deriveProjectBillable } from "../src/lib/billable";

const db = new PrismaClient();

/**
 * De zeven projecten die vandaag zowel factureerbare als niet-factureerbare
 * boekingen hebben. Sleutel is de projectnaam; waarde is wat Project.billable
 * moet worden. Zonder een regel hier weigert het script te draaien, zodat
 * niemand per ongeluk historie omzet.
 *
 * Vul dit in vóór de --write-run.
 */
const KEUZES: Record<string, boolean> = {
  // "Assemblage koffer": false,
  // "H3X testen": false,
  // "Intern": false,
  // "Dutch IOT": true,
  // "DEVjig - EFRO": true,
  // "gadget": true,
  // "AUTOjig": true,
};

async function main() {
  const write = process.argv.includes("--write");
  const projects = await db.project.findMany({
    select: {
      id: true,
      name: true,
      customer: { select: { name: true } },
      timeEntries: { select: { billable: true } },
      kmEntries: { select: { billable: true } },
      expenses: { select: { billable: true } },
    },
    orderBy: { name: "asc" },
  });

  const plan: { id: string; label: string; value: boolean; reason: string }[] = [];
  const ontbreekt: string[] = [];

  for (const p of projects) {
    const label = `${p.customer?.name ?? "— geen klant —"} / ${p.name}`;
    const flags = [
      ...p.timeEntries.map((e) => e.billable),
      ...p.kmEntries.map((e) => e.billable),
      ...p.expenses.map((e) => e.billable),
    ];
    const result = deriveProjectBillable(flags, KEUZES[p.name]);
    if (result.status === "needs-choice") {
      ontbreekt.push(`${label}  (${flags.filter(Boolean).length} factureerbaar / ${flags.filter((f) => !f).length} niet)`);
      continue;
    }
    plan.push({ id: p.id, label, value: result.value, reason: result.reason });
  }

  console.log(`${write ? "SCHRIJVEN" : "DROOG (geen wijzigingen)"} — ${plan.length} projecten\n`);
  for (const r of plan) {
    console.log(`  ${r.value ? "factureerbaar    " : "niet factureerbaar"}  ${r.label}   [${r.reason}]`);
  }

  if (ontbreekt.length > 0) {
    console.error(`\nGEWEIGERD: ${ontbreekt.length} gemengde projecten zonder keuze in KEUZES:`);
    ontbreekt.forEach((l) => console.error("  " + l));
    console.error("\nVul KEUZES aan en draai opnieuw. Er is niets gewijzigd.");
    process.exitCode = 1;
    return;
  }

  if (!write) {
    console.log("\nDroge run. Draai met --write om dit toe te passen.");
    return;
  }

  for (const r of plan) {
    await db.project.update({ where: { id: r.id }, data: { billable: r.value } });
  }
  console.log(`\n${plan.length} projecten bijgewerkt.`);
}

main().finally(() => db.$disconnect());
```

Let op dat het script **eerst alle gemengde projecten meldt en dan afbreekt**, ook in `--write`-modus: er wordt niets geschreven zolang er nog een keuze ontbreekt. Half toepassen is erger dan niet toepassen.

- [ ] **Step 2: Voeg het npm-script toe**

In `package.json`, bij `scripts`:

```json
    "backfill:billable": "tsx prisma/backfill-billable.ts",
```

- [ ] **Step 3: Draai de droge run tegen productie**

Dit is een leesactie en veilig.

Run: `source ~/.nvm/nvm.sh && nvm use 20 && set -a && . ./.env.local && set +a && npm run backfill:billable`

Expected: het script weigert, met de zeven gemengde projecten in de lijst — `KEUZES` is immers nog leeg. Dat is het gewenste gedrag en het bewijs dat de weigering werkt. Zet de volledige uitvoer in je rapport.

- [ ] **Step 4: Controleer**

Run: `source ~/.nvm/nvm.sh && nvm use 20 && npm test && npm run lint && npx tsc --noEmit`
Expected: tests groen; lint niet boven 316; tsc 0.

- [ ] **Step 5: Commit**

```bash
git add prisma/backfill-billable.ts package.json
git commit -m "feat: dry-run backfill script for Project.billable"
```

---

## Task 3: Factureerbaar instelbaar op het project

**Files:**
- Modify: `src/app/api/projects/route.ts`, `src/app/api/projects/[id]/route.ts`, `src/components/projects/projects-client.tsx`

**Interfaces:**
- Consumes: `Project.billable` uit Task 1.

- [ ] **Step 1: Neem het veld op in de API**

Voeg in beide routebestanden `billable: z.boolean().optional(),` toe aan het zod-schema, en neem het mee in de `create`- respectievelijk `update`-aanroep. Laat weg wat niet meegestuurd is: bij een `PUT` zonder `billable` blijft de bestaande waarde staan.

De GET-routes hoeven niets: `billable` is een scalair veld en komt vanzelf mee.

- [ ] **Step 2: Voeg de schakelaar toe aan het projectformulier**

In `src/components/projects/projects-client.tsx`, voeg `billable: z.boolean().optional(),` toe aan het zod-schema van het formulier, `billable: true` aan de `defaultValues`, en `billable: project.billable` aan het vullen van het bewerkformulier.

Zet het veld in het formulier naast de tarieven per werkniveau, met dezelfde vorm als de andere keuzelijsten in dit bestand:

```tsx
              <div className="space-y-2">
                <Label>Factureerbaar</Label>
                <Select
                  onValueChange={(v) => form.setValue("billable", v === "true")}
                  value={form.watch("billable") === false ? "false" : "true"}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="true">Ja</SelectItem>
                    <SelectItem value="false">Nee</SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  Bepaalt of uren, ritten en uitgaven op dit project gefactureerd kunnen worden.
                </p>
              </div>
```

- [ ] **Step 3: Voeg de kolom toe aan de projectenlijst**

Voeg een `<TableHead>Factureerbaar</TableHead>` toe en per rij:

```tsx
                  <TableCell>
                    {p.billable
                      ? <Badge variant="secondary" className="text-xs">Ja</Badge>
                      : <Badge variant="outline" className="text-xs">Nee</Badge>}
                  </TableCell>
```

Controleer of `Badge` al geïmporteerd is en voeg de import toe als dat niet zo is. Verhoog elke `colSpan` in dit bestand met één.

- [ ] **Step 4: Controleer**

Run: `source ~/.nvm/nvm.sh && nvm use 20 && npm test && npm run lint && npx tsc --noEmit`
Expected: tests groen; lint niet boven 316; tsc 0.

- [ ] **Step 5: Commit**

```bash
git add src/app/api/projects src/components/projects
git commit -m "feat: set billable on the project"
```

---

## Task 4: Rapporten en dashboard lezen uit het project

**Files:**
- Modify: `src/lib/report-totals.ts`, `src/lib/report-totals.test.ts`, `src/app/api/reports/route.ts`, `src/app/(app)/page.tsx`, `src/components/reports/time-rows.tsx`

**Interfaces:**
- Consumes: `isBillable` uit Task 1.

- [ ] **Step 1: Breid de tests uit**

Voeg toe aan `src/lib/report-totals.test.ts`, met `import { isBillable } from "./billable";` waar nodig. Pas de bestaande fixtures aan zodat elke regel een `project` met een `billable`-veld heeft, en voeg dit blok toe:

```ts
describe("billability now comes from the project", () => {
  const base = {
    hours: 4, rateOverride: 100, workLevel: "SENIOR",
    user: { id: "u1", name: "Anne", workLevel: "SENIOR" },
  };

  it("counts revenue only when the project is billable", () => {
    const t = reportTotals({
      timeEntries: [{ ...base, project: { billable: true, levelRates: [], customer: null } }],
      kmEntries: [], expenses: [],
    });
    expect(t.hours).toBe(4);
    expect(t.revenue).toBe(400);
  });

  it("counts the hours but no revenue for a non-billable project", () => {
    const t = reportTotals({
      timeEntries: [{ ...base, project: { billable: false, levelRates: [], customer: null } }],
      kmEntries: [], expenses: [],
    });
    expect(t.hours).toBe(4);
    expect(t.revenue).toBe(0);
  });

  it("counts no revenue when the project was not loaded at all", () => {
    // Vergeten include: hours tellen wel, geld niet. Zou dit als billable
    // gelden, dan verscheen er omzet die er niet is.
    const t = reportTotals({ timeEntries: [{ ...base }], kmEntries: [], expenses: [] });
    expect(t.hours).toBe(4);
    expect(t.revenue).toBe(0);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `source ~/.nvm/nvm.sh && nvm use 20 && npx vitest run src/lib/report-totals.test.ts`
Expected: FAIL — de omzet volgt nog `e.billable`, dat in deze fixtures niet bestaat.

- [ ] **Step 3: Zet `report-totals.ts` om**

Vervang in `reportTotals` elke `.filter((e) => e.billable)` door `.filter((e) => isBillable(e) === true)`, voor uren, ritten en uitgaven. Vervang in `groupByEmployee` elke `if (e.billable)` respectievelijk `if (e.billable && rate != null)` door `if (isBillable(e) === true)` respectievelijk `if (isBillable(e) === true && rate != null)`.

Let op `=== true`: een `null` moet net zo goed buiten de omzet vallen als een `false`, en `if (null)` doet dat ook, maar de expliciete vergelijking maakt de bedoeling leesbaar en voorkomt dat iemand er later een `??` bij zet.

Voeg toe: `import { isBillable } from "./billable";`

- [ ] **Step 4: Laad het project mee in de rapport-API**

In `src/app/api/reports/route.ts`, voeg `billable: true` toe aan de `project`-select van alle drie de queries (uren, ritten, uitgaven).

Vervang het `billable`-filter. Het leest nu `...(billable !== null ? { billable: billable === "true" } : {})` en wordt per query:

```ts
          ...(billable === "true" ? { project: { billable: true } } : {}),
          ...(billable === "false" ? { OR: [{ project: { billable: false } }, { projectId: null }] } : {}),
```

De `projectId: null`-tak is alleen zinvol bij uitgaven — uren en ritten hebben altijd een project — maar hij is daar onschadelijk, dus dezelfde vorm mag overal.

- [ ] **Step 5: Zet de dashboardomzet om**

In `src/app/(app)/page.tsx`: voeg `billable: true` toe aan de `project`-selectie van de query, en vervang de twee `.filter((e) => e.billable)` door `.filter((e) => isBillable(e) === true)`. Let op dat de entries daar genest onder `project` staan; als `isBillable` een entry krijgt die zelf geen `project`-veld heeft omdat je vanuit het project itereert, geef hem dan `{ project }` mee in plaats van de entry.

- [ ] **Step 6: Toon `Onbekend` in de urentabel**

In `src/components/reports/time-rows.tsx` staat per rij al een badge voor `invoiced` en voor niet-factureerbaar. Vervang de niet-factureerbaar-badge door een die de drie gevallen kent:

```tsx
                                {isBillable(e) === null && (
                                  <Badge variant="outline" className="text-xs">Onbekend</Badge>
                                )}
                                {isBillable(e) === false && (
                                  <Badge variant="secondary" className="text-xs">Niet</Badge>
                                )}
```

- [ ] **Step 7: Controleer**

Run: `source ~/.nvm/nvm.sh && nvm use 20 && npm test && npm run lint && npx tsc --noEmit`
Expected: tests groen; lint niet boven 316; tsc 0.

- [ ] **Step 8: Commit**

```bash
git add src/lib/report-totals.ts src/lib/report-totals.test.ts src/app/api/reports "src/app/(app)/page.tsx" src/components/reports/time-rows.tsx
git commit -m "feat: reports and dashboard read billability from the project"
```

---

## Task 5: De factuuropbouw

**Files:**
- Modify: `src/app/api/time/route.ts` (alleen de include), `src/components/invoices/new-invoice-client.tsx`

**Interfaces:**
- Consumes: `isBillable` uit Task 1.

- [ ] **Step 1: Laad `billable` mee op `GET /api/time`**

De factuuropbouw haalt zijn ongefactureerde uren daar op. Voeg `billable: true` toe aan de `project`-select in die route. Die select is al voorwaardelijk op de rol (`canSeeRates`); zet `billable` in **beide** takken, want ook een niet-admin krijgt straks regels waarvan de factureerbaarheid meetelt in wat hij ziet.

- [ ] **Step 2: Filter op de nieuwe bron**

In `src/components/invoices/new-invoice-client.tsx`, regel 52-53, vervang:

```ts
      setUnbilledTime(time.filter((e: any) => !e.invoiced && e.billable));
      setUnbilledKm(km.filter((e: any) => !e.invoiced && e.billable));
```

door:

```ts
      setUnbilledTime(time.filter((e: any) => !e.invoiced && isBillable(e) === true));
      setUnbilledKm(km.filter((e: any) => !e.invoiced && isBillable(e) === true));
```

met `import { isBillable } from "@/lib/billable";`. Een regel waarvan we het niet weten (`null`) mag niet gefactureerd worden — daarom `=== true` en niet alleen `!== false`.

- [ ] **Step 3: Groepeer op project in plaats van activiteit**

In `addLinesFromSelection` groepeert de urenregel nu op `e.activityType?.name`. Vervang de groeperingssleutel en het label door de projectnaam:

```ts
        const key = `${e.project?.name ?? "Werkzaamheden"}|${resolveHourRate(e)}`;
```

en in de lus die de regels bouwt, waar nu `const label = key.split("|")[0];` staat, blijft die regel ongewijzigd — hij pakt nu de projectnaam. De rest van het blok, inclusief `labelCounts` en het toevoegen van het werkniveau wanneer één label in meerdere tarieven uiteenvalt, blijft precies zoals het is.

- [ ] **Step 4: Controleer**

Run: `source ~/.nvm/nvm.sh && nvm use 20 && npm test && npm run lint && npx tsc --noEmit`
Expected: tests groen; lint niet boven 316; tsc 0.

- [ ] **Step 5: Commit**

```bash
git add src/app/api/time/route.ts src/components/invoices
git commit -m "feat: invoice builder groups by project and follows project billability"
```

---

## Task 6: Activiteiten uit het uren- en rittenformulier

**Files:**
- Modify: `src/components/time/time-entries-client.tsx`, `src/components/km/km-entries-client.tsx`, `src/app/(app)/time/page.tsx`, `src/app/(app)/km/page.tsx`, `src/app/api/time/route.ts`, `src/app/api/time/[id]/route.ts`, `src/app/api/km/route.ts`, `src/app/api/km/[id]/route.ts`

- [ ] **Step 1: Haal het veld uit de twee formulieren**

In `src/components/time/time-entries-client.tsx` en `src/components/km/km-entries-client.tsx`:

- Verwijder `activityTypeId` uit het zod-schema, uit de `defaultValues`, uit elke `form.reset(...)` en uit `startEdit`.
- Verwijder het hele Activiteit-`<div className="space-y-2">`-blok met zijn `<Select>`.
- Verwijder de `activityTypes`-prop, de `filteredActivityTypes`-berekening en de bijbehorende `useState`.
- Verwijder het **Factureerbaar**-veld uit het formulier. Dat is niet meer per regel te kiezen; het project bepaalt het.
- Verwijder de Activiteit-kolom uit de lijstweergaven, inclusief `<TableHead>`, en verlaag elke `colSpan` navenant. In `time-entries-client.tsx` toont ook de weekweergave de activiteitsnaam achter de projectnaam — die uitdrukking gaat er ook uit.
- In `time-entries-client.tsx` staat in het dialoogvenster "Nieuw conceptproject" een lijst met aan te vinken activiteiten. Dat hele blok gaat eruit, samen met `newProjectActivityIds` en het meesturen daarvan in de POST.

- [ ] **Step 2: Haal het uit de twee serverpagina's**

In `src/app/(app)/time/page.tsx` en `src/app/(app)/km/page.tsx`: verwijder de `activityType.findMany`-query uit de `Promise.all`, de `activityTypes`-prop, en de `activityRates`- of `activityLinks`-includes voor zover die er nog staan.

- [ ] **Step 3: Haal het uit de vier API-routes**

In `src/app/api/time/route.ts`, `src/app/api/time/[id]/route.ts`, `src/app/api/km/route.ts` en `src/app/api/km/[id]/route.ts`:

- Verwijder `activityTypeId` uit het zod-schema en uit de `create`/`update`-data.
- Verwijder de `activityType`-include.
- Verwijder het hele blok dat `billable` afleidt uit de activiteit. In `POST /api/time` is dat:
  ```ts
      if (!isAdmin(role)) {
        rateOverride = null;
        if (activityTypeId) {
          const act = await prisma.activityType.findUnique({ ... });
          billable = act?.billable ?? true;
        } else {
          billable = true;
        }
      }
  ```
  Daarvan blijft alleen `if (!isAdmin(role)) rateOverride = null;` over — een medewerker mag nog steeds geen tarief opgeven.
- Verwijder `billable` uit het zod-schema en uit de `create`/`update`-data. Die kolom bestaat straks niet meer en wordt tot die tijd genegeerd.

- [ ] **Step 4: Controleer**

Run: `source ~/.nvm/nvm.sh && nvm use 20 && npm test && npm run lint && npx tsc --noEmit`
Expected: tests groen; lint zal dalen; tsc 0.

- [ ] **Step 5: Commit**

```bash
git add src/components/time src/components/km "src/app/(app)/time" "src/app/(app)/km" src/app/api/time src/app/api/km
git commit -m "refactor: drop the activity field from the time and km forms"
```

---

## Task 7: Activiteiten uit de overige schermen

**Files:**
- Modify: `src/lib/km-template.ts`, `src/lib/km-template.test.ts`, `src/app/api/km/templates/route.ts`, `src/app/api/km/templates/[id]/route.ts`, `src/app/(app)/km/templates/page.tsx`, `src/components/km/km-templates-client.tsx`, `src/app/(app)/personeel/[id]/page.tsx`, `src/components/personeel/commute-template-client.tsx`, `src/components/reports/entry-edit-dialog.tsx`, `src/components/reports/reports-client.tsx`, `src/app/(app)/reports/page.tsx`, `src/components/dashboard/recent-entries.tsx`

- [ ] **Step 1: km-sjablonen**

Verwijder `activityTypeId` uit `kmTemplateSchema` in `src/lib/km-template.ts`. Controleer `src/lib/km-template.test.ts`: als een test dat veld meegeeft, haal het daar weg — maar laat elke test wél iets blijven asserteren; verwijder geen hele test omdat hij nu makkelijker is.

Haal het veld daarna uit de twee sjabloonroutes, de sjabloonpagina en `km-templates-client.tsx`, inclusief de kolom in de tabel.

- [ ] **Step 2: Woon-werksjabloon bij personeel**

In `src/components/personeel/commute-template-client.tsx`: verwijder `activityTypeId` uit het zod-schema, uit de `defaultValues` en beide `form.reset`, uit de twee payloads, uit de tabelkolom en uit de `<Select>`. Verwijder de `activityTypes`-prop en de query die hem vult in `src/app/(app)/personeel/[id]/page.tsx`.

- [ ] **Step 3: Rapportschermen**

In `src/components/reports/entry-edit-dialog.tsx`: verwijder het Activiteit-`<Select>`, `activityTypeId` uit de formulierstaat en uit de drie payloads, de `activityTypes`-prop en de `availableActivities`-berekening. Verwijder ook het **Factureerbaar**-veld uit deze dialoog: dat is niet meer per regel te zetten.

In `src/components/reports/reports-client.tsx`: verwijder de `activityTypes`-prop en het doorgeven daarvan aan de dialoog. In `src/app/(app)/reports/page.tsx`: verwijder de `activityType.findMany` uit de `Promise.all` en de prop.

In `src/components/reports/time-rows.tsx` staat een Activiteit-kolom; verwijder die met zijn `<TableHead>` en verlaag de `colSpan`-waarden in dat bestand met één.

- [ ] **Step 4: Dashboard**

In `src/components/dashboard/recent-entries.tsx`: verwijder de activiteitsnaam uit de weergave. In `src/app/(app)/page.tsx`: verwijder de `activityType`-include uit de query als die er nog is.

- [ ] **Step 5: Controleer**

Run: `source ~/.nvm/nvm.sh && nvm use 20 && npm test && npm run lint && npx tsc --noEmit`
Expected: tests groen; tsc 0. Als tsc klaagt over een prop die niet meer bestaat, heb je een doorgeefplek gemist — volg de foutmelding.

- [ ] **Step 6: Commit**

```bash
git add src/lib/km-template.ts src/lib/km-template.test.ts src/app/api/km/templates "src/app/(app)/km/templates" src/components/km/km-templates-client.tsx "src/app/(app)/personeel" src/components/personeel src/components/reports "src/app/(app)/reports" src/components/dashboard "src/app/(app)/page.tsx"
git commit -m "refactor: drop activities from templates, reports and dashboard"
```

---

## Task 8: De bulkactie Factureerbaar

**Files:**
- Modify: `src/lib/bulk-entries.ts`, `src/lib/bulk-entries.test.ts`, `src/components/reports/bulk-bar.tsx`, `src/components/reports/reports-client.tsx`, `src/app/api/entries/bulk/route.ts`

- [ ] **Step 1: Verwijder de actie uit de pure laag**

In `src/lib/bulk-entries.ts`: verwijder `| { type: "billable"; billable: boolean }` uit de `BulkAction`-union en de bijbehorende `case "billable"` uit `buildBulkData`.

In `src/lib/bulk-entries.test.ts`: verwijder de test die het billable-fragment controleert. Laat de overige tests — de invoiced-guard, project, user en delete — ongemoeid.

- [ ] **Step 2: Verwijder hem uit de route en de balk**

In `src/app/api/entries/bulk/route.ts`: verwijder `z.object({ type: z.literal("billable"), billable: z.boolean() }),` uit de discriminated union.

In `src/components/reports/bulk-bar.tsx`: verwijder de twee knoppen *Factureerbaar* en *Niet factureerbaar*.

Controleer in `src/components/reports/reports-client.tsx` of `applyBulk` nog compileert; hij is generiek over `BulkAction` en zou ongewijzigd moeten blijven.

- [ ] **Step 3: Controleer**

Run: `source ~/.nvm/nvm.sh && nvm use 20 && npm test && npm run lint && npx tsc --noEmit`
Expected: tests groen; tsc 0.

- [ ] **Step 4: Commit**

```bash
git add src/lib/bulk-entries.ts src/lib/bulk-entries.test.ts src/components/reports src/app/api/entries
git commit -m "refactor: drop the billable bulk action"
```

---

## Task 9: De activiteitenpagina en -routes weg

**Files:**
- Delete: `src/app/(app)/activity-types/page.tsx`, `src/components/activity-types/activity-types-client.tsx`, `src/app/api/activity-types/route.ts`, `src/app/api/activity-types/[id]/route.ts`, `src/app/api/activity-types/[id]/impact/route.ts`
- Modify: `src/app/api/projects/route.ts`, en het navigatiebestand in `src/components/layout/`

- [ ] **Step 1: Verwijder de bestanden**

```bash
git rm -r "src/app/(app)/activity-types" src/components/activity-types src/app/api/activity-types
```

- [ ] **Step 2: Haal de navigatie weg**

Zoek het menu-item: `grep -rn "activity-types" src/components/layout/`. Verwijder de regel met het menu-item en, als die er is, de bijbehorende rolcontrole.

- [ ] **Step 3: Haal `activityTypeIds` uit de projectroute**

`src/app/api/projects/route.ts` accepteert `activityTypeIds: z.array(z.string()).optional()` en koppelt die aan het project. Verwijder het veld en de koppelcode. Controleer `src/lib/projects.ts`: als `NewProjectInput` het veld noemt, haal het daar en in `src/lib/projects.test.ts` ook weg.

- [ ] **Step 4: Controleer**

Run: `grep -rn "activity-types\|activityType" src/ | grep -v "\.test\."`
Expected: alleen nog treffers in bestanden die Task 10 aanpakt — dat wil zeggen: geen.

Run: `source ~/.nvm/nvm.sh && nvm use 20 && npm test && npm run lint && npx tsc --noEmit`
Expected: tests groen; tsc 0.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "refactor: remove the activity types page and routes"
```

---

## Task 10: Het schema opruimen

Pas nu, als niets meer leest.

**Files:**
- Modify: `prisma/schema.prisma`, `prisma/seed.ts`, `prisma/backfill-billable.ts`

- [ ] **Step 1: Haal de velden en modellen weg**

In `prisma/schema.prisma`:
- Verwijder `billable` uit `TimeEntry`, `KmEntry` en `Expense`.
- Verwijder `activityTypeId` en de `activityType`-relatie uit `TimeEntry`, `KmEntry` en `KmTemplate`.
- Verwijder de modellen `ActivityType` en `ActivityTypeProject`, plus `Project.activityLinks`.

Laat `Project.billable` staan — dat is de nieuwe bron.

Run: `source ~/.nvm/nvm.sh && nvm use 20 && DATABASE_URL="postgresql://x:x@localhost:5432/x" npx prisma generate`

- [ ] **Step 2: Repareer wat daardoor breekt**

`prisma/seed.ts` maakt activiteiten aan; verwijder dat blok. Het backfill-script uit Task 2 leest `e.billable` van de boekingen — dat veld bestaat dan niet meer. Dat script is eenmalig en heeft zijn werk gedaan vóór deze stap; verwijder het en zijn npm-script, en noteer in je rapport dat het bewust weg is.

Run `npx tsc --noEmit` na elke verwijdering, niet alleen aan het eind, zodat je weet welke wijziging wat brak.

- [ ] **Step 3: De acceptatiecontrole**

Run: `grep -rn "activityType\|ActivityType\|\.billable" src/ prisma/ | grep -v "project.billable\|p.billable\|isBillable\|billable: z\|billable: true\|billable: false\|form.watch(\"billable\")\|setValue(\"billable\"" `

Kijk elke resterende treffer na. Verwacht: alleen verwijzingen naar `Project.billable` en naar `isBillable`. Vindt de grep een `e.billable` of een `activityType`, dan ben je niet klaar — praat het niet goed.

- [ ] **Step 4: Controleer**

Run: `source ~/.nvm/nvm.sh && nvm use 20 && npm test && npm run lint && npx tsc --noEmit`
Expected: tests groen; lint duidelijk onder 316; tsc 0.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "refactor: drop activity types and the per-entry billable flag"
```

---

## Verificatie na afloop

- [ ] `npm test` — alle suites groen, inclusief `billable` en de uitgebreide `report-totals`.
- [ ] `npm run lint` — niet meer errors dan de 316 van de baseline; verwacht fors minder.
- [ ] `npx tsc --noEmit` — 0 fouten.
- [ ] De grep uit Task 10 Step 3 — geen verwijzingen naar activiteiten of `entry.billable`.

**Door een mens, met de database.** Niets hiervan kon tijdens de bouw tegen productie gedraaid worden.

De uitrol gaat in vier stappen, en de code uit dit plan hoort bij stap 3:

1. **Toevoegen.** `db:push` met alléén Task 1's schemawijziging. Doe dat vanaf een checkout van de commit van Task 1, of voeg de kolom handmatig toe. Draai vooraf `prisma migrate diff` en lees de volledige lijst.
2. **Vullen.** `KEUZES` in `prisma/backfill-billable.ts` invullen voor de zeven gemengde projecten, droog draaien, de uitvoer controleren, dan met `--write`.
3. **Deployen.** De volledige branch. De oude kolommen bestaan dan nog maar worden niet gelezen.
4. **Opruimen.** `db:push` met het schema van Task 10. **Dit laat `TimeEntry.billable`, `KmEntry.billable`, `Expense.billable`, de drie `activityTypeId`-kolommen en de tabellen `ActivityType` en `ActivityTypeProject` vallen.** Back-up eerst, en draai `prisma migrate diff` om te zien of er niets ánders in die lijst staat — vorige keer verdween er onverwacht een kolom die niemand had gecontroleerd.

Daarna handmatig:

- [ ] Een project op niet-factureerbaar zetten en controleren dat zijn uren uit de omzet verdwijnen, in het rapport én op het dashboard.
- [ ] Een factuur opstellen en controleren dat de regels op projectnaam gegroepeerd zijn.
- [ ] Controleren dat een al verstuurde factuur zijn oorspronkelijke omschrijvingen en bedragen houdt.
- [ ] Het Factureerbaar-filter op `/reports` in beide standen, en controleren dat een uitgave zonder project onder "niet factureerbaar" valt.
- [ ] Uren boeken op een project en controleren dat er geen Activiteit- en geen Factureerbaar-veld meer is.
