# Projectplanning B — afhankelijkheden en bewaking — Implementatieplan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Taken kunnen wachten op andere taken van hetzelfde project; de tijdlijn tekent die verbanden, rekent voor wat een verschuiving doet en laat zien waar de planning zichzelf tegenspreekt.

**Architecture:** Eén nieuwe tabel `TaskDependency` met twee verwijzingen naar `ProjectTask`. Alle grafiek- en tekenkunde zit als pure functies in een nieuw bestand `src/lib/task-dependencies.ts` met vitest-dekking; dezelfde `shiftPlan` draait in de browser voor het voorbeeld en op de server voor de uitvoering. Geen nieuwe routes: de twee bestaande taakroutes krijgen velden erbij.

**Tech Stack:** Next.js 16 (App Router), React 19, Prisma 6 + PostgreSQL (Neon), zod, date-fns, Tailwind, shadcn-componenten uit `src/components/ui`, vitest.

**Spec:** `docs/superpowers/specs/2026-08-20-projectplanning-afhankelijkheden-design.md`

**Bouwt op:** deelproject A, opgeleverd. `src/lib/planning.ts` bevat al `projectBar`, `unplannedProjects`, `validateDateRange`, `groupByCustomer`, `timelineWindow`, `barGeometry`, `todayOffsetPct`, `swapOrder` en `timelineHeader`. Het scherm is `src/components/planning/planning-client.tsx`, de pagina `src/app/(app)/planning/page.tsx`.

## Global Constraints

- **Lees eerst `AGENTS.md`.** Dit is Next.js 16; conventies wijken af van oudere versies. Raadpleeg `node_modules/next/dist/docs/` vóór routing- of paginacode.
- **Datums in de UI altijd `DD-MMM-YYYY`** (`01-SEP-2026`) via `formatDate` uit `src/lib/utils.ts`. Nooit ISO tonen; alleen de wáárde van een `<input type="date">` is ISO.
- **Einddatums zijn inclusief.** De vroegst toegestane start van een opvolger is de dag ná de einddatum van zijn voorganger. Elke duur is `differenceInCalendarDays(eind, start) + 1`.
- **Alleen `ADMIN`.** Elke route weigert zelf via `canManagePlanning`, ook als de UI het al verbergt.
- **Dit project test uitsluitend pure functies** in `src/lib/*.test.ts`. Geen component-, route- of integratietests; die bestaan hier niet.
- **Geen nieuwe npm-afhankelijkheden.**
- **Commentaar en foutmeldingen in het Nederlands**, uitleggend *waarom* en niet *wat*.
- **Imports:** binnen `src/lib/` relatief (`./planning`), in `src/app/` en `src/components/` via de alias (`@/lib/planning`). `vitest.config.mts` kent geen alias-resolutie.
- **Route-handlers krijgen `params` als `Promise`** — `{ params }: { params: Promise<{ id: string }> }`, dan `const { id } = await params;`.
- **Node 20 verplicht** voor npm/npx: `PATH="$HOME/.nvm/versions/node/v20.20.1/bin:$PATH" npx vitest run`. Ketens met `&&` worden door de permissielaag geweigerd; bij een losse weigering één keer opnieuw proberen.
- **`npx tsc --noEmit` schoon en `npm run build` exit 0.** De build heeft `DATABASE_URL` nodig maar verbindt niet: `DATABASE_URL="postgresql://x:x@localhost:5432/x" npm run build`.
- **De database in `.env.local` is productie.** Alleen lezen, behalve de ene `db:push` in taak 1.

---

## Bestandsindeling

| Bestand | Verantwoordelijkheid |
|---|---|
| `prisma/schema.prisma` | Model `TaskDependency`, twee relaties op `ProjectTask`. |
| `src/lib/task-dependencies.ts` | Kringloopdetectie, doorrekenen, signalen, pijlgeometrie. Geen React, geen Prisma. |
| `src/lib/task-dependencies.test.ts` | Tests daarvan. |
| `src/lib/task-dependency-rules.ts` | De vier regels die de server afdwingt bij het leggen van een koppeling. Gebruikt Prisma, dus geen pure functie en geen tests — de rekenkunde erin komt uit `task-dependencies.ts` en is daar wél gedekt. |
| `src/app/api/projects/[id]/tasks/route.ts` | POST accepteert `dependsOnIds`. |
| `src/app/api/project-tasks/[id]/route.ts` | PUT accepteert `dependsOnIds` en `applyShift`. |
| `src/app/api/projects/[id]/merge/route.ts` | Eén regel commentaar die de aanname vastlegt. |
| `src/app/(app)/planning/page.tsx` | Haalt de koppelingen mee op. |
| `src/components/planning/planning-client.tsx` | "Wacht op"-blokje, verschuif-overzicht, pijlen, signalen. |

---

### Task 1: Schema en database

**Files:**
- Modify: `prisma/schema.prisma`

**Interfaces:**
- Consumes: model `ProjectTask` (bestaat al).
- Produces: model `TaskDependency { id, taskId, dependsOnId, createdAt }` met `@@unique([taskId, dependsOnId])`, en op `ProjectTask` de relaties `waitsOn` en `blocks`.

- [ ] **Step 1: Voeg de twee relaties toe aan `ProjectTask`**

In `prisma/schema.prisma`, in `model ProjectTask`, direct ná `updatedAt DateTime @updatedAt`:

```prisma
  // Waar deze taak op wacht, en wat er op deze taak wacht. Twee relaties naar
  // dezelfde tabel, dus Prisma eist een naam per kant.
  waitsOn   TaskDependency[] @relation("TaskWaitsOn")
  blocks    TaskDependency[] @relation("TaskBlocks")
```

- [ ] **Step 2: Voeg het model `TaskDependency` toe**

Direct ná het blok `model ProjectTask { ... }`:

```prisma
model TaskDependency {
  id          String      @id @default(cuid())
  // De taak die moet wachten.
  taskId      String
  task        ProjectTask @relation("TaskWaitsOn", fields: [taskId], references: [id], onDelete: Cascade)
  // De taak waarop gewacht wordt.
  dependsOnId String
  dependsOn   ProjectTask @relation("TaskBlocks", fields: [dependsOnId], references: [id], onDelete: Cascade)
  createdAt   DateTime    @default(now())

  // Dezelfde koppeling twee keer leggen is geen nieuwe koppeling. handleError
  // vertaalt de botsing (P2002) al naar een 409.
  @@unique([taskId, dependsOnId])
  // Voor het opzoeken van "wat wacht er op deze taak", bij het verwijderen en
  // bij het doorrekenen.
  @@index([dependsOnId])
}
```

Alleen de koppeling naar `ProjectTask` wordt gelegd, niet naar `Project`: dat beide taken bij hetzelfde project horen, dwingt de route af. Een tweede kolom met het project erbij zou een tweede waarheid zijn die uit de pas kan lopen met de taken zelf.

- [ ] **Step 3: Kopieer `.env.local` naar `.env`**

Prisma leest `.env.local` niet: `prisma.config.ts` doet `import "dotenv/config"` en dat laadt alleen `.env`, dat niet bestaat.

```bash
cp .env.local .env
```

- [ ] **Step 4: Lees de diff vóórdat je iets wegschrijft**

```bash
PATH="$HOME/.nvm/versions/node/v20.20.1/bin:$PATH" npx prisma migrate diff --from-schema-datasource prisma/schema.prisma --to-schema-datamodel prisma/schema.prisma --script
```

