# Projectplanning A — tijdlijn en taken — Implementatieplan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Een beheerder ziet de actieve projecten en hun taken als balken op een tijdlijn en kan die planning ter plekke invoeren en bijwerken.

**Architecture:** Twee nullable datumkolommen op `Project` en een nieuwe tabel `ProjectTask`. Alle rekenkunde — venster, balkgeometrie, groepering, validatie, volgorde — zit als pure functies in `src/lib/planning.ts` met vitest-dekking. Het scherm is een server-gerenderde pagina die een client-component voedt; de tijdlijn is een CSS-grid met percentueel geplaatste balken, geen bibliotheek. Mutaties gaan via API-routes, waarna het scherm zichzelf ververst met `router.refresh()`.

**Tech Stack:** Next.js 16 (App Router), React 19, Prisma 6 + PostgreSQL (Neon), zod, date-fns, Tailwind, shadcn-componenten uit `src/components/ui`, vitest.

**Spec:** `docs/superpowers/specs/2026-08-19-projectplanning-tijdlijn-design.md`

## Global Constraints

- **Lees eerst `AGENTS.md`.** Dit is Next.js 16; APIs en conventies wijken af van oudere versies. Raadpleeg `node_modules/next/dist/docs/` vóór je routing- of pagina-code schrijft.
- **Datums in de UI altijd als `DD-MMM-YYYY`** (`01-SEP-2026`) via `formatDate` uit `src/lib/utils.ts`. Nooit ISO tonen. `<input type="date">` gebruikt intern wel ISO — dat is de enige uitzondering, want dat schrijft de browser voor.
- **Einddatums zijn inclusief.** 01-SEP-2026 t/m 01-SEP-2026 is één dag; elke duurberekening is `differenceInCalendarDays(eind, start) + 1`.
- **Alleen `ADMIN`.** Elke nieuwe route weigert zelf, ook als de UI het al verbergt.
- **Dit project test uitsluitend pure functies** in `src/lib/*.test.ts`. Geen component-, route- of integratietests; die bestaan hier niet en moeten niet geïntroduceerd worden.
- **Geen nieuwe npm-afhankelijkheden.**
- **Commentaar en foutmeldingen in het Nederlands**, in de stijl van de omringende bestanden: leg uit *waarom*, niet *wat*.
- **Route-handlers krijgen `params` als `Promise`** — `{ params }: { params: Promise<{ id: string }> }`, en dan `const { id } = await params;`.
- **Node 20 is verplicht** voor npm/npx-commando's. Zet hem als PATH-prefix op één commando: `PATH="$HOME/.nvm/versions/node/v20.20.1/bin:$PATH" npx vitest run`. Ketens met `&&` worden door de permissielaag geweigerd.
- **`npx tsc --noEmit` en `npm run build` moeten schoon blijven.** De build heeft `DATABASE_URL` nodig maar verbindt niet: `DATABASE_URL="postgresql://x:x@localhost:5432/x" npm run build`.
- **De database in `.env.local` is productie.** Alleen lezen, behalve de ene `db:push` in taak 1.

---

## Bestandsindeling

| Bestand | Verantwoordelijkheid |
|---|---|
| `prisma/schema.prisma` | `Project.plannedStart`, `Project.plannedEnd`, model `ProjectTask`. |
| `src/lib/planning.ts` | Alle rekenkunde en oordelen: balk van een project, venster, geometrie, groepering, validatie, volgorde. Geen React, geen Prisma. |
| `src/lib/planning.test.ts` | Tests daarvan. |
| `src/lib/roles.ts` | `managePlanning` en `canManagePlanning`. |
| `src/app/api/projects/[id]/route.ts` | Bestaande PUT uitgebreid met de twee datums. |
| `src/app/api/projects/[id]/merge/route.ts` | Taken verhuizen mee naar het doelproject. |
| `src/app/api/projects/[id]/tasks/route.ts` | POST: taak aanmaken. |
| `src/app/api/project-tasks/[id]/route.ts` | PUT, PATCH (volgorde), DELETE op één taak. |
| `src/app/(app)/planning/page.tsx` | Server-component: haalt op, bewaakt de rol, geeft door. |
| `src/components/planning/planning-client.tsx` | Tijdlijn plus alle vensters voor invoer. |
| `src/components/layout/sidebar.tsx` | Menu-item Planning → Tijdlijn. |

---

### Task 1: Schema en database

**Files:**
- Modify: `prisma/schema.prisma` (model `Project`, en een nieuw model onder `ProjectStatus`)

**Interfaces:**
- Consumes: niets.
- Produces: `Project.plannedStart: Date | null`, `Project.plannedEnd: Date | null`, `Project.tasks: ProjectTask[]`, en model `ProjectTask { id, projectId, name, startDate, endDate, sortOrder, createdAt, updatedAt }`. Alle volgende taken leunen hierop.

- [ ] **Step 1: Voeg de twee velden toe aan `Project`**

Zoek in `prisma/schema.prisma` het blok `model Project {` en zet de twee velden direct onder `archivedAt`, plus de relatie onderaan bij de andere relaties:

```prisma
  archivedAt        DateTime?
  // Grof geplande doorlooptijd, ingevuld door een beheerder op /planning.
  // Allebei of geen van beide: één losse datum levert geen balk op en wordt
  // door de API geweigerd. Zijn ze leeg, dan spant de balk zich om de taken.
  plannedStart      DateTime?             @db.Date
  plannedEnd        DateTime?             @db.Date
  timeEntries       TimeEntry[]
```

En bij de relaties onderaan hetzelfde model:

```prisma
  tags              Tag[]
  tasks             ProjectTask[]
```

- [ ] **Step 2: Voeg het model `ProjectTask` toe**

Zet dit direct ná het blok `enum ProjectStatus { ... }`:

```prisma
model ProjectTask {
  id        String   @id @default(cuid())
  projectId String
  project   Project  @relation(fields: [projectId], references: [id], onDelete: Cascade)
  name      String
  // Verplicht: een taak zonder datums kun je niet op een tijdlijn tekenen.
  // Dat is een to-do en hoort niet in dit scherm.
  startDate DateTime @db.Date
  // Inclusief. Start en eind op dezelfde dag is een taak van één dag.
  endDate   DateTime @db.Date
  // De volgorde waarin het werk gebeurt, door de beheerder bepaald. Niet op
  // createdAt sorteren: Postgres geeft alle rijen van één transactie dezelfde
  // waarde, dus daarop sorteren zegt niets — zie InvoiceLine.sortOrder.
  sortOrder Int      @default(0)
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  @@index([projectId])
}
```

- [ ] **Step 3: Kopieer `.env.local` naar `.env`**

Prisma leest `.env.local` niet: `prisma.config.ts` doet `import "dotenv/config"` en dat laadt alleen `.env`, dat niet bestaat.

```bash
cp .env.local .env
```

- [ ] **Step 4: Lees de diff vóórdat je iets wegschrijft**

```bash
PATH="$HOME/.nvm/versions/node/v20.20.1/bin:$PATH" npx prisma migrate diff --from-schema-datasource prisma/schema.prisma --to-schema-datamodel prisma/schema.prisma --script
```

Verwacht: precies twee `ALTER TABLE "Project" ADD COLUMN` (`plannedStart`, `plannedEnd`), één `CREATE TABLE "ProjectTask"`, één `CREATE INDEX`, één `ADD CONSTRAINT ... FOREIGN KEY`. **Lees de volledige uitvoer.** Staat er ook maar één `DROP` in, stop dan en meld het — er is dan schemadrift die niets met deze taak te maken heeft.

- [ ] **Step 5: Push naar de database**

```bash
PATH="$HOME/.nvm/versions/node/v20.20.1/bin:$PATH" npx prisma db push
```

Verwacht: "Your database is now in sync with your Prisma schema" en daarna "Generated Prisma Client". Krijg je `P1001` (kan de server niet bereiken), probeer het dan één keer opnieuw; Neon doet dat af en toe.

- [ ] **Step 6: Ruim `.env` op**

```bash
rm -f .env
```

- [ ] **Step 7: Controleer dat de client klopt**

```bash
npx tsc --noEmit
```

Verwacht: geen uitvoer.

- [ ] **Step 8: Commit**

```bash
git add prisma/schema.prisma
git commit -m "feat: geplande datums op een project en een taakmodel eronder"
```