Verwacht: één `CREATE TABLE "TaskDependency"`, één `CREATE UNIQUE INDEX`, één `CREATE INDEX`, twee `ADD CONSTRAINT ... FOREIGN KEY`. **Lees de volledige uitvoer.** Staat er ook maar één `DROP` in, stop dan, push niet, en rapporteer BLOCKED met de volledige uitvoer.

- [ ] **Step 5: Push naar de database**

```bash
PATH="$HOME/.nvm/versions/node/v20.20.1/bin:$PATH" npx prisma db push
```

Verwacht: "Your database is now in sync with your Prisma schema" en daarna "Generated Prisma Client". Bij `P1001` (Neon niet bereikbaar) één keer opnieuw proberen.

- [ ] **Step 6: Ruim `.env` op**

```bash
rm -f .env
```

- [ ] **Step 7: Controleer de client**

```bash
npx tsc --noEmit
```

Verwacht: geen uitvoer.

- [ ] **Step 8: Commit**

```bash
git add prisma/schema.prisma
git commit -m "feat: taken kunnen op elkaar wachten"
```

---

### Task 2: Pure functies — kringlopen en doorrekenen

**Files:**
- Create: `src/lib/task-dependencies.ts`
- Create: `src/lib/task-dependencies.test.ts`

**Interfaces:**
- Consumes: `date-fns`.
- Produces:
  - `type DependencyLink = { taskId: string; dependsOnId: string }`
  - `type SchedulableTask = { id: string; name: string; startDate: string | Date; endDate: string | Date }`
  - `type ShiftedTask = { id: string; name: string; vanStart: Date; vanEind: Date; naarStart: Date; naarEind: Date }`
  - `cycleThrough(links: DependencyLink[], taskId: string, dependsOnId: string): string[] | null`
  - `shiftPlan(taken: SchedulableTask[], links: DependencyLink[]): ShiftedTask[]`

- [ ] **Step 1: Schrijf de falende tests**

Maak `src/lib/task-dependencies.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { cycleThrough, shiftPlan, type DependencyLink, type SchedulableTask } from "./task-dependencies";

// "A wacht op B" schrijven we als { taskId: "A", dependsOnId: "B" }.
const wacht = (taskId: string, dependsOnId: string): DependencyLink => ({ taskId, dependsOnId });

const taak = (id: string, start: string, eind: string): SchedulableTask => ({
  id, name: `taak ${id}`, startDate: start, endDate: eind,
});

describe("cycleThrough", () => {
  it("sees no cycle in an empty graph", () => {
    expect(cycleThrough([], "A", "B")).toBeNull();
  });

  it("refuses a task that waits on itself", () => {
    expect(cycleThrough([], "A", "A")).toEqual(["A", "A"]);
  });

  it("catches the shortest cycle: B already waits on A", () => {
    expect(cycleThrough([wacht("B", "A")], "A", "B")).toEqual(["A", "B", "A"]);
  });

  it("catches a cycle three links long and names the whole chain", () => {
    // B wacht op C, C wacht op A. Nu A op B laten wachten sluit de ring.
    const links = [wacht("B", "C"), wacht("C", "A")];
    expect(cycleThrough(links, "A", "B")).toEqual(["A", "B", "C", "A"]);
  });

  it("allows a link that only looks like a cycle but is not", () => {
    // A en B wachten allebei op C. A op B laten wachten mag: geen ring.
    const links = [wacht("A", "C"), wacht("B", "C")];
    expect(cycleThrough(links, "A", "B")).toBeNull();
  });

  it("does not get stuck on a diamond", () => {
    // D wacht op B en C, die allebei op A wachten. Twee paden naar A, geen ring.
    const links = [wacht("D", "B"), wacht("D", "C"), wacht("B", "A"), wacht("C", "A")];
    expect(cycleThrough(links, "A", "D")).toEqual(["A", "D", "B", "A"]);
    expect(cycleThrough(links, "E", "D")).toBeNull();
  });
});

describe("shiftPlan", () => {
  it("moves nothing when there are no links", () => {
    const taken = [taak("A", "2026-09-01", "2026-09-05"), taak("B", "2026-09-02", "2026-09-06")];
    expect(shiftPlan(taken, [])).toEqual([]);
  });

  it("moves nothing when the successor already starts late enough", () => {
    // A eindigt op de 5e, B begint op de 6e: precies de dag erna, dus goed.
    const taken = [taak("A", "2026-09-01", "2026-09-05"), taak("B", "2026-09-06", "2026-09-10")];
    expect(shiftPlan(taken, [wacht("B", "A")])).toEqual([]);
  });

  it("pushes a successor that starts on the same day as its predecessor ends", () => {
    // Einddatums zijn inclusief: op de 5e is A nog bezig, dus B mag pas op de 6e.
    const taken = [taak("A", "2026-09-01", "2026-09-05"), taak("B", "2026-09-05", "2026-09-09")];
    const plan = shiftPlan(taken, [wacht("B", "A")]);
    expect(plan).toHaveLength(1);
    expect(plan[0].id).toBe("B");
    expect(plan[0].naarStart).toEqual(new Date("2026-09-06"));
    expect(plan[0].naarEind).toEqual(new Date("2026-09-10")); // duur van 5 dagen blijft
  });

  it("cascades down a chain of three", () => {
    const taken = [
      taak("A", "2026-09-01", "2026-09-10"),
      taak("B", "2026-09-02", "2026-09-04"),
      taak("C", "2026-09-05", "2026-09-06"),
    ];
    const plan = shiftPlan(taken, [wacht("B", "A"), wacht("C", "B")]);
    expect(plan.map((p) => p.id)).toEqual(["B", "C"]);
    expect(plan[0].naarStart).toEqual(new Date("2026-09-11"));
    expect(plan[0].naarEind).toEqual(new Date("2026-09-13"));
    // C schuift op naar de nieuwe positie van B, niet naar de oude.
    expect(plan[1].naarStart).toEqual(new Date("2026-09-14"));
    expect(plan[1].naarEind).toEqual(new Date("2026-09-15"));
  });

  it("takes the latest of several predecessors", () => {
    const taken = [
      taak("A", "2026-09-01", "2026-09-05"),
      taak("B", "2026-09-01", "2026-09-20"),
      taak("C", "2026-09-02", "2026-09-03"),
    ];
    const plan = shiftPlan(taken, [wacht("C", "A"), wacht("C", "B")]);
    expect(plan).toHaveLength(1);
    expect(plan[0].naarStart).toEqual(new Date("2026-09-21"));
  });

  it("never pulls a task forward, only pushes it back", () => {
    // A is vervroegd en eindigt op de 3e; B mag blijven staan waar hij staat.
    const taken = [taak("A", "2026-09-01", "2026-09-03"), taak("B", "2026-10-01", "2026-10-05")];
    expect(shiftPlan(taken, [wacht("B", "A")])).toEqual([]);
  });

  it("reports the old dates alongside the new ones", () => {
    const taken = [taak("A", "2026-09-01", "2026-09-05"), taak("B", "2026-09-05", "2026-09-09")];
    const [regel] = shiftPlan(taken, [wacht("B", "A")]);
    expect(regel.name).toBe("taak B");
    expect(regel.vanStart).toEqual(new Date("2026-09-05"));
    expect(regel.vanEind).toEqual(new Date("2026-09-09"));
  });

  it("gives up on a cycle instead of looping forever", () => {
    // Zou niet moeten kunnen — de route weigert kringlopen — maar vastlopen op
    // onverwachte gegevens is erger dan niets doen.
    const taken = [taak("A", "2026-09-01", "2026-09-05"), taak("B", "2026-09-01", "2026-09-05")];
    expect(shiftPlan(taken, [wacht("A", "B"), wacht("B", "A")])).toEqual([]);
  });

  it("ignores links that point at a task it does not know", () => {
    const taken = [taak("A", "2026-09-01", "2026-09-05")];
    expect(shiftPlan(taken, [wacht("A", "ONBEKEND")])).toEqual([]);
  });
});
```