---

### Task 2: Pure functies — balk van een project en datumvalidatie

**Files:**
- Create: `src/lib/planning.ts`
- Create: `src/lib/planning.test.ts`

**Interfaces:**
- Consumes: `ZONDER_KLANT` uit `src/lib/project-picker.ts`.
- Produces:
  - `type PlanningTask = { id: string; name: string; startDate: string | Date; endDate: string | Date; sortOrder: number }`
  - `type PlanningProject = { id: string; name: string; plannedStart?: string | Date | null; plannedEnd?: string | Date | null; customer?: { name: string } | null; tasks: PlanningTask[] }`
  - `type DateRange = { start: Date; end: Date }`
  - `projectBar(project: PlanningProject): DateRange | null`
  - `unplannedProjects(projects: PlanningProject[]): PlanningProject[]`
  - `validateDateRange(start, end): string | null`
  - `groupByCustomer(projects: PlanningProject[]): { customerName: string; projects: PlanningProject[] }[]`

- [ ] **Step 1: Schrijf de falende tests**

Maak `src/lib/planning.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { projectBar, unplannedProjects, validateDateRange, groupByCustomer } from "./planning";

const taak = (id: string, start: string, eind: string, sortOrder = 0) => ({
  id, name: `taak ${id}`, startDate: start, endDate: eind, sortOrder,
});

describe("projectBar", () => {
  it("uses the project's own dates when both are filled in", () => {
    const bar = projectBar({
      id: "p1", name: "Datalogger",
      plannedStart: "2026-09-01", plannedEnd: "2026-10-15",
      tasks: [taak("t1", "2026-09-05", "2026-09-20")],
    });
    expect(bar).toEqual({ start: new Date("2026-09-01"), end: new Date("2026-10-15") });
  });

  it("spans the tasks when the project has no dates of its own", () => {
    const bar = projectBar({
      id: "p1", name: "H3X",
      tasks: [taak("t1", "2026-09-10", "2026-09-14"), taak("t2", "2026-09-03", "2026-09-08")],
    });
    expect(bar).toEqual({ start: new Date("2026-09-03"), end: new Date("2026-09-14") });
  });

  it("falls back to the tasks when only one of the two dates is filled in", () => {
    // De API weigert een halve invulling, maar oude of met de hand gewijzigde
    // rijen mogen hier geen onzinbalk opleveren.
    const bar = projectBar({
      id: "p1", name: "Half", plannedStart: "2026-09-01", plannedEnd: null,
      tasks: [taak("t1", "2026-10-01", "2026-10-02")],
    });
    expect(bar).toEqual({ start: new Date("2026-10-01"), end: new Date("2026-10-02") });
  });

  it("returns null when there is nothing to draw", () => {
    expect(projectBar({ id: "p1", name: "Intern", tasks: [] })).toBeNull();
  });
});

describe("unplannedProjects", () => {
  it("keeps only the projects that have no bar at all", () => {
    const projecten = [
      { id: "a", name: "Gepland", plannedStart: "2026-09-01", plannedEnd: "2026-09-30", tasks: [] },
      { id: "b", name: "Via taken", tasks: [taak("t1", "2026-09-01", "2026-09-02")] },
      { id: "c", name: "Niets", tasks: [] },
    ];
    expect(unplannedProjects(projecten).map((p) => p.id)).toEqual(["c"]);
  });
});

describe("validateDateRange", () => {
  it("accepts a range that runs forwards, and a single day", () => {
    expect(validateDateRange("2026-09-01", "2026-09-30")).toBeNull();
    expect(validateDateRange("2026-09-01", "2026-09-01")).toBeNull();
  });

  it("rejects an end date before the start date", () => {
    expect(validateDateRange("2026-09-30", "2026-09-01")).toBe("De einddatum ligt vóór de startdatum");
  });

  it("accepts both being empty, because that means 'follow the tasks'", () => {
    expect(validateDateRange(null, null)).toBeNull();
    expect(validateDateRange("", "")).toBeNull();
    expect(validateDateRange(undefined, undefined)).toBeNull();
  });

  it("rejects half a range, because one date draws no bar", () => {
    const melding = "Vul een startdatum én een einddatum in, of allebei niet";
    expect(validateDateRange("2026-09-01", null)).toBe(melding);
    expect(validateDateRange(null, "2026-09-30")).toBe(melding);
  });
});

describe("groupByCustomer", () => {
  const projecten = [
    { id: "3", name: "Onderhoud", customer: { name: "Zonneplan" }, tasks: [] },
    { id: "1", name: "Juli 2026", customer: { name: "Acquaint" }, tasks: [] },
    { id: "2", name: "April 2026", customer: { name: "Acquaint" }, tasks: [] },
    { id: "4", name: "Intern overleg", customer: null, tasks: [] },
  ];

  it("groups per customer and sorts the projects within a group by name", () => {
    const groepen = groupByCustomer(projecten);
    expect(groepen.map((g) => g.customerName)).toEqual(["Acquaint", "Zonneplan", "Zonder klant"]);
    expect(groepen[0].projects.map((p) => p.id)).toEqual(["2", "1"]);
  });

  it("sorts customers the Dutch way, so case does not decide the order", () => {
    // "ekster" hoort tussen Aalscholver en Zwaluw, niet erachter omdat hij met
    // een kleine letter begint.
    const gemengd = [
      { id: "a", name: "P", customer: { name: "Zwaluw" }, tasks: [] },
      { id: "b", name: "P", customer: { name: "ekster" }, tasks: [] },
      { id: "c", name: "P", customer: { name: "Aalscholver" }, tasks: [] },
    ];
    expect(groupByCustomer(gemengd).map((g) => g.customerName)).toEqual([
      "Aalscholver", "ekster", "Zwaluw",
    ]);
  });

  it("keeps two customers that differ only in case apart", () => {
    // Dat zijn twee klantrijen in de database. Samenvoegen zou een echt
    // verschil verbergen, dus dat doet deze functie bewust niet.
    const bijnaGelijk = [
      { id: "a", name: "P", customer: { name: "Acquaint" }, tasks: [] },
      { id: "b", name: "Q", customer: { name: "acquaint" }, tasks: [] },
    ];
    expect(groupByCustomer(bijnaGelijk)).toHaveLength(2);
  });

  it("puts projects without a customer last, not first", () => {
    expect(groupByCustomer(projecten).at(-1)?.customerName).toBe("Zonder klant");
  });

  it("gives an empty list for no projects instead of a group with nothing in it", () => {
    expect(groupByCustomer([])).toEqual([]);
  });
});
```

- [ ] **Step 2: Draai de tests en zie ze falen**

```bash
PATH="$HOME/.nvm/versions/node/v20.20.1/bin:$PATH" npx vitest run src/lib/planning.test.ts
```

Verwacht: FAIL, "Failed to resolve import ./planning".

- [ ] **Step 3: Schrijf `src/lib/planning.ts`**

```ts
import { max, min } from "date-fns";
import { ZONDER_KLANT } from "@/lib/project-picker";

/**
 * De rekenkunde achter de projecttijdlijn: welke balk een project krijgt, welk
 * venster de tijdlijn beslaat en waar een balk daarbinnen staat.
 *
 * Geen React en geen Prisma, zodat het te testen is zonder database en zonder
 * scherm — de conventie van dit project.
 */
export type PlanningTask = {
  id: string;
  name: string;
  startDate: string | Date;
  endDate: string | Date;
  sortOrder: number;
};

export type PlanningProject = {
  id: string;
  name: string;
  plannedStart?: string | Date | null;
  plannedEnd?: string | Date | null;
  customer?: { name: string } | null;
  tasks: PlanningTask[];
};

/** Start en eind, allebei inclusief. */
export type DateRange = { start: Date; end: Date };

/**
 * De balk van een project: zijn eigen datums als je die hebt ingevuld, anders
 * de omhullende van zijn taken, anders `null` — dat laatste betekent "nog niet
 * gepland" en hoort in de lijst onderaan het scherm.
 *
 * Allebei de eigen datums moeten gevuld zijn. De API weigert een halve
 * invulling al, maar één losse datum levert geen balk op en mag hier dus nooit
 * tot een gok leiden.
 */
export function projectBar(project: PlanningProject): DateRange | null {
  if (project.plannedStart && project.plannedEnd) {
    return { start: new Date(project.plannedStart), end: new Date(project.plannedEnd) };
  }
  if (project.tasks.length === 0) return null;
  return {
    start: min(project.tasks.map((t) => new Date(t.startDate))),
    end: max(project.tasks.map((t) => new Date(t.endDate))),
  };
}

/** De projecten zonder balk. Zonder deze lijst verdwijnen ze uit beeld. */
export function unplannedProjects(projects: PlanningProject[]): PlanningProject[] {
  return projects.filter((p) => projectBar(p) === null);
}

/**
 * Keurt een ingevoerd datumbereik. Geeft een leesbare Nederlandse melding
 * terug, of `null` als het mag.
 *
 * Allebei leeg is goed: bij een project betekent dat "volg de taken". Half
 * ingevuld is fout, want daar valt geen balk uit te tekenen.
 */
export function validateDateRange(
  start: string | null | undefined,
  end: string | null | undefined,
): string | null {
  const heeftStart = Boolean(start);
  const heeftEind = Boolean(end);
  if (!heeftStart && !heeftEind) return null;
  if (heeftStart !== heeftEind) return "Vul een startdatum én een einddatum in, of allebei niet";
  if (new Date(end as string) < new Date(start as string)) return "De einddatum ligt vóór de startdatum";
  return null;
}

export type PlanningGroup = { customerName: string; projects: PlanningProject[] };

/**
 * Per klant gegroepeerd, in dezelfde volgorde als de projectkiezer: klantnaam
 * en dan projectnaam, Nederlands vergeleken zodat hoofdletters en accenten
 * vallen zoals je verwacht. Projecten zonder klant staan achteraan; tussen de
 * klanten zouden ze bovenaan belanden puur omdat hun klantnaam leeg is.
 */
export function groupByCustomer(projects: PlanningProject[]): PlanningGroup[] {
  const perKlant = new Map<string, PlanningProject[]>();
  for (const p of projects) {
    const klant = p.customer?.name?.trim() || ZONDER_KLANT;
    const bestaande = perKlant.get(klant);
    if (bestaande) bestaande.push(p);
    else perKlant.set(klant, [p]);
  }

  return [...perKlant.entries()]
    .sort(([a], [b]) => {
      const aLos = a === ZONDER_KLANT;
      const bLos = b === ZONDER_KLANT;
      if (aLos !== bLos) return aLos ? 1 : -1;
      return a.localeCompare(b, "nl", { sensitivity: "base" });
    })
    .map(([customerName, groep]) => ({
      customerName,
      projects: [...groep].sort((a, b) => a.name.localeCompare(b.name, "nl", { sensitivity: "base" })),
    }));
}
```

- [ ] **Step 4: Draai de tests en zie ze slagen**

```bash
PATH="$HOME/.nvm/versions/node/v20.20.1/bin:$PATH" npx vitest run src/lib/planning.test.ts
```

Verwacht: PASS, 14 tests.

- [ ] **Step 5: Commit**

```bash
git add src/lib/planning.ts src/lib/planning.test.ts
git commit -m "feat: balk, groepering en datumvalidatie voor de projecttijdlijn"
```

---

### Task 3: Pure functies — venster en balkgeometrie

**Files:**
- Modify: `src/lib/planning.ts`
- Modify: `src/lib/planning.test.ts`

**Interfaces:**
- Consumes: `projectBar`, `PlanningProject`, `DateRange` uit taak 2.
- Produces:
  - `timelineWindow(projects: PlanningProject[], vandaag: Date): DateRange`
  - `type BarGeometry = { leftPct: number; widthPct: number }`
  - `barGeometry(start: string | Date, end: string | Date, venster: DateRange): BarGeometry`
  - `todayOffsetPct(vandaag: Date, venster: DateRange): number | null`

- [ ] **Step 1: Schrijf de falende tests**

Voeg onderaan `src/lib/planning.test.ts` toe, en breid de importregel bovenaan uit naar
`import { projectBar, unplannedProjects, validateDateRange, groupByCustomer, timelineWindow, barGeometry, todayOffsetPct } from "./planning";`:

```ts
const vandaag = new Date(2026, 8, 15); // 15-SEP-2026

describe("timelineWindow", () => {
  it("spans everything that gets drawn, with seven days of margin", () => {
    const venster = timelineWindow([
      { id: "p1", name: "A", plannedStart: "2026-09-01", plannedEnd: "2026-09-30", tasks: [] },
    ], vandaag);
    expect(venster.start).toEqual(new Date("2026-08-25"));
    expect(venster.end).toEqual(new Date("2026-10-07"));
  });

  it("stretches for a task that falls outside its own project's dates", () => {
    // Dat mag: het is juist de zichtbare waarschuwing dat de planning niet
    // klopt. Dan moet die taak wel in beeld blijven.
    const venster = timelineWindow([
      {
        id: "p1", name: "A", plannedStart: "2026-09-01", plannedEnd: "2026-09-30",
        tasks: [{ id: "t1", name: "uitloop", startDate: "2026-10-20", endDate: "2026-11-05", sortOrder: 0 }],
      },
    ], vandaag);
    expect(venster.end).toEqual(new Date("2026-11-12"));
  });

  it("falls back to a window around today when nothing is planned at all", () => {
    const venster = timelineWindow([{ id: "p1", name: "Intern", tasks: [] }], vandaag);
    expect(venster.start).toEqual(new Date(2026, 7, 16)); // 30 dagen terug
    expect(venster.end).toEqual(new Date(2026, 11, 14)); // 90 dagen vooruit
  });

  it("does the same for no projects at all", () => {
    expect(timelineWindow([], vandaag).start).toEqual(new Date(2026, 7, 16));
  });
});

describe("barGeometry", () => {
  const venster = { start: new Date("2026-09-01"), end: new Date("2026-09-10") }; // 10 dagen

  it("puts a bar that fills the whole window at nought and a hundred percent", () => {
    expect(barGeometry("2026-09-01", "2026-09-10", venster)).toEqual({ leftPct: 0, widthPct: 100 });
  });

  it("gives a one-day task a width of one day, not zero", () => {
    // Dit is waarom de einddatum inclusief is: zonder de +1 verdwijnt een taak
    // van één dag volledig uit beeld.
    expect(barGeometry("2026-09-01", "2026-09-01", venster)).toEqual({ leftPct: 0, widthPct: 10 });
  });

  it("shifts a bar that starts later", () => {
    expect(barGeometry("2026-09-06", "2026-09-10", venster)).toEqual({ leftPct: 50, widthPct: 50 });
  });
});

describe("todayOffsetPct", () => {
  it("gives the position of today inside the window", () => {
    const venster = { start: new Date("2026-09-01"), end: new Date("2026-09-10") };
    expect(todayOffsetPct(new Date("2026-09-06"), venster)).toBe(50);
  });

  it("gives null when today falls outside the window, so no line is drawn", () => {
    const venster = { start: new Date("2026-09-01"), end: new Date("2026-09-10") };
    expect(todayOffsetPct(new Date("2026-08-31"), venster)).toBeNull();
    expect(todayOffsetPct(new Date("2026-09-11"), venster)).toBeNull();
  });
});
```

- [ ] **Step 2: Draai de tests en zie ze falen**

```bash
PATH="$HOME/.nvm/versions/node/v20.20.1/bin:$PATH" npx vitest run src/lib/planning.test.ts
```

Verwacht: FAIL, "timelineWindow is not a function" of een importfout.

- [ ] **Step 3: Breid `src/lib/planning.ts` uit**

Wijzig de importregel bovenaan naar:

```ts
import { addDays, differenceInCalendarDays, max, min } from "date-fns";
```

en zet dit onderaan het bestand:

```ts
/** Lucht links en rechts van het geplande werk, zodat balken niet tegen de rand plakken. */
const VENSTER_MARGE_DAGEN = 7;
/** Het venster als er nog niets gepland is: genoeg verleden om te zien wat liep, genoeg toekomst om in te plannen. */
const LEEG_VENSTER_TERUG = 30;
const LEEG_VENSTER_VOORUIT = 90;

/**
 * Het venster dat de tijdlijn beslaat.
 *
 * Neemt projectbalken én taakdatums mee. Een taak mag buiten de datums van
 * zijn eigen project vallen — dat is toegestaan en juist de waarschuwing dat de
 * planning niet klopt — en dan moet die taak wel zichtbaar blijven.
 */
export function timelineWindow(projects: PlanningProject[], vandaag: Date): DateRange {
  const datums: Date[] = [];
  for (const project of projects) {
    const bar = projectBar(project);
    if (bar) datums.push(bar.start, bar.end);
    for (const taak of project.tasks) {
      datums.push(new Date(taak.startDate), new Date(taak.endDate));
    }
  }

  if (datums.length === 0) {
    return {
      start: addDays(vandaag, -LEEG_VENSTER_TERUG),
      end: addDays(vandaag, LEEG_VENSTER_VOORUIT),
    };
  }

  return {
    start: addDays(min(datums), -VENSTER_MARGE_DAGEN),
    end: addDays(max(datums), VENSTER_MARGE_DAGEN),
  };
}

/** Plek en breedte van een balk, als percentage van het venster. */
export type BarGeometry = { leftPct: number; widthPct: number };

/**
 * Waar een balk in het venster staat.
 *
 * Alles telt in hele dagen en einddatums zijn inclusief, vandaar de `+ 1` op
 * beide lengtes: zonder die op de duur krijgt een taak van één dag breedte nul
 * en verdwijnt hij uit beeld.
 */
export function barGeometry(
  start: string | Date,
  end: string | Date,
  venster: DateRange,
): BarGeometry {
  const vensterDagen = differenceInCalendarDays(venster.end, venster.start) + 1;
  const vanaf = differenceInCalendarDays(new Date(start), venster.start);
  const duur = differenceInCalendarDays(new Date(end), new Date(start)) + 1;
  return {
    leftPct: (vanaf / vensterDagen) * 100,
    widthPct: (duur / vensterDagen) * 100,
  };
}

/**
 * De plek van de vandaag-streep, of `null` als vandaag buiten het venster valt.
 * Dat gebeurt echt: plan je alleen werk voor volgend jaar, dan hoort er geen
 * streep te staan in plaats van eentje tegen de rand geplakt.
 */
export function todayOffsetPct(vandaag: Date, venster: DateRange): number | null {
  if (vandaag < venster.start || vandaag > venster.end) return null;
  const vensterDagen = differenceInCalendarDays(venster.end, venster.start) + 1;
  return (differenceInCalendarDays(vandaag, venster.start) / vensterDagen) * 100;
}
```

- [ ] **Step 4: Draai de tests en zie ze slagen**

```bash
PATH="$HOME/.nvm/versions/node/v20.20.1/bin:$PATH" npx vitest run src/lib/planning.test.ts
```

Verwacht: PASS, 23 tests (14 uit taak 2 plus 9 nieuwe).

- [ ] **Step 5: Commit**

```bash
git add src/lib/planning.ts src/lib/planning.test.ts
git commit -m "feat: venster en balkgeometrie voor de projecttijdlijn"
```

---

### Task 4: Recht om te plannen

**Files:**
- Modify: `src/lib/roles.ts`
- Modify: `src/lib/roles.test.ts`

**Interfaces:**
- Consumes: niets.
- Produces: `canManagePlanning(role: string): boolean`, en `managePlanning` in het `can`-blok van alle vier de rollen.

- [ ] **Step 1: Schrijf de falende test**

Voeg onderaan `src/lib/roles.test.ts` toe, en zet `canManagePlanning` erbij in de importregel bovenaan:

```ts
describe("canManagePlanning", () => {
  it("only lets an admin plan", () => {
    expect(canManagePlanning("ADMIN")).toBe(true);
    expect(canManagePlanning("FINANCE")).toBe(false);
    expect(canManagePlanning("TEAMLEAD")).toBe(false);
    expect(canManagePlanning("EMPLOYEE")).toBe(false);
  });

  it("says no to an unknown role instead of throwing", () => {
    expect(canManagePlanning("ONBEKEND")).toBe(false);
  });
});
```

- [ ] **Step 2: Draai de test en zie hem falen**

```bash
PATH="$HOME/.nvm/versions/node/v20.20.1/bin:$PATH" npx vitest run src/lib/roles.test.ts
```

Verwacht: FAIL, "canManagePlanning is not exported".

- [ ] **Step 3: Voeg de mogelijkheid en de helper toe**

In `src/lib/roles.ts`: zet in het `can`-blok van **ADMIN** `managePlanning: true,` direct onder `leadStandup: true,`. Zet in het `can`-blok van **FINANCE**, **TEAMLEAD** en **EMPLOYEE** `managePlanning: false,` op dezelfde plek. Zo blijft het bestand een volledige matrix, wat het commentaar bovenaan belooft.

Zet de helper bij de andere, onder `canLeadStandup`:

```ts
export function canManagePlanning(role: string): boolean {
  return role === "ADMIN";
}
```

- [ ] **Step 4: Draai de tests en zie ze slagen**

```bash
PATH="$HOME/.nvm/versions/node/v20.20.1/bin:$PATH" npx vitest run src/lib/roles.test.ts
```

Verwacht: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/roles.ts src/lib/roles.test.ts
git commit -m "feat: recht om de planning te beheren, alleen voor beheerders"
```

---

### Task 5: Geplande datums via de bestaande project-PUT

**Files:**
- Modify: `src/app/api/projects/[id]/route.ts`

**Interfaces:**
- Consumes: `validateDateRange` uit taak 2.
- Produces: `PUT /api/projects/[id]` accepteert `plannedStart` en `plannedEnd` als `string | null`, en weigert een half bereik of een omgekeerd bereik met 400.

- [ ] **Step 1: Breid het zod-schema uit**

In `src/app/api/projects/[id]/route.ts`, in `const schema = z.object({ ... })`, direct onder `billable`:

```ts
  // Los van elkaar optioneel in het schema, maar samen gecontroleerd: één losse
  // datum levert geen balk op de tijdlijn op. Zie validateDateRange.
  plannedStart: z.string().optional().nullable(),
  plannedEnd: z.string().optional().nullable(),
```

- [ ] **Step 2: Controleer het bereik vóór het wegschrijven**

Voeg de import toe bovenaan:

```ts
import { validateDateRange } from "@/lib/planning";
```

En zet in `PUT`, direct ná de regel `const nameError = await projectNameTakenError(rest.name, id);` en de bijbehorende afhandeling daarvan, deze controle:

```ts
    const datumFout = validateDateRange(plannedStart, plannedEnd);
    if (datumFout) return NextResponse.json({ error: datumFout }, { status: 400 });
```

(De namen `plannedStart` en `plannedEnd` bestaan pas na stap 3; zet stap 3 eerst als je liever in één keer typt.)

- [ ] **Step 3: Schrijf de datums weg**

De PUT bouwt zijn `data` uit `...rest`. Laat de twee datums daar **niet** in zitten: ze komen als string binnen en Prisma verwacht bij een `@db.Date`-kolom een `Date`. Licht ze eruit bij het uitpakken — verander

```ts
    const { tags, levelRates, memberIds, ...rest } = schema.parse(await req.json());
```

in

```ts
    const { tags, levelRates, memberIds, plannedStart, plannedEnd, ...rest } = schema.parse(await req.json());
```

en pas dan de controle uit stap 2 aan naar `validateDateRange(plannedStart, plannedEnd)`. Voeg in het `update`-aanroep, ná de spread van `rest`, toe:

```ts
        ...(plannedStart !== undefined
          ? { plannedStart: plannedStart ? new Date(plannedStart) : null }
          : {}),
        ...(plannedEnd !== undefined
          ? { plannedEnd: plannedEnd ? new Date(plannedEnd) : null }
          : {}),
```

Het onderscheid tussen "niet meegestuurd" en "meegestuurd als leeg" is dragend: het projectformulier op `/projects` stuurt deze velden niet mee en mag de planning dus niet wissen, terwijl het planningsscherm ze bewust op `null` zet om de balk weer de taken te laten volgen.

- [ ] **Step 4: Controleer types en build**

```bash
npx tsc --noEmit
```

Verwacht: geen uitvoer.

- [ ] **Step 5: Draai de volledige testsuite**

```bash
PATH="$HOME/.nvm/versions/node/v20.20.1/bin:$PATH" npx vitest run
```

Verwacht: alles groen, geen nieuwe tests.

- [ ] **Step 6: Commit**

```bash
git add src/app/api/projects/[id]/route.ts
git commit -m "feat: geplande datums opslaan via de bestaande project-route"
```

---

### Task 6: Taak aanmaken

**Files:**
- Create: `src/app/api/projects/[id]/tasks/route.ts`

**Interfaces:**
- Consumes: `validateDateRange` uit taak 2, `canManagePlanning` uit taak 4, `handleError` uit `src/lib/api.ts`.
- Produces: `POST /api/projects/[id]/tasks` met body `{ name: string; startDate: string; endDate: string }`, antwoord 201 met de aangemaakte taak.

- [ ] **Step 1: Schrijf de route**

```ts
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { z } from "zod";
import { canManagePlanning } from "@/lib/roles";
import { handleError } from "@/lib/api";
import { validateDateRange } from "@/lib/planning";