- [ ] **Step 2: Draai de tests en zie ze falen**

```bash
PATH="$HOME/.nvm/versions/node/v20.20.1/bin:$PATH" npx vitest run src/lib/task-dependencies.test.ts
```

Verwacht: FAIL, "Failed to resolve import ./task-dependencies".

- [ ] **Step 3: Schrijf `src/lib/task-dependencies.ts`**

```ts
import { addDays, differenceInCalendarDays } from "date-fns";

/**
 * Afhankelijkheden tussen taken van hetzelfde project: welke koppeling een
 * kringloop zou sluiten, en hoe de planning eruitziet als je ze allemaal
 * respecteert.
 *
 * Apart van `planning.ts`, dat met bijna driehonderd regels lang genoeg is en
 * over de tijdlijn zelf gaat. Geen React en geen Prisma, zodat het te testen is
 * zonder database en zonder scherm.
 *
 * De vorm van een koppeling is overal `{ taskId, dependsOnId }` en betekent:
 * `taskId` wacht op `dependsOnId`. In de tijd komt `dependsOnId` dus eerst.
 */
export type DependencyLink = { taskId: string; dependsOnId: string };

export type SchedulableTask = {
  id: string;
  name: string;
  startDate: string | Date;
  endDate: string | Date;
};

/** Wat er van een taak wacht op wie, als opzoektabel. */
function wachtOpTabel(links: DependencyLink[]): Map<string, string[]> {
  const tabel = new Map<string, string[]>();
  for (const link of links) {
    const bestaand = tabel.get(link.taskId);
    if (bestaand) bestaand.push(link.dependsOnId);
    else tabel.set(link.taskId, [link.dependsOnId]);
  }
  return tabel;
}

/**
 * De keten die je zou sluiten door `taskId` op `dependsOnId` te laten wachten,
 * of `null` als het gewoon mag.
 *
 * De keten komt terug als lijst van id's die begint en eindigt bij `taskId`,
 * zodat de foutmelding kan tonen wélke ring je maakt in plaats van alleen dát
 * er een ring is. Zoeken doen we vanaf `dependsOnId` over bestaande
 * wacht-op-koppelingen: bereiken we `taskId`, dan is de ring rond.
 */
export function cycleThrough(
  links: DependencyLink[],
  taskId: string,
  dependsOnId: string,
): string[] | null {
  if (taskId === dependsOnId) return [taskId, taskId];

  const wachtOp = wachtOpTabel(links);
  const pad = [taskId, dependsOnId];
  const bezocht = new Set<string>();

  function zoek(huidig: string): boolean {
    if (huidig === taskId) return true;
    // Al gezien betekent: langs deze kant komen we niet uit bij taskId, en
    // nogmaals kijken zou bij een diamant of een ring nooit stoppen.
    if (bezocht.has(huidig)) return false;
    bezocht.add(huidig);
    for (const volgende of wachtOp.get(huidig) ?? []) {
      pad.push(volgende);
      if (zoek(volgende)) return true;
      pad.pop();
    }
    return false;
  }

  return zoek(dependsOnId) ? pad : null;
}

/**
 * De volgorde waarin je de taken kunt doorrekenen: elke taak komt ná alles waar
 * hij op wacht. `null` als dat niet kan, dus bij een kringloop.
 */
function topologischeVolgorde(
  taken: SchedulableTask[],
  links: DependencyLink[],
): string[] | null {
  const bekend = new Set(taken.map((t) => t.id));
  // Koppelingen naar taken buiten deze lijst tellen niet mee; die kunnen we
  // niet doorrekenen en mogen de volgorde niet blokkeren.
  const geldig = links.filter((l) => bekend.has(l.taskId) && bekend.has(l.dependsOnId));

  const openstaand = new Map<string, number>();
  for (const t of taken) openstaand.set(t.id, 0);
  for (const l of geldig) openstaand.set(l.taskId, (openstaand.get(l.taskId) ?? 0) + 1);

  const klaar = taken.filter((t) => openstaand.get(t.id) === 0).map((t) => t.id);
  const volgorde: string[] = [];

  while (klaar.length > 0) {
    const id = klaar.shift() as string;
    volgorde.push(id);
    for (const l of geldig) {
      if (l.dependsOnId !== id) continue;
      const rest = (openstaand.get(l.taskId) ?? 0) - 1;
      openstaand.set(l.taskId, rest);
      if (rest === 0) klaar.push(l.taskId);
    }
  }

  return volgorde.length === taken.length ? volgorde : null;
}

/** Eén regel uit het verschuif-overzicht. */
export type ShiftedTask = {
  id: string;
  name: string;
  vanStart: Date;
  vanEind: Date;
  naarStart: Date;
  naarEind: Date;
};

/**
 * Welke taken zouden verschuiven als je alle koppelingen respecteert.
 *
 * Kijkt naar de **hele toestand** van een project en niet naar één wijziging:
 * een nieuwe koppeling kan net zo goed een schending opleveren als een
 * verschoven datum, en zo dekt één functie allebei de gevallen zonder dat ze
 * uit de pas kunnen lopen.
 *
 * Schuift alleen vooruit. Naar voren trekken zou betekenen dat je een taak
 * vervroegt en er ineens werk op je scherm staat dat je niet hebt aangeraakt.
 *
 * Bij een kringloop komt er een lege lijst terug in plaats van een oneindige
 * lus. De koppelroute weigert kringlopen, dus dit hoort niet voor te komen —
 * maar vastlopen op onverwachte gegevens is erger dan niets doen.
 */
export function shiftPlan(taken: SchedulableTask[], links: DependencyLink[]): ShiftedTask[] {
  const volgorde = topologischeVolgorde(taken, links);
  if (!volgorde) return [];

  const opNaam = new Map(taken.map((t) => [t.id, t]));
  const nu = new Map(
    taken.map((t) => [t.id, { start: new Date(t.startDate), eind: new Date(t.endDate) }]),
  );
  const wachtOp = wachtOpTabel(links);

  const verschoven: ShiftedTask[] = [];

  for (const id of volgorde) {
    const voorgangers = (wachtOp.get(id) ?? []).filter((v) => nu.has(v));
    if (voorgangers.length === 0) continue;

    const huidig = nu.get(id) as { start: Date; eind: Date };
    // Einddatums zijn inclusief, dus de opvolger mag pas de dag erna beginnen.
    const laatsteEind = voorgangers
      .map((v) => (nu.get(v) as { eind: Date }).eind)
      .reduce((a, b) => (b > a ? b : a));
    const vereisteStart = addDays(laatsteEind, 1);
    if (huidig.start >= vereisteStart) continue;

    const dagen = differenceInCalendarDays(vereisteStart, huidig.start);
    const naarStart = addDays(huidig.start, dagen);
    const naarEind = addDays(huidig.eind, dagen);

    verschoven.push({
      id,
      name: (opNaam.get(id) as SchedulableTask).name,
      vanStart: huidig.start,
      vanEind: huidig.eind,
      naarStart,
      naarEind,
    });
    // Bijwerken, zodat wat áchter deze taak hangt met de nieuwe datum rekent en
    // niet met de oude.
    nu.set(id, { start: naarStart, eind: naarEind });
  }

  return verschoven;
}
```

- [ ] **Step 4: Draai de tests en zie ze slagen**

```bash
PATH="$HOME/.nvm/versions/node/v20.20.1/bin:$PATH" npx vitest run src/lib/task-dependencies.test.ts
```

Verwacht: PASS, 16 tests.

- [ ] **Step 5: Commit**

```bash
git add src/lib/task-dependencies.ts src/lib/task-dependencies.test.ts
git commit -m "feat: kringloopdetectie en doorrekenen van taakafhankelijkheden"
```

---

### Task 3: Pure functies — signalen en pijlgeometrie

**Files:**
- Modify: `src/lib/task-dependencies.ts`
- Modify: `src/lib/task-dependencies.test.ts`

**Interfaces:**
- Consumes: `DependencyLink`, `SchedulableTask` uit taak 2; `formatDate` uit `./utils`.
- Produces:
  - `type TaakSignaal = { soort: "te-vroeg" | "buiten-project" | "verlopen"; uitleg: string }`
  - `planningWarnings(project, taken, links, vandaag): { perTaak: Record<string, TaakSignaal[]>; projectLooptUit: boolean }` waarbij `project` de vorm `{ plannedStart?: string | Date | null; plannedEnd?: string | Date | null }` heeft
  - `type ArrowPoint = { x: number; y: number }`
  - `arrowPath(van, naar, opties): ArrowPoint[]` met `van`/`naar` van de vorm `{ leftPct: number; widthPct: number; rij: number }` en `opties` van de vorm `{ breedte: number; rijHoogte: number; stub?: number }`

- [ ] **Step 1: Schrijf de falende tests**

Voeg onderaan `src/lib/task-dependencies.test.ts` toe, en breid de importregel bovenaan uit met `planningWarnings` en `arrowPath`:

```ts
const vandaag = new Date("2026-09-15");

describe("planningWarnings", () => {
  const project = { plannedStart: "2026-09-01", plannedEnd: "2026-09-30" };

  it("flags a task that starts before its predecessor is done, naming the predecessor", () => {
    const taken = [taak("A", "2026-09-01", "2026-09-10"), taak("B", "2026-09-05", "2026-09-20")];
    const { perTaak } = planningWarnings(project, taken, [wacht("B", "A")], vandaag);
    expect(perTaak.B).toHaveLength(1);
    expect(perTaak.B[0].soort).toBe("te-vroeg");
    expect(perTaak.B[0].uitleg).toBe("Begint voordat 'taak A' klaar is");
  });

  it("does not flag a successor that starts the day after", () => {
    const taken = [taak("A", "2026-09-01", "2026-09-10"), taak("B", "2026-09-11", "2026-09-20")];
    const { perTaak } = planningWarnings(project, taken, [wacht("B", "A")], vandaag);
    expect(perTaak.B ?? []).toEqual([]);
  });

  it("flags a task that sticks out of the project period, with the period in the text", () => {
    const taken = [taak("A", "2026-09-20", "2026-10-15")];
    const { perTaak } = planningWarnings(project, taken, [], vandaag);
    expect(perTaak.A[0].soort).toBe("buiten-project");
    expect(perTaak.A[0].uitleg).toBe("Valt buiten de projectperiode (01-SEP-2026 t/m 30-SEP-2026)");
  });

  it("flags a task that started before the project did", () => {
    const taken = [taak("A", "2026-08-20", "2026-09-05")];
    const { perTaak } = planningWarnings(project, taken, [], vandaag);
    expect(perTaak.A.map((s) => s.soort)).toContain("buiten-project");
  });

  it("says a project runs over when its tasks end after its planned end", () => {
    const taken = [taak("A", "2026-09-20", "2026-10-15")];
    expect(planningWarnings(project, taken, [], vandaag).projectLooptUit).toBe(true);
    expect(planningWarnings(project, [taak("A", "2026-09-01", "2026-09-10")], [], vandaag).projectLooptUit).toBe(false);
  });

  it("cannot judge a project without dates of its own", () => {
    // Dan spant de balk zich om de taken en kan er per definitie niets uitsteken.
    const los = { plannedStart: null, plannedEnd: null };
    const taken = [taak("A", "2026-01-01", "2026-12-31")];
    const { perTaak, projectLooptUit } = planningWarnings(los, taken, [], vandaag);
    expect(perTaak.A ?? []).toEqual([]);
    expect(projectLooptUit).toBe(false);
  });

  it("marks a task whose end date has passed, quietly", () => {
    const taken = [taak("A", "2026-09-01", "2026-09-10")];
    const { perTaak } = planningWarnings(project, taken, [], vandaag);
    expect(perTaak.A[0].soort).toBe("verlopen");
    expect(perTaak.A[0].uitleg).toBe("De einddatum is voorbij");
  });

  it("does not call a task that ends today expired", () => {
    const taken = [taak("A", "2026-09-01", "2026-09-15")];
    const { perTaak } = planningWarnings(project, taken, [], vandaag);
    expect((perTaak.A ?? []).map((s) => s.soort)).not.toContain("verlopen");
  });

  it("can give one task several signals at once", () => {
    const taken = [taak("A", "2026-08-01", "2026-08-20"), taak("B", "2026-08-10", "2026-08-25")];
    const { perTaak } = planningWarnings(project, taken, [wacht("B", "A")], vandaag);
    expect(perTaak.B.map((s) => s.soort).sort()).toEqual(["buiten-project", "te-vroeg", "verlopen"]);
  });
});

describe("arrowPath", () => {
  const opties = { breedte: 1000, rijHoogte: 24, stub: 8 };

  it("leaves the right edge of the predecessor and arrives at the left edge of the successor", () => {
    const punten = arrowPath(
      { leftPct: 10, widthPct: 20, rij: 0 },
      { leftPct: 40, widthPct: 20, rij: 1 },
      opties,
    );
    expect(punten).toEqual([
      { x: 300, y: 12 },
      { x: 308, y: 12 },
      { x: 308, y: 36 },
      { x: 400, y: 36 },
    ]);
  });

  it("keeps its elbow when the successor sits on the same row", () => {
    const punten = arrowPath(
      { leftPct: 0, widthPct: 10, rij: 2 },
      { leftPct: 20, widthPct: 10, rij: 2 },
      opties,
    );
    expect(punten.map((p) => p.y)).toEqual([60, 60, 60, 60]);
    expect(punten.at(-1)?.x).toBe(200);
  });

  it("still draws when the successor starts too early, running backwards", () => {
    // Dat is precies het geval dat rood oplicht; verbergen zou de fout verhullen.
    const punten = arrowPath(
      { leftPct: 50, widthPct: 20, rij: 0 },
      { leftPct: 10, widthPct: 10, rij: 1 },
      opties,
    );
    expect(punten.at(-1)?.x).toBe(100);
    expect(punten[1].x).toBe(708);
  });

  it("uses a default stub when none is given", () => {
    const punten = arrowPath(
      { leftPct: 0, widthPct: 10, rij: 0 },
      { leftPct: 20, widthPct: 10, rij: 1 },
      { breedte: 1000, rijHoogte: 24 },
    );
    expect(punten[1].x).toBe(108);
  });
});
```