const schema = z.object({
  name: z.string().trim().min(1),
  // Verplicht, anders van beide: een taak zonder datums kun je niet tekenen.
  startDate: z.string().min(1),
  endDate: z.string().min(1),
});

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await auth();
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const role = (session.user as any)?.role ?? "EMPLOYEE";
    if (!canManagePlanning(role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const { id } = await params;
    const data = schema.parse(await req.json());

    const datumFout = validateDateRange(data.startDate, data.endDate);
    if (datumFout) return NextResponse.json({ error: datumFout }, { status: 400 });

    const project = await prisma.project.findUnique({ where: { id }, select: { id: true } });
    if (!project) return NextResponse.json({ error: "Not found" }, { status: 404 });

    // Achteraan in de lijst. De hoogste bestaande waarde opzoeken in plaats van
    // tellen, want na een samenvoeging kunnen twee reeksen sortOrder door
    // elkaar lopen en zou tellen een botsing opleveren.
    const laatste = await prisma.projectTask.findFirst({
      where: { projectId: id },
      orderBy: { sortOrder: "desc" },
      select: { sortOrder: true },
    });

    const taak = await prisma.projectTask.create({
      data: {
        projectId: id,
        name: data.name,
        startDate: new Date(data.startDate),
        endDate: new Date(data.endDate),
        sortOrder: (laatste?.sortOrder ?? -1) + 1,
      },
    });

    return NextResponse.json(taak, { status: 201 });
  } catch (e) { return handleError(e); }
}
```

- [ ] **Step 2: Controleer types**

```bash
npx tsc --noEmit
```

Verwacht: geen uitvoer.

- [ ] **Step 3: Controleer dat de route in de build verschijnt**

```bash
DATABASE_URL="postgresql://x:x@localhost:5432/x" PATH="$HOME/.nvm/versions/node/v20.20.1/bin:$PATH" npm run build
```

Verwacht: exitcode 0, en in het routeoverzicht een regel `/api/projects/[id]/tasks`.

- [ ] **Step 4: Commit**

```bash
git add src/app/api/projects/[id]/tasks/route.ts
git commit -m "feat: taak aanmaken onder een project"
```

---

### Task 7: Taak wijzigen, verplaatsen en verwijderen

**Files:**
- Create: `src/app/api/project-tasks/[id]/route.ts`
- Modify: `src/lib/planning.ts`
- Modify: `src/lib/planning.test.ts`

**Interfaces:**
- Consumes: `validateDateRange` uit taak 2, `canManagePlanning` uit taak 4.
- Produces:
  - `swapOrder(taken: { id: string; sortOrder: number }[], id: string, richting: "up" | "down"): { id: string; sortOrder: number }[]` — de volledige nieuwe nummering, of een lege lijst als er niets te verplaatsen valt.
  - `PUT /api/project-tasks/[id]` met `{ name, startDate, endDate }`.
  - `PATCH /api/project-tasks/[id]` met `{ move: "up" | "down" }`.
  - `DELETE /api/project-tasks/[id]`.

- [ ] **Step 1: Schrijf de falende tests voor `swapOrder`**

Voeg onderaan `src/lib/planning.test.ts` toe, en zet `swapOrder` erbij in de importregel bovenaan:

```ts
describe("swapOrder", () => {
  const taken = [
    { id: "a", sortOrder: 0 },
    { id: "b", sortOrder: 1 },
    { id: "c", sortOrder: 2 },
  ];

  it("moves a task up and renumbers the whole list", () => {
    expect(swapOrder(taken, "b", "up")).toEqual([
      { id: "b", sortOrder: 0 },
      { id: "a", sortOrder: 1 },
      { id: "c", sortOrder: 2 },
    ]);
  });

  it("moves a task down", () => {
    expect(swapOrder(taken, "b", "down")).toEqual([
      { id: "a", sortOrder: 0 },
      { id: "c", sortOrder: 1 },
      { id: "b", sortOrder: 2 },
    ]);
  });

  it("does nothing at the edges instead of failing", () => {
    expect(swapOrder(taken, "a", "up")).toEqual([]);
    expect(swapOrder(taken, "c", "down")).toEqual([]);
  });

  it("does nothing for a task that is not in the list", () => {
    expect(swapOrder(taken, "onbekend", "up")).toEqual([]);
  });

  it("still works when the order numbers collide or are all zero", () => {
    // Dat gebeurt na een samenvoeging: twee reeksen sortOrder lopen door
    // elkaar. Hernummeren van de hele lijst maakt dat vanzelf weer heel.
    const rommelig = [
      { id: "a", sortOrder: 0 },
      { id: "b", sortOrder: 0 },
      { id: "c", sortOrder: 0 },
    ];
    expect(swapOrder(rommelig, "c", "up")).toEqual([
      { id: "a", sortOrder: 0 },
      { id: "c", sortOrder: 1 },
      { id: "b", sortOrder: 2 },
    ]);
  });
});
```

- [ ] **Step 2: Draai de tests en zie ze falen**

```bash
PATH="$HOME/.nvm/versions/node/v20.20.1/bin:$PATH" npx vitest run src/lib/planning.test.ts
```

Verwacht: FAIL, "swapOrder is not a function".

- [ ] **Step 3: Voeg `swapOrder` toe onderaan `src/lib/planning.ts`**

```ts
export type OrderedTask = { id: string; sortOrder: number };

/**
 * Wisselt een taak met zijn buur en nummert de hele lijst opnieuw van nul af.
 *
 * Hernummeren in plaats van alleen twee waarden omruilen, omdat de nummering
 * niet te vertrouwen is: na een samenvoeging lopen twee reeksen door elkaar en
 * kunnen taken dezelfde `sortOrder` delen. Omruilen zou dan niets doen.
 *
 * Een lege lijst betekent "er valt niets te verplaatsen" — de taak staat al
 * boven- of onderaan, of bestaat niet.
 */
export function swapOrder(
  taken: OrderedTask[],
  id: string,
  richting: "up" | "down",
): OrderedTask[] {
  // Op id als tweede sleutel, zodat gelijke nummers toch een vaste volgorde
  // hebben en het resultaat voorspelbaar is.
  const gesorteerd = [...taken].sort(
    (a, b) => a.sortOrder - b.sortOrder || a.id.localeCompare(b.id),
  );

  const van = gesorteerd.findIndex((t) => t.id === id);
  if (van === -1) return [];
  const naar = richting === "up" ? van - 1 : van + 1;
  if (naar < 0 || naar >= gesorteerd.length) return [];

  const nieuw = [...gesorteerd];
  [nieuw[van], nieuw[naar]] = [nieuw[naar], nieuw[van]];
  return nieuw.map((t, index) => ({ id: t.id, sortOrder: index }));
}
```

- [ ] **Step 4: Draai de tests en zie ze slagen**

```bash
PATH="$HOME/.nvm/versions/node/v20.20.1/bin:$PATH" npx vitest run src/lib/planning.test.ts
```

Verwacht: PASS, 28 tests (23 uit taken 2 en 3 plus 5 nieuwe).

- [ ] **Step 5: Schrijf de route**

Maak `src/app/api/project-tasks/[id]/route.ts`:

```ts
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { z } from "zod";
import { canManagePlanning } from "@/lib/roles";
import { handleError } from "@/lib/api";
import { validateDateRange, swapOrder } from "@/lib/planning";

const updateSchema = z.object({
  name: z.string().trim().min(1),
  startDate: z.string().min(1),
  endDate: z.string().min(1),
});

const moveSchema = z.object({ move: z.enum(["up", "down"]) });