- [ ] **Step 2: Draai de tests en zie ze falen**

```bash
PATH="$HOME/.nvm/versions/node/v20.20.1/bin:$PATH" npx vitest run src/lib/task-dependencies.test.ts
```

Verwacht: FAIL, "planningWarnings is not a function".

- [ ] **Step 3: Breid `src/lib/task-dependencies.ts` uit**

Voeg bovenaan de import toe:

```ts
import { formatDate } from "./utils";
```

En zet dit onderaan het bestand:

```ts
/**
 * Eén markering op een taak, met de uitleg die bij hover verschijnt.
 *
 * De uitleg staat in gewone taal en niet als code: een kleur die je moet
 * onthouden is geen signaal maar een raadsel.
 */
export type TaakSignaal = {
  soort: "te-vroeg" | "buiten-project" | "verlopen";
  uitleg: string;
};

export type ProjectPeriode = {
  plannedStart?: string | Date | null;
  plannedEnd?: string | Date | null;
};

/**
 * Welke markeringen elke taak krijgt, en of de projectbalk zelf oplicht.
 *
 * "verlopen" is met opzet het stille signaal. Zonder "gereed" — dat komt pas in
 * deelproject C — is een afgelopen taak meestal gewoon afgerond werk, en een
 * scherm vol rood ga je negeren; dan is de rode markering die er wél toe doet
 * ook niets meer waard.
 *
 * Een project zonder eigen datums kan niets uitsteken: daar spant de balk zich
 * om de taken. Dan vervallen "buiten-project" en het uitlopen van het project.
 */
export function planningWarnings(
  project: ProjectPeriode,
  taken: SchedulableTask[],
  links: DependencyLink[],
  vandaag: Date,
): { perTaak: Record<string, TaakSignaal[]>; projectLooptUit: boolean } {
  const opNaam = new Map(taken.map((t) => [t.id, t]));
  const wachtOp = wachtOpTabel(links);

  const heeftPeriode = Boolean(project.plannedStart && project.plannedEnd);
  const periodeStart = heeftPeriode ? new Date(project.plannedStart as string) : null;
  const periodeEind = heeftPeriode ? new Date(project.plannedEnd as string) : null;

  const perTaak: Record<string, TaakSignaal[]> = {};
  let projectLooptUit = false;

  for (const t of taken) {
    const start = new Date(t.startDate);
    const eind = new Date(t.endDate);
    const signalen: TaakSignaal[] = [];

    // Een voorganger die op of ná de startdag van deze taak eindigt, is nog
    // bezig — einddatums zijn inclusief.
    for (const voorgangerId of wachtOp.get(t.id) ?? []) {
      const voorganger = opNaam.get(voorgangerId);
      if (!voorganger) continue;
      if (start <= new Date(voorganger.endDate)) {
        signalen.push({
          soort: "te-vroeg",
          uitleg: `Begint voordat '${voorganger.name}' klaar is`,
        });
        break;
      }
    }

    if (periodeStart && periodeEind) {
      if (start < periodeStart || eind > periodeEind) {
        signalen.push({
          soort: "buiten-project",
          uitleg: `Valt buiten de projectperiode (${formatDate(periodeStart)} t/m ${formatDate(periodeEind)})`,
        });
      }
      if (eind > periodeEind) projectLooptUit = true;
    }

    if (eind < vandaag) {
      signalen.push({ soort: "verlopen", uitleg: "De einddatum is voorbij" });
    }

    if (signalen.length > 0) perTaak[t.id] = signalen;
  }

  return { perTaak, projectLooptUit };
}

/** Een knikpunt van een pijl, in pixels binnen de tijdlijnstrook. */
export type ArrowPoint = { x: number; y: number };

export type ArrowEnd = { leftPct: number; widthPct: number; rij: number };

/** Hoever de pijl rechtdoor gaat voordat hij afbuigt. */
const STUB_PX = 8;

/**
 * De knikpunten van de pijl tussen twee taakbalken: uit de rechterrand van de
 * voorganger, een stukje rechtdoor, dan verticaal naar de rij van de opvolger,
 * en zo naar diens linkerrand.
 *
 * Hier en niet in het component, omdat dit rekenwerk is en dus te testen hoort
 * te zijn. Loopt de opvolger te vroeg, dan wijst het laatste stuk naar links —
 * dat is precies het geval dat rood oplicht, en verbergen zou de fout verhullen.
 */
export function arrowPath(
  van: ArrowEnd,
  naar: ArrowEnd,
  opties: { breedte: number; rijHoogte: number; stub?: number },
): ArrowPoint[] {
  const stub = opties.stub ?? STUB_PX;
  const vanX = ((van.leftPct + van.widthPct) / 100) * opties.breedte;
  const vanY = (van.rij + 0.5) * opties.rijHoogte;
  const naarX = (naar.leftPct / 100) * opties.breedte;
  const naarY = (naar.rij + 0.5) * opties.rijHoogte;

  return [
    { x: vanX, y: vanY },
    { x: vanX + stub, y: vanY },
    { x: vanX + stub, y: naarY },
    { x: naarX, y: naarY },
  ];
}
```

- [ ] **Step 4: Draai de tests en zie ze slagen**

```bash
PATH="$HOME/.nvm/versions/node/v20.20.1/bin:$PATH" npx vitest run src/lib/task-dependencies.test.ts
```

Verwacht: PASS, 29 tests.

- [ ] **Step 5: Commit**

```bash
git add src/lib/task-dependencies.ts src/lib/task-dependencies.test.ts
git commit -m "feat: signalen en pijlgeometrie voor de projectplanning"
```

---

### Task 4: Routes — koppelingen leggen en doorschuiven

**Files:**
- Create: `src/lib/task-dependency-rules.ts`
- Modify: `src/app/api/projects/[id]/tasks/route.ts`
- Modify: `src/app/api/project-tasks/[id]/route.ts`
- Modify: `src/app/api/projects/[id]/merge/route.ts`

**Interfaces:**
- Consumes: `cycleThrough`, `shiftPlan` uit taak 2; `canManagePlanning`; `validateDateRange`; `handleError`.
- Produces:
  - `POST /api/projects/[id]/tasks` accepteert `dependsOnIds?: string[]`
  - `PUT /api/project-tasks/[id]` accepteert `dependsOnIds?: string[]` en `applyShift?: boolean`

- [ ] **Step 1: Schrijf de gedeelde controle in een eigen module**

Beide routes moeten dezelfde vier regels afdwingen, dus de controle staat op één plek. **Niet in een routebestand:** Next.js staat daar alleen exports toe die een HTTP-methode zijn, en al het andere laat de build struikelen. Maak daarom `src/lib/task-dependency-rules.ts` — hetzelfde patroon als `src/lib/invoice-number.ts`, dat ook Prisma gebruikt en door twee routes wordt gedeeld:

```ts
import { prisma } from "@/lib/prisma";
import { cycleThrough } from "@/lib/task-dependencies";

/**
 * Keurt de gevraagde koppelingen van één taak. Geeft een Nederlandse melding
 * terug, of `null` als het mag.
 *
 * Alle vier de regels staan hier en niet in het scherm: het scherm verbergt wat
 * niet mag, maar de route is wat het tegenhoudt.
 *
 * `taskId` is leeg bij een nieuwe taak — die kan per definitie nog nergens in
 * een kringloop zitten, dus dan vervalt die controle.
 */
export async function dependencyError(
  projectId: string,
  taskId: string | null,
  dependsOnIds: string[],
): Promise<string | null> {
  if (dependsOnIds.length === 0) return null;
  if (taskId && dependsOnIds.includes(taskId)) return "Een taak kan niet op zichzelf wachten";

  const doelen = await prisma.projectTask.findMany({
    where: { id: { in: dependsOnIds } },
    select: { id: true, projectId: true, name: true },
  });
  if (doelen.length !== dependsOnIds.length) return "Een van de gekozen taken bestaat niet";
  if (doelen.some((d) => d.projectId !== projectId)) {
    return "Een taak kan alleen wachten op taken van hetzelfde project";
  }

  if (!taskId) return null;

  // De bestaande koppelingen van het project, met die van deze taak eruit:
  // die worden immers vervangen door wat er nu binnenkomt.
  const bestaand = await prisma.taskDependency.findMany({
    where: { task: { projectId }, NOT: { taskId } },
    select: { taskId: true, dependsOnId: true },
  });
  const namen = new Map<string, string>();
  const taken = await prisma.projectTask.findMany({
    where: { projectId },
    select: { id: true, name: true },
  });
  for (const t of taken) namen.set(t.id, t.name);

  // Eén voor één toevoegen, want twee nieuwe koppelingen kunnen samen een ring
  // sluiten die geen van beide alleen sluit.
  const samen = [...bestaand];
  for (const dependsOnId of dependsOnIds) {
    const keten = cycleThrough(samen, taskId, dependsOnId);
    if (keten) {
      const leesbaar = keten.map((id) => namen.get(id) ?? "?").join(" → ");
      return `Dit zou een kringloop sluiten: ${leesbaar}`;
    }
    samen.push({ taskId, dependsOnId });
  }

  return null;
}
```


- [ ] **Step 2: Laat de PUT koppelingen en doorschuiven aan**

Voeg in `src/app/api/project-tasks/[id]/route.ts` de imports toe:

```ts
import { shiftPlan } from "@/lib/task-dependencies";
import { dependencyError } from "@/lib/task-dependency-rules";
```

En pas `updateSchema` aan:

```ts
const updateSchema = z.object({
  name: z.string().trim().min(1),
  startDate: z.string().min(1),
  endDate: z.string().min(1),
  // De volledige nieuwe verzameling koppelingen van deze taak; wat er niet in
  // staat, vervalt. Afwezig betekent "laat ze met rust".
  dependsOnIds: z.array(z.string()).optional(),
  // Of de keten achter deze taak mee mag schuiven. Het scherm heeft dat al
  // voorgerekend en laten bevestigen; de server rekent het opnieuw uit.
  applyShift: z.boolean().optional(),
});
```

En in de `PUT`, ná de bestaande datumcontrole en vóór de `update`:

```ts
    if (data.dependsOnIds) {
      const koppelFout = await dependencyError(taak!.projectId, taak!.id, data.dependsOnIds);
      if (koppelFout) return NextResponse.json({ error: koppelFout }, { status: 400 });
    }
```

Vervang daarna de losse `prisma.projectTask.update` door één transactie die de taak bijwerkt, de koppelingen vervangt en desgevraagd de keten doorschuift:

```ts
    const bijgewerkt = await prisma.$transaction(async (tx) => {
      const taakNa = await tx.projectTask.update({
        where: { id: taak!.id },
        data: {
          name: data.name,
          startDate: new Date(data.startDate),
          endDate: new Date(data.endDate),
        },
      });

      if (data.dependsOnIds) {
        // Vervangen, niet aanvullen: het scherm stuurt de volledige lijst.
        await tx.taskDependency.deleteMany({ where: { taskId: taak!.id } });
        if (data.dependsOnIds.length > 0) {
          await tx.taskDependency.createMany({
            data: data.dependsOnIds.map((dependsOnId) => ({ taskId: taak!.id, dependsOnId })),
          });
        }
      }

      if (data.applyShift) {
        // Opnieuw doorrekenen met onze eigen gegevens. Het scherm heeft alleen
        // het voorbeeld getekend; wat het stuurt is geen bewijs.
        const [taken, koppelingen] = await Promise.all([
          tx.projectTask.findMany({
            where: { projectId: taak!.projectId },
            select: { id: true, name: true, startDate: true, endDate: true },
          }),
          tx.taskDependency.findMany({
            where: { task: { projectId: taak!.projectId } },
            select: { taskId: true, dependsOnId: true },
          }),
        ]);
        for (const verschoven of shiftPlan(taken, koppelingen)) {
          await tx.projectTask.update({
            where: { id: verschoven.id },
            data: { startDate: verschoven.naarStart, endDate: verschoven.naarEind },
          });
        }
      }

      return taakNa;
    });

    return NextResponse.json(bijgewerkt);
```

- [ ] **Step 3: Laat de POST koppelingen aan**

In `src/app/api/projects/[id]/tasks/route.ts`, in het schema:

```ts
  // Zodat je een nieuwe taak meteen achter een bestaande kunt hangen.
  dependsOnIds: z.array(z.string()).optional(),
```

Importeer de controle bovenaan:

```ts
import { dependencyError } from "@/lib/task-dependency-rules";
```

En roep hem aan ná de controle dat het project bestaat en vóór het aanmaken, met `null` als taak-id — een nieuwe taak kan nog nergens in een kringloop zitten:

```ts
    if (data.dependsOnIds) {
      const koppelFout = await dependencyError(id, null, data.dependsOnIds);
      if (koppelFout) return NextResponse.json({ error: koppelFout }, { status: 400 });
    }
```

Maak de taak en zijn koppelingen in één transactie, zodat je nooit een taak overhoudt zonder de koppelingen die je bedoelde:

```ts
    const taak = await prisma.$transaction(async (tx) => {
      const nieuw = await tx.projectTask.create({
        data: {
          projectId: id,
          name: data.name,
          startDate: new Date(data.startDate),
          endDate: new Date(data.endDate),
          sortOrder: (laatste?.sortOrder ?? -1) + 1,
        },
      });
      if (data.dependsOnIds && data.dependsOnIds.length > 0) {
        await tx.taskDependency.createMany({
          data: data.dependsOnIds.map((dependsOnId) => ({ taskId: nieuw.id, dependsOnId })),
        });
      }
      return nieuw;
    });
```

- [ ] **Step 4: Leg de aanname vast in de merge-route**

In `src/app/api/projects/[id]/merge/route.ts`, in het commentaarblok boven de transactie, direct ná de zin over `ProjectTask`:

```
    // TaskDependency verhuist niet apart mee en hoeft dat ook niet: een
    // koppeling wijst naar twee taken en niet naar een project, en beide
    // uiteinden verhuizen hierboven samen. Wie die regel ooit weghaalt of
    // splitst, breekt daarmee ook de afhankelijkheden.
```

- [ ] **Step 5: Controleer types en build**

```bash
npx tsc --noEmit
```

Verwacht: geen uitvoer.

```bash
DATABASE_URL="postgresql://x:x@localhost:5432/x" PATH="$HOME/.nvm/versions/node/v20.20.1/bin:$PATH" npm run build
```

Verwacht: exitcode 0.

- [ ] **Step 6: Draai de volledige testsuite**

```bash
PATH="$HOME/.nvm/versions/node/v20.20.1/bin:$PATH" npx vitest run
```

Verwacht: alles groen, geen nieuwe tests in deze taak.

- [ ] **Step 7: Commit**

```bash
git add src/lib/task-dependency-rules.ts "src/app/api/projects/[id]/tasks/route.ts" "src/app/api/project-tasks/[id]/route.ts" "src/app/api/projects/[id]/merge/route.ts"
git commit -m "feat: koppelingen leggen en de keten doorschuiven via de taakroutes"
```

---

### Task 5: Scherm — koppelingen ophalen en "Wacht op" in het taakvenster

**Files:**
- Modify: `src/app/(app)/planning/page.tsx`
- Modify: `src/components/planning/planning-client.tsx`

**Interfaces:**
- Consumes: `PUT /api/project-tasks/[id]` en `POST /api/projects/[id]/tasks` met `dependsOnIds` (taak 4); `cycleThrough` uit taak 2.
- Produces: elke taak in `PlanningClient` heeft nu `waitsOn: { dependsOnId: string }[]`; taken 6, 7 en 8 rekenen daarop.

- [ ] **Step 1: Haal de koppelingen mee op**

In `src/app/(app)/planning/page.tsx`, in de `select` van `tasks`, naast de bestaande velden:

```tsx
        tasks: {
          orderBy: [{ sortOrder: "asc" }, { id: "asc" }],
          select: {
            id: true, name: true, startDate: true, endDate: true, sortOrder: true,
            // Waar deze taak op wacht. De andere kant (`blocks`) is hieruit af
            // te leiden en zou alleen maar dubbel over de lijn gaan.
            waitsOn: { select: { dependsOnId: true } },
          },
        },
```

- [ ] **Step 2: Voeg het "Wacht op"-blokje toe aan het taakvenster**

In `src/components/planning/planning-client.tsx`:

Voeg de import toe:

```tsx
import { cycleThrough } from "@/lib/task-dependencies";
```

Zet bij de andere formulier-state:

```tsx
  const [formWachtOp, setFormWachtOp] = useState<string[]>([]);
```

Vul hem in `openNieuweTaak` met `[]` en in `openTaak` met `taak.waitsOn?.map((w) => w.dependsOnId) ?? []`.

Stuur hem mee in `bewaar`, in allebei de taak-takken, als `dependsOnIds: formWachtOp`.

Toon in het venster, alleen bij de twee taak-soorten en alleen als het project meer dan één taak heeft, een aanvinklijst van de andere taken van dat project:

```tsx
            {venstertje && venstertje.soort !== "project" && andereTaken(venstertje).length > 0 && (
              <div className="space-y-1">
                <Label>Wacht op</Label>
                <div className="max-h-40 space-y-1 overflow-y-auto rounded border p-2">
                  {andereTaken(venstertje).map((t) => {
                      // Een keuze die een kringloop zou sluiten laten we zien maar
                      // niet aanklikken, met de reden erbij — anders zoek je je
                      // wezenloos naar waarom iets niet kan.
                      const keten =
                        venstertje.soort === "taak-bewerk"
                          ? cycleThrough(alleKoppelingen(venstertje.project), venstertje.taak.id, t.id)
                          : null;
                      const naam = (id: string) =>
                        venstertje.project.tasks.find((x) => x.id === id)?.name ?? "?";
                      return (
                        <label
                          key={t.id}
                          className={`flex items-center gap-2 text-sm ${keten ? "text-muted-foreground" : ""}`}
                          title={keten ? `Zou een kringloop sluiten: ${keten.map(naam).join(" → ")}` : undefined}
                        >
                          <input
                            type="checkbox"
                            className="h-4 w-4 rounded border-input accent-primary"
                            disabled={Boolean(keten)}
                            checked={formWachtOp.includes(t.id)}
                            onChange={(e) =>
                              setFormWachtOp((huidig) =>
                                e.target.checked ? [...huidig, t.id] : huidig.filter((x) => x !== t.id),
                              )
                            }
                          />
                          <span className="truncate">{t.name}</span>
                          {keten && <span className="text-xs">(kringloop)</span>}
                        </label>
                      );
                    })}
                </div>
              </div>
            )}
```

Zet daarvoor deze hulpfunctie bovenaan het bestand, buiten het component — hij hangt nergens van af:

```tsx
/**
 * De taken waar deze taak op zou kunnen wachten: die van hetzelfde project,
 * zichzelf niet meegerekend. Een aparte functie omdat TypeScript de soort van
 * het venster anders niet meeneemt in de filter.
 */
function andereTaken(
  venstertje: { soort: "taak-nieuw"; project: PlanningProject } | { soort: "taak-bewerk"; project: PlanningProject; taak: PlanningProject["tasks"][number] },
) {
  return venstertje.soort === "taak-bewerk"
    ? venstertje.project.tasks.filter((t) => t.id !== venstertje.taak.id)
    : venstertje.project.tasks;
}

/** Alle koppelingen van een project, in de vorm die task-dependencies verwacht. */
function alleKoppelingen(project: PlanningProject) {
  return project.tasks.flatMap((t) =>
    (t.waitsOn ?? []).map((w) => ({ taskId: t.id, dependsOnId: w.dependsOnId })),
  );
}
```

- [ ] **Step 3: Breid het type uit**

`PlanningProject` in `src/lib/planning.ts` beschrijft `tasks` via `PlanningTask`. Voeg daar het veld toe, optioneel zodat bestaande gebruikers ervan niets merken:

```ts
  /** Waar deze taak op wacht. Alleen gevuld op het planningsscherm. */
  waitsOn?: { dependsOnId: string }[];
```

- [ ] **Step 4: Controleer types, tests en build**

```bash
npx tsc --noEmit
```

Verwacht: geen uitvoer.

```bash
PATH="$HOME/.nvm/versions/node/v20.20.1/bin:$PATH" npx vitest run
```

Verwacht: alles groen.

```bash
DATABASE_URL="postgresql://x:x@localhost:5432/x" PATH="$HOME/.nvm/versions/node/v20.20.1/bin:$PATH" npm run build
```

Verwacht: exitcode 0.

- [ ] **Step 5: Commit**

```bash
git add src/lib/planning.ts "src/app/(app)/planning/page.tsx" src/components/planning/planning-client.tsx
git commit -m "feat: vastleggen waar een taak op wacht"
```

---

### Task 6: Scherm — het verschuif-overzicht met drie knoppen

**Files:**
- Modify: `src/components/planning/planning-client.tsx`

**Interfaces:**
- Consumes: `shiftPlan` uit taak 2; `alleKoppelingen` uit taak 5; de route uit taak 4 met `applyShift`.
- Produces: niets voor latere taken.

- [ ] **Step 1: Reken het voorbeeld uit ná een geslaagde opslag**

Na het opslaan van een taak — datums, koppelingen of allebei — draait `shiftPlan` over de nieuwe toestand van het project. Levert dat niets op, dan is er niets aan de hand en ververst het scherm zoals nu. Levert het wél iets op, dan komt het overzicht in beeld in plaats van dat het venster sluit.

Zet bij de andere state:

```tsx
  // Het voorgerekende overzicht, of null als er niets te verschuiven valt.
  const [verschuiving, setVerschuiving] = useState<
    { taakId: string; regels: ReturnType<typeof shiftPlan> } | null
  >(null);
```