/** Ingelogd, beheerder, en de taak bestaat. Geeft de taak terug of een antwoord om te retourneren. */
async function taakOfFout(id: string) {
  const session = await auth();
  if (!session) return { fout: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  const role = (session.user as any)?.role ?? "EMPLOYEE";
  if (!canManagePlanning(role)) return { fout: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };

  const taak = await prisma.projectTask.findUnique({ where: { id } });
  if (!taak) return { fout: NextResponse.json({ error: "Not found" }, { status: 404 }) };
  return { taak };
}

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const { taak, fout } = await taakOfFout(id);
    if (fout) return fout;

    const data = updateSchema.parse(await req.json());
    const datumFout = validateDateRange(data.startDate, data.endDate);
    if (datumFout) return NextResponse.json({ error: datumFout }, { status: 400 });

    const bijgewerkt = await prisma.projectTask.update({
      where: { id: taak!.id },
      data: {
        name: data.name,
        startDate: new Date(data.startDate),
        endDate: new Date(data.endDate),
      },
    });
    return NextResponse.json(bijgewerkt);
  } catch (e) { return handleError(e); }
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const { taak, fout } = await taakOfFout(id);
    if (fout) return fout;

    const { move } = moveSchema.parse(await req.json());

    const broertjes = await prisma.projectTask.findMany({
      where: { projectId: taak!.projectId },
      select: { id: true, sortOrder: true },
    });

    const nieuweVolgorde = swapOrder(broertjes, id, move);
    // Leeg betekent: staat al boven- of onderaan. Geen fout, gewoon niets doen.
    if (nieuweVolgorde.length === 0) return NextResponse.json({ moved: false });

    // In één transactie, anders kan een halve hernummering achterblijven en
    // staan er twee taken op dezelfde plek.
    await prisma.$transaction(
      nieuweVolgorde.map((t) =>
        prisma.projectTask.update({ where: { id: t.id }, data: { sortOrder: t.sortOrder } }),
      ),
    );
    return NextResponse.json({ moved: true });
  } catch (e) { return handleError(e); }
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const { taak, fout } = await taakOfFout(id);
    if (fout) return fout;

    await prisma.projectTask.delete({ where: { id: taak!.id } });
    return NextResponse.json({ success: true });
  } catch (e) { return handleError(e); }
}
```

- [ ] **Step 6: Controleer types en build**

```bash
npx tsc --noEmit
```

Verwacht: geen uitvoer.

```bash
DATABASE_URL="postgresql://x:x@localhost:5432/x" PATH="$HOME/.nvm/versions/node/v20.20.1/bin:$PATH" npm run build
```

Verwacht: exitcode 0, en `/api/project-tasks/[id]` in het routeoverzicht.

- [ ] **Step 7: Commit**

```bash
git add src/app/api/project-tasks src/lib/planning.ts src/lib/planning.test.ts
git commit -m "feat: taak wijzigen, verplaatsen en verwijderen"
```

---

### Task 8: Taken verhuizen mee bij het samenvoegen van projecten

**Files:**
- Modify: `src/app/api/projects/[id]/merge/route.ts`

**Interfaces:**
- Consumes: model `ProjectTask` uit taak 1.
- Produces: geen nieuwe export. Het antwoord van de merge krijgt er één veld bij: `tasks: number`.

- [ ] **Step 1: Verhuis de taken binnen de bestaande transactie**

In `src/app/api/projects/[id]/merge/route.ts`, in `prisma.$transaction`, direct ná de `kmTemplate.updateMany` en vóór de `expense.updateMany`:

```ts
      // Taken zijn planning, geen prijsafspraak: ze horen bij de dingen die
      // meeverhuizen (uren, ritten, sjablonen, deelnemers) en niet bij de
      // dingen die stilletjes verdwijnen (tarieven, tags). Zonder deze regel
      // neemt de cascade op het verwijderen van de bron ze mee het graf in.
      //
      // De sortOrder van bron en doel lopen daarna door elkaar. Dat is
      // aanvaardbaar: alle taken staan er, en swapOrder hernummert de hele
      // lijst zodra je er één verplaatst.
      const taken = await tx.projectTask.updateMany({
        where: { projectId: id },
        data: { projectId: targetId },
      });
```

- [ ] **Step 2: Neem het aantal op in het antwoord**

In hetzelfde bestand, in het `return`-object onderaan de transactie, tussen `kmTemplates` en `expenses`:

```ts
        tasks: taken.count,
```

- [ ] **Step 3: Werk het commentaarblok boven de transactie bij**

Dat blok somt op wat wel en niet meeverhuist en noemt expliciet dat `ProjectLevelRate` en de tags-koppeling stilletjes verdwijnen. Vul de zin over `ProjectMember` aan zodat `ProjectTask` er ook in staat — een lezer die dat blok vertrouwt, moet het complete plaatje krijgen:

```
    // Dat zijn de vier registratiemodellen. ProjectMember wordt hieronder
    // eerst gekopieerd naar het doel en verdwijnt daarna vanzelf mee met het
    // verwijderen van de bron (Cascade); ProjectTask wordt verplaatst, want
    // planning hoort bij het werk en niet bij de prijsafspraken. Twee andere
    // relaties op Project zijn ook Cascade en gaan bewust NIET mee:
```

- [ ] **Step 4: Controleer types**

```bash
npx tsc --noEmit
```

Verwacht: geen uitvoer.

- [ ] **Step 5: Toon aan dat het werkt, tegen de echte database**

Dit project heeft geen integratietests, dus de verificatie is een leesscript. Maak `tmp-taken.ts` in de repo-root (niet in een tijdelijke map — `@prisma/client` resolvet daar niet):

```ts
import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();
async function main() {
  const perProject = await prisma.projectTask.groupBy({
    by: ["projectId"],
    _count: { _all: true },
  });
  console.log("taken per project:", perProject);
  console.log("totaal taken:", await prisma.projectTask.count());
  await prisma.$disconnect();
}
main();
```

```bash
DATABASE_URL="$(grep -m1 '^DATABASE_URL=' .env.local | cut -d'"' -f2)" PATH="$HOME/.nvm/versions/node/v20.20.1/bin:$PATH" npx tsx ./tmp-taken.ts
```

Noteer het totaal. Zijn er nog geen taken (waarschijnlijk, want het scherm bestaat nog niet), meld dat dan als bevinding: de verhuizing is dan pas na taak 10 met echte gegevens aan te tonen, en dat hoort in het eindverslag te staan in plaats van stilzwijgend te worden overgeslagen. **Verwijder het script daarna:**

```bash
rm -f tmp-taken.ts
```

- [ ] **Step 6: Commit**

```bash
git add src/app/api/projects/[id]/merge/route.ts
git commit -m "fix: taken verhuizen mee bij het samenvoegen van projecten"
```

---

### Task 9: De tijdlijn tonen

**Files:**
- Create: `src/app/(app)/planning/page.tsx`
- Create: `src/components/planning/planning-client.tsx`
- Modify: `src/components/layout/sidebar.tsx`

**Interfaces:**
- Consumes: `groupByCustomer`, `projectBar`, `unplannedProjects`, `timelineWindow`, `barGeometry`, `todayOffsetPct`, `PlanningProject` uit taken 2 en 3; `canManagePlanning` uit taak 4; `formatDate` uit `src/lib/utils.ts`; `serialize` uit `src/lib/utils.ts`.
- Produces: `PlanningClient({ projects }: { projects: PlanningProject[] })`. Taak 10 breidt dit component uit met invoer.

- [ ] **Step 1: Schrijf de server-component**

Maak `src/app/(app)/planning/page.tsx`:

```tsx
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { serialize } from "@/lib/utils";
import { canManagePlanning } from "@/lib/roles";
import { PlanningClient } from "@/components/planning/planning-client";

export default async function PlanningPage() {
  const session = await auth();
  if (!canManagePlanning((session?.user as any)?.role ?? "EMPLOYEE")) redirect("/");

  const projects = await prisma.project.findMany({
    where: { archivedAt: null, status: "ACTIVE" },
    select: {
      id: true,
      name: true,
      plannedStart: true,
      plannedEnd: true,
      customer: { select: { name: true } },
      tasks: {
        orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
        select: { id: true, name: true, startDate: true, endDate: true, sortOrder: true },
      },
    },
  });

  return <PlanningClient projects={serialize(projects)} />;
}
```

- [ ] **Step 2: Schrijf het tijdlijncomponent**

Maak `src/components/planning/planning-client.tsx`:

```tsx
"use client";
import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ChevronDown, ChevronRight } from "lucide-react";
import { differenceInCalendarDays } from "date-fns";
import { formatDate } from "@/lib/utils";
import {
  groupByCustomer, projectBar, unplannedProjects, timelineWindow,
  barGeometry, todayOffsetPct, type PlanningProject,
} from "@/lib/planning";

/**
 * Pixels per dag per zoomstand. Alleen de totale breedte verandert; de plaatsing
 * blijft percentueel, dus de rekenkunde hoeft niets van de zoom te weten.
 */
const ZOOM = {
  weken: { label: "Weken", pxPerDag: 24 },
  maanden: { label: "Maanden", pxPerDag: 6 },
  kwartalen: { label: "Kwartalen", pxPerDag: 2 },
} as const;
type ZoomStand = keyof typeof ZOOM;

const NAAMKOLOM_PX = 224;

export function PlanningClient({ projects }: { projects: PlanningProject[] }) {
  const [zoom, setZoom] = useState<ZoomStand>("maanden");
  const [open, setOpen] = useState<Record<string, boolean>>({});

  const vandaag = new Date();
  const venster = timelineWindow(projects, vandaag);
  // Via date-fns en niet via milliseconden: bij de overgang naar wintertijd
  // duurt een dag hier 25 uur en telt een deling door 86.400.000 verkeerd.
  const dagen = differenceInCalendarDays(venster.end, venster.start) + 1;
  const breedte = dagen * ZOOM[zoom].pxPerDag;
  const vandaagPct = todayOffsetPct(vandaag, venster);

  const groepen = groupByCustomer(projects.filter((p) => projectBar(p) !== null));
  const ongepland = unplannedProjects(projects);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <h1 className="text-2xl font-bold">Tijdlijn</h1>
        <div className="flex gap-1">
          {(Object.keys(ZOOM) as ZoomStand[]).map((stand) => (
            <Button
              key={stand}
              size="sm"
              variant={zoom === stand ? "default" : "outline"}
              onClick={() => setZoom(stand)}
            >
              {ZOOM[stand].label}
            </Button>
          ))}
        </div>
      </div>

      <Card>
        <CardContent className="p-0 overflow-x-auto">
          <div className="relative" style={{ minWidth: NAAMKOLOM_PX + breedte }}>
            {vandaagPct !== null && (
              <div
                className="absolute top-0 bottom-0 w-px bg-destructive/70 z-10"
                style={{ left: NAAMKOLOM_PX + (vandaagPct / 100) * breedte }}
                title={`Vandaag — ${formatDate(vandaag)}`}
              />
            )}

            {groepen.map((groep) => (
              <div key={groep.customerName}>
                <div className="px-3 py-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground bg-muted/50">
                  {groep.customerName}
                </div>
                {groep.projects.map((project) => {
                  const bar = projectBar(project)!;
                  const geo = barGeometry(bar.start, bar.end, venster);
                  const uitgeklapt = open[project.id] ?? false;
                  return (
                    <div key={project.id}>
                      <div className="flex items-stretch border-b">
                        <button
                          type="button"
                          className="flex items-center gap-1 shrink-0 px-3 py-2 text-sm text-left hover:bg-muted/50"
                          style={{ width: NAAMKOLOM_PX }}
                          onClick={() => setOpen((o) => ({ ...o, [project.id]: !uitgeklapt }))}
                        >
                          {project.tasks.length > 0
                            ? (uitgeklapt ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />)
                            : <span className="w-3.5" />}
                          <span className="truncate">{project.name}</span>
                        </button>
                        <div className="relative flex-1 py-2" style={{ width: breedte }}>
                          <div
                            className="absolute h-4 rounded bg-primary"
                            style={{ left: `${geo.leftPct}%`, width: `${geo.widthPct}%` }}
                            title={`${project.name} — ${formatDate(bar.start)} t/m ${formatDate(bar.end)}`}
                          />
                        </div>
                      </div>

                      {uitgeklapt && project.tasks.map((taak) => {
                        const tGeo = barGeometry(taak.startDate, taak.endDate, venster);
                        return (
                          <div key={taak.id} className="flex items-stretch border-b bg-muted/20">
                            <div
                              className="shrink-0 px-3 py-1.5 pl-8 text-sm text-muted-foreground truncate"
                              style={{ width: NAAMKOLOM_PX }}
                            >
                              {taak.name}
                            </div>
                            <div className="relative flex-1 py-1.5" style={{ width: breedte }}>
                              <div
                                className="absolute h-3 rounded bg-primary/50"
                                style={{ left: `${tGeo.leftPct}%`, width: `${tGeo.widthPct}%` }}
                                title={`${taak.name} — ${formatDate(taak.startDate)} t/m ${formatDate(taak.endDate)}`}
                              />
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  );
                })}
              </div>
            ))}

            {groepen.length === 0 && (
              <p className="p-6 text-sm text-muted-foreground">
                Nog niets gepland. Geef hieronder een project een start- en einddatum.
              </p>
            )}
          </div>
        </CardContent>
      </Card>

      {ongepland.length > 0 && (
        <Card>
          <CardHeader><CardTitle className="text-base">Nog niet gepland</CardTitle></CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            {ongepland.map((p) => (
              <span key={p.id} className="rounded border px-2 py-1 text-sm">{p.name}</span>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Zet het menu-item in de zijbalk**

In `src/components/layout/sidebar.tsx`: voeg `GanttChartSquare` toe aan de import uit `lucide-react`, en zet deze groep tussen de groep "Team" en de groep "Personeel":

```tsx
  {
    label: "Planning",
    roles: ["ADMIN"],
    items: [
      { href: "/planning", label: "Tijdlijn", icon: GanttChartSquare },
    ],
  },
```

Bestaat `GanttChartSquare` niet in de geïnstalleerde versie van `lucide-react`, gebruik dan `CalendarRange`. Controleer het met:

```bash
grep -c "GanttChartSquare" node_modules/lucide-react/dist/lucide-react.d.ts
```

- [ ] **Step 4: Controleer types en build**

```bash
npx tsc --noEmit
```

Verwacht: geen uitvoer.

```bash
DATABASE_URL="postgresql://x:x@localhost:5432/x" PATH="$HOME/.nvm/versions/node/v20.20.1/bin:$PATH" npm run build
```

Verwacht: exitcode 0, en `/planning` in het routeoverzicht.

- [ ] **Step 5: Draai de volledige testsuite**

```bash
PATH="$HOME/.nvm/versions/node/v20.20.1/bin:$PATH" npx vitest run
```

Verwacht: alles groen.

- [ ] **Step 6: Commit**

```bash
git add "src/app/(app)/planning" src/components/planning src/components/layout/sidebar.tsx
git commit -m "feat: projecttijdlijn voor beheerders"
```

---

### Task 10: Planning invoeren en bijwerken

**Files:**
- Modify: `src/components/planning/planning-client.tsx`

**Interfaces:**
- Consumes: `PUT /api/projects/[id]` (taak 5), `POST /api/projects/[id]/tasks` (taak 6), `PUT`/`PATCH`/`DELETE` op `/api/project-tasks/[id]` (taak 7).
- Produces: niets voor latere taken. Dit is de laatste.

- [ ] **Step 1: Voeg de vensters en de opslaglogica toe**

Breid `src/components/planning/planning-client.tsx` uit. Zet bovenin de extra imports:

```tsx
import { useRouter } from "next/navigation";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { ChevronUp, Plus, Trash2 } from "lucide-react";
```

En binnen `PlanningClient`, onder de bestaande `useState`-regels:

```tsx
  const router = useRouter();
  const [fout, setFout] = useState("");
  const [bezig, setBezig] = useState(false);
  // Welk venster openstaat. Eén stuk state, want er kan er maar één tegelijk open zijn.
  const [venstertje, setVenstertje] = useState<
    | { soort: "project"; project: PlanningProject }
    | { soort: "taak-nieuw"; project: PlanningProject }
    | { soort: "taak-bewerk"; project: PlanningProject; taak: PlanningProject["tasks"][number] }
    | null
  >(null);
  const [formNaam, setFormNaam] = useState("");
  const [formStart, setFormStart] = useState("");
  const [formEind, setFormEind] = useState("");

  /** ISO voor een <input type="date">; die accepteert niets anders. */
  const isoVoorInvoer = (d: string | Date | null | undefined) =>
    d ? new Date(d).toISOString().slice(0, 10) : "";

  function openProject(project: PlanningProject) {
    setFout("");
    setFormStart(isoVoorInvoer(project.plannedStart));
    setFormEind(isoVoorInvoer(project.plannedEnd));
    setVenstertje({ soort: "project", project });
  }

  function openNieuweTaak(project: PlanningProject) {
    setFout("");
    setFormNaam("");
    setFormStart("");
    setFormEind("");
    setVenstertje({ soort: "taak-nieuw", project });
  }

  function openTaak(project: PlanningProject, taak: PlanningProject["tasks"][number]) {
    setFout("");
    setFormNaam(taak.name);
    setFormStart(isoVoorInvoer(taak.startDate));
    setFormEind(isoVoorInvoer(taak.endDate));
    setVenstertje({ soort: "taak-bewerk", project, taak });
  }

  /** Eén plek voor elke schrijfactie: verstuurt, meldt de fout, en ververst bij succes. */
  async function verstuur(url: string, method: string, body?: unknown) {
    setBezig(true);
    setFout("");
    const res = await fetch(url, {
      method,
      ...(body ? { headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) } : {}),
    });
    setBezig(false);
    if (!res.ok) {
      const payload = await res.json().catch(() => ({}));
      setFout(payload.error ?? "Opslaan mislukt");
      return false;
    }
    setVenstertje(null);
    router.refresh();
    return true;
  }

  async function bewaar() {
    if (!venstertje) return;
    if (venstertje.soort === "project") {
      // De PUT van een project eist naam en status; die sturen we onveranderd mee.
      await verstuur(`/api/projects/${venstertje.project.id}`, "PUT", {
        name: venstertje.project.name,
        status: "ACTIVE",
        plannedStart: formStart || null,
        plannedEnd: formEind || null,
      });
      return;
    }
    if (venstertje.soort === "taak-nieuw") {
      await verstuur(`/api/projects/${venstertje.project.id}/tasks`, "POST", {
        name: formNaam, startDate: formStart, endDate: formEind,
      });
      return;
    }
    await verstuur(`/api/project-tasks/${venstertje.taak.id}`, "PUT", {
      name: formNaam, startDate: formStart, endDate: formEind,
    });
  }

  async function verwijderTaak(taakId: string) {
    if (!confirm("Weet u zeker dat u deze taak wilt verwijderen?")) return;
    await verstuur(`/api/project-tasks/${taakId}`, "DELETE");
  }

  async function verplaats(taakId: string, move: "up" | "down") {
    await verstuur(`/api/project-tasks/${taakId}`, "PATCH", { move });
  }
```

**Let op bij het project-venster:** de PUT van een project eist `name` en `status` en zou zonder die velden een 400 geven. Het planningsscherm toont alleen actieve projecten, dus `"ACTIVE"` is hier correct — maar stuur nooit een andere status mee, want dan verandert dit scherm stilzwijgend de status van het project.

- [ ] **Step 2: Maak de projectnaam en de taken aanklikbaar**

In de projectrij: laat de bestaande knop het uitklappen doen en zet er een tweede knop naast om de datums te bewerken, zodat één klik niet twee dingen betekent. Vervang het `<div className="relative flex-1 py-2" ...>` van een project door:

```tsx
                        <div className="relative flex-1 py-2" style={{ width: breedte }}>
                          <button
                            type="button"
                            className="absolute h-4 rounded bg-primary hover:bg-primary/80"
                            style={{ left: `${geo.leftPct}%`, width: `${geo.widthPct}%`, minWidth: 4 }}
                            title={`${project.name} — ${formatDate(bar.start)} t/m ${formatDate(bar.end)} — klik om te plannen`}
                            onClick={() => openProject(project)}
                          />
                        </div>
```

En zet ná de naamknop van het project, binnen dezelfde rij, een knop om een taak toe te voegen:

```tsx
                        <Button
                          variant="ghost" size="icon" className="h-7 w-7 shrink-0 self-center"
                          title="Taak toevoegen"
                          onClick={() => openNieuweTaak(project)}
                        >
                          <Plus className="h-3.5 w-3.5" />
                        </Button>
```

Trek `NAAMKOLOM_PX` daarvoor op de naamknop met 28 terug (`style={{ width: NAAMKOLOM_PX - 28 }}`), zodat de kolombreedte gelijk blijft en de balken uitgelijnd blijven met de taakrijen eronder.

In de taakrij: maak de naam aanklikbaar en zet de twee pijltjes en de prullenbak erachter:

```tsx
                            <div
                              className="shrink-0 flex items-center gap-0.5 px-3 pl-8 py-1.5 text-sm"
                              style={{ width: NAAMKOLOM_PX }}
                            >
                              <button
                                type="button"
                                className="truncate text-muted-foreground hover:text-foreground text-left flex-1"
                                onClick={() => openTaak(project, taak)}
                                title="Taak bewerken"
                              >
                                {taak.name}
                              </button>
                              <Button variant="ghost" size="icon" className="h-5 w-5" title="Omhoog" disabled={bezig} onClick={() => verplaats(taak.id, "up")}>
                                <ChevronUp className="h-3 w-3" />
                              </Button>
                              <Button variant="ghost" size="icon" className="h-5 w-5" title="Omlaag" disabled={bezig} onClick={() => verplaats(taak.id, "down")}>
                                <ChevronDown className="h-3 w-3" />
                              </Button>
                              <Button variant="ghost" size="icon" className="h-5 w-5" title="Verwijderen" disabled={bezig} onClick={() => verwijderTaak(taak.id)}>
                                <Trash2 className="h-3 w-3" />
                              </Button>
                            </div>
```

- [ ] **Step 3: Maak de ongeplande projecten aanklikbaar**

Vervang in het blok "Nog niet gepland" de `<span>` door een knop, zodat je er meteen datums aan kunt hangen:

```tsx
            {ongepland.map((p) => (
              <Button key={p.id} variant="outline" size="sm" onClick={() => openProject(p)}>
                {p.name}
              </Button>
            ))}
```

- [ ] **Step 4: Zet het venster onderaan het component**

Direct vóór de afsluitende `</div>` van de buitenste `<div className="space-y-6">`:

```tsx
      <Dialog open={venstertje !== null} onOpenChange={(o) => { if (!o) setVenstertje(null); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>
              {venstertje?.soort === "project" ? `Planning van ${venstertje.project.name}`
                : venstertje?.soort === "taak-nieuw" ? "Nieuwe taak"
                : "Taak bewerken"}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-3">
            {venstertje?.soort !== "project" && (
              <div className="space-y-1">
                <Label>Naam</Label>
                <Input value={formNaam} onChange={(e) => setFormNaam(e.target.value)} autoFocus />
              </div>
            )}
            <div className="space-y-1">
              <Label>Start</Label>
              <Input type="date" value={formStart} onChange={(e) => setFormStart(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label>Eind</Label>
              <Input type="date" value={formEind} onChange={(e) => setFormEind(e.target.value)} />
            </div>
            {venstertje?.soort === "project" && (
              <p className="text-xs text-muted-foreground">
                Laat allebei leeg om de balk de taken te laten volgen.
              </p>
            )}
            {fout && <p className="text-sm text-destructive">{fout}</p>}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setVenstertje(null)} disabled={bezig}>Annuleren</Button>
            <Button onClick={bewaar} disabled={bezig}>{bezig ? "Opslaan..." : "Opslaan"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
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

Verwacht: alles groen.

- [ ] **Step 7: Commit**

```bash
git add src/components/planning/planning-client.tsx
git commit -m "feat: planning en taken invoeren vanaf de tijdlijn"
```

---

## Klaar wanneer

- Een beheerder ziet op `/planning` de actieve projecten per klant als balken, met een streep op vandaag en drie zoomstanden.
- Hij kan een project van datums voorzien, taken toevoegen, wijzigen, verwijderen en ordenen, en ziet het resultaat meteen.
- Projecten zonder planning staan onderaan in plaats van nergens.
- Niemand anders dan een beheerder komt bij het scherm of de routes.
- `npx tsc --noEmit` is schoon, `npm run build` geeft exitcode 0 en de volledige vitest-suite is groen.