De toestand ná opslaan is niet die van de server — die komt pas met `router.refresh()`. Reken daarom door met de gegevens die je zelf net verstuurd hebt: neem de taken van het project, vervang die ene taak door zijn nieuwe datums, en vervang zijn koppelingen door `formWachtOp`.

- [ ] **Step 2: Toon het overzicht**

Een tweede `Dialog`, met per regel de naam en `oud → nieuw` in `DD-MMM-YYYY` via `formatDate`, en een waarschuwing bij elke regel die buiten de projectperiode valt (dat is `project.plannedStart`/`plannedEnd` vergelijken met `naarStart`/`naarEind`; alleen als het project eigen datums heeft).

**Twee knoppen**, niet drie. Het ontwerp noemde er drie — annuleren, alleen deze taak, alles verschuiven — maar in deze volgorde is de taak op het moment van het overzicht al opgeslagen, en dan is "annuleren" hetzelfde als "alleen deze taak" met een misleidende naam. Twee knoppen die hetzelfde doen is erger dan één:

- **Alleen deze taak** — sluit het overzicht en ververst het scherm. De keten blijft staan waar hij stond; de schending licht daarna rood op, precies zoals bedoeld.
- **Alles verschuiven** — stuurt dezelfde `PUT` nogmaals, nu met `applyShift: true`, en ververst daarna.

- [ ] **Step 3: Controleer types, tests en build**

```bash
npx tsc --noEmit
```

Verwacht: geen uitvoer.

```bash
PATH="$HOME/.nvm/versions/node/v20.20.1/bin:$PATH" npx vitest run
```

Verwacht: alles groen.

```bash
DATABASE_URL="postgresql://x:x@localhost:5432/x" PATH="$HOME/.nvm/versions/node/v20.20.1/bin:$PATH" npm run build
```

Verwacht: exitcode 0.

- [ ] **Step 4: Commit**

```bash
git add src/components/planning/planning-client.tsx
git commit -m "feat: voorrekenen wat er meeschuift, met bevestiging"
```

---

### Task 7: Scherm — pijlen tussen de taakbalken

**Files:**
- Modify: `src/components/planning/planning-client.tsx`

**Interfaces:**
- Consumes: `arrowPath` uit taak 3, `barGeometry` uit `@/lib/planning`, `alleKoppelingen` uit taak 5.
- Produces: constante `TAAKRIJ_PX`, waar taak 8 niets mee hoeft.

- [ ] **Step 1: Leg de rijhoogte vast**

Pijlen tekenen kan alleen als de verticale positie van een taakrij te berekenen is. Zet bij `NAAMKOLOM_PX`:

```tsx
/**
 * Vaste hoogte van een taakrij, inclusief de onderrand. Vast en niet door de
 * inhoud bepaald, want de pijlen rekenen ermee: rij × deze hoogte is het
 * middelpunt van de balk.
 */
const TAAKRIJ_PX = 25;
```

Geef de taakrij die hoogte expliciet mee (`style={{ height: TAAKRIJ_PX }}` op de rij-`div`) in plaats van hem te laten volgen uit `py-1.5`.

- [ ] **Step 2: Teken de pijlen**

Per **uitgeklapt** project een `<svg>` dat de taakrijen overlapt: `position: absolute`, `left: NAAMKOLOM_PX`, breedte `breedte`, hoogte `aantalTaken * TAAKRIJ_PX`, `pointer-events: none` zodat je er dwars doorheen kunt klikken, en een `z-index` onder de vandaag-streep (die staat op `z-10`).

Voor elke koppeling van dat project: zoek de rij-index van voorganger en opvolger in `project.tasks`, bereken beide balkgeometrieën met `barGeometry` tegen het venster, en haal de knikpunten op met `arrowPath`. Teken een `<polyline>` met `fill="none"`, plus een klein driehoekje als punt bij het laatste knikpunt.

Kleur uit de Tailwind-tokens via `stroke="currentColor"` op een omhullend element met `text-muted-foreground`, en `text-destructive` als de koppeling geschonden is — dat wil zeggen: als de opvolger op of vóór de einddatum van de voorganger begint.

- [ ] **Step 3: Controleer types, tests en build**

```bash
npx tsc --noEmit
```

Verwacht: geen uitvoer.

```bash
PATH="$HOME/.nvm/versions/node/v20.20.1/bin:$PATH" npx vitest run
```

Verwacht: alles groen.

```bash
DATABASE_URL="postgresql://x:x@localhost:5432/x" PATH="$HOME/.nvm/versions/node/v20.20.1/bin:$PATH" npm run build
```

Verwacht: exitcode 0.

- [ ] **Step 4: Commit**

```bash
git add src/components/planning/planning-client.tsx
git commit -m "feat: pijlen tussen afhankelijke taken"
```

---

### Task 8: Scherm — de vier signalen

**Files:**
- Modify: `src/components/planning/planning-client.tsx`

**Interfaces:**
- Consumes: `planningWarnings` uit taak 3, `alleKoppelingen` uit taak 5.
- Produces: niets. Dit is de laatste taak.

- [ ] **Step 1: Reken de signalen per project uit**

Roep per project `planningWarnings(project, project.tasks, alleKoppelingen(project), vandaag)` aan. Dat levert de markeringen per taak en of de projectbalk oplicht.

- [ ] **Step 2: Zet ze op de balken**

| Signaal | Weergave |
|---|---|
| `te-vroeg` of `buiten-project` op een taak | taakbalk in `bg-destructive` in plaats van `bg-primary/50` |
| `verlopen` en verder niets | taakbalk in `bg-muted-foreground/40` — gedempt, geen alarm |
| `projectLooptUit` | projectbalk in `bg-destructive` in plaats van `bg-primary` |

Een taak met meerdere signalen krijgt de zwaarste kleur; `verlopen` verliest het dus altijd van de andere twee.

De `title` van de balk krijgt de uitleg erbij, ná de naam en de datums die er al in staan, elk signaal op een eigen regel:

```tsx
title={[`${taak.name} — ${formatDate(taak.startDate)} t/m ${formatDate(taak.endDate)}`,
        ...(signalen[taak.id] ?? []).map((s) => s.uitleg)].join("\n")}
```

- [ ] **Step 3: Controleer types, tests en build**

```bash
npx tsc --noEmit
```

Verwacht: geen uitvoer.

```bash
PATH="$HOME/.nvm/versions/node/v20.20.1/bin:$PATH" npx vitest run
```

Verwacht: alles groen.

```bash
DATABASE_URL="postgresql://x:x@localhost:5432/x" PATH="$HOME/.nvm/versions/node/v20.20.1/bin:$PATH" npm run build
```

Verwacht: exitcode 0.

- [ ] **Step 4: Commit**

```bash
git add src/components/planning/planning-client.tsx
git commit -m "feat: signalen op de planningstijdlijn"
```

---

## Klaar wanneer

- Een beheerder legt in het taakvenster vast op welke taken een taak wacht, en ziet de pijlen tussen de balken van een uitgeklapt project.
- Een kringloop wordt geweigerd, met de keten in de melding.
- Een taak naar later verschuiven toont wat er mee zou schuiven, met een waarschuwing bij wat buiten de projectdatums valt, en de keuze tussen alleen deze taak of de hele keten.
- De vier signalen lichten op zoals in de tabel, met de uitleg bij hover.
- `npx tsc --noEmit` is schoon, `npm run build` geeft exitcode 0 en de volledige vitest-suite is groen.
