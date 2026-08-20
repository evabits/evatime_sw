# Doorlopend urensaldo — Implementatieplan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Een beheerder ziet per medewerker een doorlopend urensaldo dat beide kanten op beweegt, en kan er handmatig een mutatie op doen wanneer uren worden uitbetaald of ingeruild.

**Architecture:** Het saldo wordt uitgerekend, niet opgeslagen. Alleen een beginstand op de medewerker en een tabel met handmatige mutaties komen in de database; de maandsaldi volgen uit de urenregistraties die er al staan. Alle rekenkunde zit als pure functies in `src/lib/overtime.ts` met vitest-dekking.

**Tech Stack:** Next.js 16 (App Router), React 19, Prisma 6 + PostgreSQL (Neon), zod, date-fns, Tailwind, shadcn-componenten uit `src/components/ui`, vitest.

**Spec:** `docs/superpowers/specs/2026-08-20-urensaldo-design.md`

**Wat er al is:**
- `src/lib/payroll.ts` exporteert `weeksInMonth(year, month)` — `dagen ÷ 7`.
- `src/lib/contracts.ts` exporteert `getEffectiveContract(contracten, datum)`; `src/app/api/contracts/route.ts` exporteert `serializeContract` en `contractSelect`.
- `User.vacationOpeningDate` / `vacationOpeningUsed` is het bestaande patroon voor een beginstand, met zod-velden in `src/lib/user-schema.ts` en afhandeling in `src/app/api/users/[id]/route.ts`.
- De medewerkerspagina is `src/app/(app)/personeel/[id]/page.tsx`, met blokken als `ContractsClient`, `CommuteTemplateClient` en `WorkScheduleClient`.

## Global Constraints

- **Lees eerst `AGENTS.md`.** Dit is Next.js 16; conventies wijken af van oudere versies.
- **Datums in de UI altijd `DD-MMM-YYYY`** via `formatDate` uit `src/lib/utils.ts`. `yyyy-MM-dd` is alleen een interne sleutel en de waarde van een `<input type="date">`.
- **Verlof telt mee.** "Geboekte uren" is de som over álle `TimeEntry`-rijen van die maand, werk én verlof. Alleen de loonverwerking filtert op `absenceRequestId: null`; hier niet.
- **Het woord in de kolom is "geboekt", niet "gewerkt"** — er zit verlof in.
- **Alleen `ADMIN`.** Elke nieuwe route weigert zelf via `isAdmin`.
- **Dit project test uitsluitend pure functies** in `src/lib/*.test.ts`. Geen component-, route- of integratietests.
- **Geen nieuwe npm-afhankelijkheden.**
- **Commentaar en foutmeldingen in het Nederlands**, uitleggend *waarom* en niet *wat*.
- **Imports:** binnen `src/lib/` relatief (`./payroll`), in `src/app/` en `src/components/` via de alias (`@/lib/...`). `vitest.config.mts` kent geen alias-resolutie.
- **Route-handlers krijgen `params` als `Promise`.**
- **Node 20 verplicht** voor npm/npx: `PATH="$HOME/.nvm/versions/node/v20.20.1/bin:$PATH" npx vitest run`. Ketens met `&&` worden door de permissielaag geweigerd; bij een losse weigering één keer opnieuw proberen.
- **`npx tsc --noEmit` schoon en `npm run build` exit 0.** De build heeft `DATABASE_URL` nodig maar verbindt niet: `DATABASE_URL="postgresql://x:x@localhost:5432/x" npm run build`.
- **De database in `.env.local` is productie.** Alleen lezen, behalve de ene `db:push` in taak 1.

---

## Bestandsindeling

| Bestand | Verantwoordelijkheid |
|---|---|
| `prisma/schema.prisma` | Twee velden op `User`, model `OvertimeAdjustment`. |
| `src/lib/overtime.ts` | Alle rekenkunde: welke maanden, welke target, de opsomming, de weigeringen. Geen React, geen Prisma. |
| `src/lib/overtime.test.ts` | Tests daarvan. |
| `src/lib/user-schema.ts` | Twee zod-velden voor de beginstand. |
| `src/app/api/users/[id]/route.ts` | Slaat de beginstand op. |
| `src/app/api/users/route.ts` | Geeft de beginstand mee terug. |
| `src/app/api/overtime-adjustments/route.ts` | POST: mutatie toevoegen. |
| `src/app/api/overtime-adjustments/[id]/route.ts` | DELETE: mutatie verwijderen. |
| `src/app/(app)/personeel/[id]/page.tsx` | Haalt uren, contracten en mutaties op en geeft ze door. |
| `src/components/personeel/overtime-client.tsx` | Het blok met de opsomming, de beginstand en de mutaties. |

---

### Task 1: Schema en database

**Files:**
- Modify: `prisma/schema.prisma`

**Interfaces:**
- Produces: `User.overtimeOpeningDate: Date | null`, `User.overtimeOpeningHours: Decimal | null`, `User.overtimeAdjustments: OvertimeAdjustment[]`, en model `OvertimeAdjustment { id, userId, date, hours, reason, createdById, createdAt }`.

- [ ] **Step 1: Voeg de twee velden toe aan `User`**

In `prisma/schema.prisma`, in `model User`, direct ná `vacationOpeningUsed`:

```prisma
  // Beginstand van het urensaldo: vanaf welke datum de app zelf doortelt, en
  // wat er op dat moment al stond. Allebei leeg betekent: geen saldo voor deze
  // medewerker. Zelfde patroon als vacationOpeningDate hierboven, omdat de app
  // pas in mei 2026 in gebruik is genomen en de eerste maanden onvolledig zijn.
  overtimeOpeningDate  DateTime?            @db.Date
  overtimeOpeningHours Decimal?             @db.Decimal(7, 2)
```

En bij de relaties van datzelfde model:

```prisma
  overtimeAdjustments  OvertimeAdjustment[]
```

- [ ] **Step 2: Voeg het model `OvertimeAdjustment` toe**

Zet dit ná het `User`-model:

```prisma
model OvertimeAdjustment {
  id          String   @id @default(cuid())
  userId      String
  user        User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  date        DateTime @db.Date
  // Positief of negatief. Uitbetalen is negatief, inruilen voor een vrije dag
  // ook, en een correctie kan beide kanten op.
  hours       Decimal  @db.Decimal(7, 2)
  // Verplicht: een mutatie zonder uitleg is over een half jaar niet meer te
  // plaatsen. Daarom is een mutatie ook niet te wijzigen, alleen toe te voegen
  // en te verwijderen — zo ontstaan er geen stille correcties op correcties.
  reason      String
  // Wie hem invoerde. Geen relatie, zodat de mutatie blijft staan als die
  // persoon later uit dienst gaat en zijn rij wordt opgeruimd.
  createdById String?
  createdAt   DateTime @default(now())

  @@index([userId, date])
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

Verwacht: twee `ALTER TABLE "User" ADD COLUMN`, één `CREATE TABLE "OvertimeAdjustment"`, één `CREATE INDEX`, één `ADD CONSTRAINT ... FOREIGN KEY`. **Lees de volledige uitvoer.** Staat er ook maar één `DROP` in, stop dan, push niet, en rapporteer BLOCKED met de volledige uitvoer.

- [ ] **Step 5: Push naar de database**

```bash
PATH="$HOME/.nvm/versions/node/v20.20.1/bin:$PATH" npx prisma db push
```

Verwacht: "Your database is now in sync with your Prisma schema". Bij `P1001` (Neon niet bereikbaar) één keer opnieuw proberen.

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
git commit -m "feat: beginstand en handmatige mutaties voor het urensaldo"
```

---

### Task 2: Pure functies — maanden, target en weigeringen

**Files:**
- Create: `src/lib/overtime.ts`
- Create: `src/lib/overtime.test.ts`

**Interfaces:**
- Consumes: `weeksInMonth` uit `./payroll`.
- Produces:
  - `type MonthKey = string` (`"2026-09"`)
  - `monthsToSettle(peildatum: string, vandaag: Date): MonthKey[]`
  - `bucketHoursByMonth(entries: { date: string | Date; hours: number | string }[]): Record<MonthKey, number>`
  - `monthTarget(contracturen: number | null, key: MonthKey): number | null`
  - `validateOpeningDate(datum: string | null | undefined): string | null`

- [ ] **Step 1: Schrijf de falende tests**

Maak `src/lib/overtime.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import {
  monthsToSettle, bucketHoursByMonth, monthTarget, validateOpeningDate,
} from "./overtime";

describe("monthsToSettle", () => {
  it("runs from the opening month up to and including last month", () => {
    // Vandaag is augustus, dus augustus telt niet mee: die maand loopt nog.
    expect(monthsToSettle("2026-05-01", new Date(2026, 7, 20))).toEqual([
      "2026-05", "2026-06", "2026-07",
    ]);
  });

  it("gives nothing when the opening date is in the running month", () => {
    expect(monthsToSettle("2026-08-01", new Date(2026, 7, 20))).toEqual([]);
  });

  it("gives nothing when the opening date is in the future", () => {
    expect(monthsToSettle("2027-01-01", new Date(2026, 7, 20))).toEqual([]);
  });

  it("gives exactly one month when the opening date is last month", () => {
    expect(monthsToSettle("2026-07-01", new Date(2026, 7, 20))).toEqual(["2026-07"]);
  });

  it("crosses the turn of the year", () => {
    expect(monthsToSettle("2025-11-01", new Date(2026, 0, 15))).toEqual(["2025-11", "2025-12"]);
  });
});

describe("bucketHoursByMonth", () => {
  it("adds up the hours per calendar month", () => {
    const entries = [
      { date: "2026-09-01T00:00:00.000Z", hours: 8 },
      { date: "2026-09-30T00:00:00.000Z", hours: 4.5 },
      { date: "2026-10-01T00:00:00.000Z", hours: 8 },
    ];
    expect(bucketHoursByMonth(entries)).toEqual({ "2026-09": 12.5, "2026-10": 8 });
  });

  it("copes with Decimal arriving as a string", () => {
    // Prisma levert Decimal als string aan; optellen zonder Number() plakt ze
    // aan elkaar in plaats van ze op te tellen.
    const entries = [
      { date: "2026-09-01T00:00:00.000Z", hours: "8.00" },
      { date: "2026-09-02T00:00:00.000Z", hours: "0.50" },
    ];
    expect(bucketHoursByMonth(entries)).toEqual({ "2026-09": 8.5 });
  });

  it("gives an empty object for no entries", () => {
    expect(bucketHoursByMonth([])).toEqual({});
  });
});

describe("monthTarget", () => {
  it("multiplies the contract hours by the weeks in that month", () => {
    // Juli heeft 31 dagen: 31 / 7 = 4,4286 weken. 40 × 4,4286 = 177,1.
    expect(monthTarget(40, "2026-07")).toBeCloseTo(177.1, 1);
    // Februari 2026 heeft 28 dagen: precies 4 weken.
    expect(monthTarget(40, "2026-02")).toBeCloseTo(160, 1);
  });

  it("scales with a part-time contract", () => {
    expect(monthTarget(24, "2026-07")).toBeCloseTo(106.3, 1);
  });

  it("gives null without a contract, so the month counts as nothing", () => {
    expect(monthTarget(null, "2026-07")).toBeNull();
  });

  it("gives null for a zero-hours contract", () => {
    // Daar is "target" een leeg begrip; de loonverwerking slaat ze ook over.
    expect(monthTarget(0, "2026-07")).toBeNull();
  });
});

describe("validateOpeningDate", () => {
  it("accepts the first of a month", () => {
    expect(validateOpeningDate("2026-09-01")).toBeNull();
  });

  it("accepts an empty value, which means no balance at all", () => {
    expect(validateOpeningDate(null)).toBeNull();
    expect(validateOpeningDate("")).toBeNull();
    expect(validateOpeningDate(undefined)).toBeNull();
  });

  it("refuses a date halfway through a month, and says why", () => {
    expect(validateOpeningDate("2026-09-15")).toBe(
      "De peildatum moet op de eerste van een maand liggen",
    );
  });
});
```

- [ ] **Step 2: Draai de tests en zie ze falen**

```bash
PATH="$HOME/.nvm/versions/node/v20.20.1/bin:$PATH" npx vitest run src/lib/overtime.test.ts
```

Verwacht: FAIL, "Failed to resolve import ./overtime".

- [ ] **Step 3: Schrijf `src/lib/overtime.ts`**

```ts
import { weeksInMonth } from "./payroll";

/**
 * Het doorlopende urensaldo: welke maanden meetellen, wat de target van een
 * maand is, en hoe de opsomming eruitziet.
 *
 * Het saldo wordt uitgerekend en niet opgeslagen. In deze app worden uren met
 * terugwerkende kracht gecorrigeerd; een vastgelegd maandsaldo van drie maanden
 * terug klopt dan niet meer. Met dertien medewerkers en een handvol maanden is
 * doorrekenen goedkoop.
 *
 * Geen React en geen Prisma, zodat het te testen is zonder database en zonder
 * scherm.
 */

/** Een kalendermaand als `"2026-09"`. */
export type MonthKey = string;

function toKey(jaar: number, maand1: number): MonthKey {
  return `${jaar}-${String(maand1).padStart(2, "0")}`;
}

/**
 * De maanden die meetellen: vanaf de maand van de peildatum tot en met de
 * vórige maand.
 *
 * De lopende maand telt bewust niet mee. Wie halverwege de maand zit heeft nog
 * niet zijn hele target gewerkt en zou anders tot de laatste dag tientallen uren
 * in de min staan.
 */
export function monthsToSettle(peildatum: string, vandaag: Date): MonthKey[] {
  const [jaar, maand] = peildatum.split("-").map(Number);
  const eindJaar = vandaag.getFullYear();
  const eindMaand = vandaag.getMonth() + 1;

  const maanden: MonthKey[] = [];
  let j = jaar;
  let m = maand;
  while (j < eindJaar || (j === eindJaar && m < eindMaand)) {
    maanden.push(toKey(j, m));
    m += 1;
    if (m > 12) {
      m = 1;
      j += 1;
    }
  }
  return maanden;
}

/**
 * De geboekte uren per kalendermaand.
 *
 * "Geboekt" is letterlijk alles wat er in `TimeEntry` staat, werk én verlof:
 * verlof is daar gewoon een urenregel met een verwijzing naar de
 * verlofaanvraag. Zonder verlof zou iedereen die op vakantie gaat een tekort
 * opbouwen van tientallen uren, en meet het saldo vakantie in plaats van
 * overwerk.
 */
export function bucketHoursByMonth(
  entries: { date: string | Date; hours: number | string }[],
): Record<MonthKey, number> {
  const per: Record<MonthKey, number> = {};
  for (const e of entries) {
    const d = new Date(e.date);
    const key = toKey(d.getFullYear(), d.getMonth() + 1);
    // Number() is dragend: Prisma levert Decimal als string, en optellen zonder
    // omzetting plakt ze aan elkaar.
    per[key] = Math.round(((per[key] ?? 0) + Number(e.hours)) * 100) / 100;
  }
  return per;
}

/**
 * De target van één maand: contracturen × weken in die maand.
 *
 * `weeksInMonth` is `dagen ÷ 7`, dezelfde formule die de loonverwerking al
 * gebruikt. Juli komt zo op 4,43 weken uit en niet op 4; over een jaar telt dat
 * op tot 52,14 weken.
 *
 * `null` zonder contract of bij een nul-urencontract: dan is er geen target en
 * telt die maand als niets, niet als tekort.
 */
export function monthTarget(contracturen: number | null, key: MonthKey): number | null {
  if (contracturen == null || contracturen <= 0) return null;
  const [jaar, maand] = key.split("-").map(Number);
  return Math.round(contracturen * weeksInMonth(jaar, maand) * 10) / 10;
}

/**
 * Keurt de peildatum. Nederlandse melding, of `null` als het mag.
 *
 * Hij moet op de eerste van een maand liggen. Anders is die eerste maand half en
 * moet er naar rato gerekend worden — een extra regel die alleen vragen oproept.
 * Leeg mag: dat betekent dat deze medewerker geen saldo heeft.
 */
export function validateOpeningDate(datum: string | null | undefined): string | null {
  if (!datum) return null;
  if (!datum.endsWith("-01")) return "De peildatum moet op de eerste van een maand liggen";
  return null;
}
```

- [ ] **Step 4: Draai de tests en zie ze slagen**

```bash
PATH="$HOME/.nvm/versions/node/v20.20.1/bin:$PATH" npx vitest run src/lib/overtime.test.ts
```

Verwacht: PASS, 15 tests.

- [ ] **Step 5: Commit**

```bash
git add src/lib/overtime.ts src/lib/overtime.test.ts
git commit -m "feat: maanden, target en peildatumcontrole voor het urensaldo"
```

---

### Task 3: Pure functies — de opsomming

**Files:**
- Modify: `src/lib/overtime.ts`
- Modify: `src/lib/overtime.test.ts`

**Interfaces:**
- Consumes: `MonthKey`, `monthTarget` uit taak 2.
- Produces:
  - `type OvertimeAdjustmentLine = { id: string; date: string; hours: number; reason: string }`
  - `type LedgerLine` — een union met `kind: "opening" | "month" | "adjustment"`
  - `overtimeLedger(opts): { lines: LedgerLine[]; saldo: number; lopend: { key: MonthKey; geboekt: number; target: number | null } | null }`

- [ ] **Step 1: Schrijf de falende tests**

Voeg onderaan `src/lib/overtime.test.ts` toe, en breid de importregel bovenaan uit met `overtimeLedger`:

```ts
const mutatie = (id: string, date: string, hours: number, reason: string) => ({ id, date, hours, reason });

describe("overtimeLedger", () => {
  const basis = {
    openingDate: "2026-09-01",
    openingHours: 12,
    months: ["2026-09", "2026-10"],
    hoursByMonth: { "2026-09": 180.4, "2026-10": 174.9 },
    contractHoursByMonth: { "2026-09": 40, "2026-10": 40 },
    adjustments: [],
    vandaag: new Date(2026, 10, 20), // 20-NOV-2026
    lopendeUren: 0,
    lopendContract: 40,
  };

  it("starts with the opening balance", () => {
    const { lines } = overtimeLedger(basis);
    expect(lines[0]).toEqual({ kind: "opening", date: "2026-09-01", hours: 12 });
  });

  it("gives a line per month with booked hours, target and the difference", () => {
    const { lines } = overtimeLedger(basis);
    const sept = lines.find((l) => l.kind === "month" && l.key === "2026-09");
    expect(sept).toMatchObject({ kind: "month", key: "2026-09", geboekt: 180.4 });
    // September heeft 30 dagen: 30/7 = 4,286 weken × 40 = 171,4.
    expect((sept as { target: number }).target).toBeCloseTo(171.4, 1);
    expect((sept as { hours: number }).hours).toBeCloseTo(9, 1);
  });

  it("adds opening, months and adjustments into one balance", () => {
    const met = { ...basis, adjustments: [mutatie("a1", "2026-10-15", -10, "uitbetaald bij salaris")] };
    const { saldo } = overtimeLedger(met);
    // 12 + (180,4 − 171,4) + (174,9 − 177,1) + (−10) = 8,8
    expect(saldo).toBeCloseTo(8.8, 1);
  });

  it("puts an adjustment after the month it falls in", () => {
    const met = { ...basis, adjustments: [mutatie("a1", "2026-10-15", -10, "uitbetaald")] };
    const soorten = overtimeLedger(met).lines.map((l) => `${l.kind}:${"key" in l ? l.key : "date" in l ? l.date : ""}`);
    expect(soorten).toEqual([
      "opening:2026-09-01",
      "month:2026-09",
      "month:2026-10",
      "adjustment:2026-10-15",
    ]);
  });

  it("counts a month without a contract as nothing, not as a shortfall", () => {
    const zonder = {
      ...basis,
      contractHoursByMonth: { "2026-09": 40, "2026-10": null },
      hoursByMonth: { "2026-09": 171.4, "2026-10": 0 },
    };
    const { lines, saldo } = overtimeLedger(zonder);
    const okt = lines.find((l) => l.kind === "month" && l.key === "2026-10") as { target: number | null; hours: number };
    expect(okt.target).toBeNull();
    expect(okt.hours).toBe(0);
    expect(saldo).toBeCloseTo(12, 1);
  });

  it("reports the running month separately, outside the balance", () => {
    const { lopend, saldo } = overtimeLedger({ ...basis, lopendeUren: 120 });
    expect(lopend).toMatchObject({ key: "2026-11", geboekt: 120 });
    // 12 + (180,4 − 171,4) + (174,9 − 177,1) = 18,8. De lopende maand telt niet
    // mee, dus 120 geboekte uren van november veranderen daar niets aan.
    expect(saldo).toBeCloseTo(18.8, 1);
  });

  it("gives no ledger at all without an opening date", () => {
    const { lines, saldo, lopend } = overtimeLedger({ ...basis, openingDate: null, months: [] });
    expect(lines).toEqual([]);
    expect(saldo).toBe(0);
    expect(lopend).toBeNull();
  });

  it("keeps an adjustment dated before the opening, rather than hiding it", () => {
    // Zinloos maar zichtbaar: stilzwijgend weglaten zou een saldo opleveren dat
    // niet klopt met wat er in de database staat.
    const met = { ...basis, adjustments: [mutatie("a1", "2026-08-01", 5, "correctie")] };
    const { lines, saldo } = overtimeLedger(met);
    expect(lines[0]).toMatchObject({ kind: "adjustment", date: "2026-08-01" });
    expect(saldo).toBeCloseTo(23.8, 1); // 18,8 + 5
  });
});
```

- [ ] **Step 2: Draai de tests en zie ze falen**

```bash
PATH="$HOME/.nvm/versions/node/v20.20.1/bin:$PATH" npx vitest run src/lib/overtime.test.ts
```

Verwacht: FAIL, "overtimeLedger is not a function".

- [ ] **Step 3: Breid `src/lib/overtime.ts` uit**

Zet dit onderaan het bestand:

```ts
export type OvertimeAdjustmentLine = {
  id: string;
  date: string;
  hours: number;
  reason: string;
};

/** Eén regel uit de opsomming. `hours` is telkens wat die regel bij het saldo optelt. */
export type LedgerLine =
  | { kind: "opening"; date: string; hours: number }
  | { kind: "month"; key: MonthKey; geboekt: number; target: number | null; hours: number }
  | { kind: "adjustment"; id: string; date: string; hours: number; reason: string };

/** Waarop een regel chronologisch sorteert. */
function sorteerDatum(line: LedgerLine): string {
  // Een maandregel sorteert op de éérste van die maand, zodat een mutatie
  // halverwege oktober ná de oktoberregel komt te staan en niet ervóór.
  if (line.kind === "month") return `${line.key}-01`;
  return line.date;
}

/**
 * De opsomming en het saldo.
 *
 * De lopende maand komt apart terug in `lopend` en telt niet mee in `saldo` —
 * hij is nog niet af, en meerekenen zou iedereen tot de laatste dag van de maand
 * in de min zetten.
 */
export function overtimeLedger(opts: {
  openingDate: string | null;
  openingHours: number;
  months: MonthKey[];
  hoursByMonth: Record<MonthKey, number>;
  contractHoursByMonth: Record<MonthKey, number | null>;
  adjustments: OvertimeAdjustmentLine[];
  vandaag: Date;
  lopendeUren: number;
  lopendContract: number | null;
}): {
  lines: LedgerLine[];
  saldo: number;
  lopend: { key: MonthKey; geboekt: number; target: number | null } | null;
} {
  if (!opts.openingDate) return { lines: [], saldo: 0, lopend: null };

  const lines: LedgerLine[] = [
    { kind: "opening", date: opts.openingDate, hours: opts.openingHours },
  ];

  for (const key of opts.months) {
    const geboekt = opts.hoursByMonth[key] ?? 0;
    const target = monthTarget(opts.contractHoursByMonth[key] ?? null, key);
    lines.push({
      kind: "month",
      key,
      geboekt,
      target,
      // Zonder target telt de maand als niets. Vóór indiensttreding of ná
      // vertrek is er geen doel om tegen af te rekenen.
      hours: target == null ? 0 : Math.round((geboekt - target) * 10) / 10,
    });
  }

  for (const m of opts.adjustments) {
    lines.push({ kind: "adjustment", id: m.id, date: m.date, hours: m.hours, reason: m.reason });
  }

  lines.sort((a, b) => sorteerDatum(a).localeCompare(sorteerDatum(b)));

  const saldo = Math.round(lines.reduce((som, l) => som + l.hours, 0) * 10) / 10;

  const lopendeKey = toKey(opts.vandaag.getFullYear(), opts.vandaag.getMonth() + 1);
  return {
    lines,
    saldo,
    lopend: {
      key: lopendeKey,
      geboekt: opts.lopendeUren,
      target: monthTarget(opts.lopendContract, lopendeKey),
    },
  };
}
```

- [ ] **Step 4: Draai de tests en zie ze slagen**

```bash
PATH="$HOME/.nvm/versions/node/v20.20.1/bin:$PATH" npx vitest run src/lib/overtime.test.ts
```

Verwacht: PASS, 23 tests (15 uit taak 2 plus 8 nieuwe).

- [ ] **Step 5: Commit**

```bash
git add src/lib/overtime.ts src/lib/overtime.test.ts
git commit -m "feat: opsomming en saldo van het urensaldo"
```

---

### Task 4: De beginstand opslaan

**Files:**
- Modify: `src/lib/user-schema.ts`
- Modify: `src/app/api/users/[id]/route.ts`
- Modify: `src/app/api/users/route.ts`

**Interfaces:**
- Consumes: `validateOpeningDate` uit taak 2.
- Produces: `PUT /api/users/[id]` accepteert `overtimeOpeningDate` en `overtimeOpeningHours`; beide routes geven ze terug als `string | null` respectievelijk `number | null`.

- [ ] **Step 1: Voeg de twee zod-velden toe**

In `src/lib/user-schema.ts`, ná `vacationOpeningUsedField`:

```ts
// Peildatum van het urensaldo, als YYYY-MM-DD. Leeg betekent: deze medewerker
// heeft geen saldo. Dat de datum op de eerste van een maand moet liggen wordt
// niet hier gecontroleerd maar met validateOpeningDate — die melding hoort bij
// de rekenkunde en niet bij het formaat.
export const overtimeOpeningDateField = z.preprocess(
  (v) => (v === "" || v == null ? undefined : v),
  z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Datum als jjjj-mm-dd").optional(),
) as z.ZodType<string | undefined>;

// De beginstand in uren. Mag negatief zijn: een medewerker kan met een tekort
// beginnen, anders dan bij de vakantie-uren hierboven.
export const overtimeOpeningHoursField = z.preprocess(
  (v) => (v === "" || v == null ? undefined : v),
  z.coerce.number().optional(),
) as z.ZodType<number | undefined>;
```

- [ ] **Step 2: Neem ze aan in de PUT**

In `src/app/api/users/[id]/route.ts`: voeg de twee velden toe aan de import uit `@/lib/user-schema` en aan het zod-schema, naast `vacationOpeningDate` en `vacationOpeningUsed`:

```ts
  overtimeOpeningDate: overtimeOpeningDateField,
  overtimeOpeningHours: overtimeOpeningHoursField,
```

Voeg de import van de controle toe:

```ts
import { validateOpeningDate } from "@/lib/overtime";
```

En controleer de peildatum vóór het wegschrijven, op dezelfde plek waar de andere controles staan:

```ts
    const peilFout = validateOpeningDate(data.overtimeOpeningDate);
    if (peilFout) return NextResponse.json({ error: peilFout }, { status: 400 });
```

Schrijf ze weg naast de bestaande vakantievelden, met hetzelfde patroon:

```ts
      updateData.overtimeOpeningDate = data.overtimeOpeningDate
        ? new Date(`${data.overtimeOpeningDate}T00:00:00Z`)
        : null;
      updateData.overtimeOpeningHours = data.overtimeOpeningHours ?? null;
```

Die twee regels horen **binnen de bestaande `if (isAdmin) { ... }`-tak**, direct ná `updateData.vacationOpeningUsed`. Daar staat al hetzelfde patroon met dezelfde toelichting over middernacht UTC; sluit erop aan. Alleen een beheerder mag deze velden zetten, en die `if` regelt dat al.

- [ ] **Step 3: Geef ze terug**

In `src/app/api/users/route.ts` staat een `select` met `vacationOpeningDate: true, vacationOpeningUsed: true` en daaronder een omzetting naar `string | null` en `number | null`. Voeg de twee nieuwe velden op beide plekken toe, in dezelfde vorm. Doe hetzelfde in `src/app/api/users/[id]/route.ts` als die route ook een gebruiker teruggeeft.

- [ ] **Step 4: Controleer types, tests en build**

```bash
npx tsc --noEmit
```

Verwacht: geen uitvoer.

```bash
PATH="$HOME/.nvm/versions/node/v20.20.1/bin:$PATH" npx vitest run
```

Verwacht: alles groen. Let op: `src/lib/user-schema.test.ts` bestaat; als die de velden van het schema opsomt, breid hem dan uit.

```bash
DATABASE_URL="postgresql://x:x@localhost:5432/x" PATH="$HOME/.nvm/versions/node/v20.20.1/bin:$PATH" npm run build
```

Verwacht: exitcode 0.

- [ ] **Step 5: Commit**

```bash
git add src/lib/user-schema.ts "src/app/api/users/[id]/route.ts" src/app/api/users/route.ts
git commit -m "feat: beginstand van het urensaldo opslaan"
```

---

### Task 5: Routes voor de handmatige mutaties

**Files:**
- Create: `src/app/api/overtime-adjustments/route.ts`
- Create: `src/app/api/overtime-adjustments/[id]/route.ts`

**Interfaces:**
- Consumes: `isAdmin` uit `@/lib/roles`, `handleError` uit `@/lib/api`.
- Produces:
  - `POST /api/overtime-adjustments` met `{ userId, date, hours, reason }` → 201 met de mutatie
  - `DELETE /api/overtime-adjustments/[id]` → `{ success: true }`

- [ ] **Step 1: Schrijf de aanmaakroute**

Maak `src/app/api/overtime-adjustments/route.ts`:

```ts
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { z } from "zod";
import { isAdmin } from "@/lib/roles";
import { handleError } from "@/lib/api";

const schema = z.object({
  userId: z.string().min(1),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Datum als jjjj-mm-dd"),
  // Mag negatief zijn — uitbetalen haalt uren van het saldo af — maar nul is
  // geen mutatie.
  hours: z.number().refine((n) => n !== 0, "Vul een aantal uren in"),
  reason: z.string().trim().min(1, "Vul een reden in"),
});

export async function POST(req: Request) {
  try {
    const session = await auth();
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const role = (session.user as any)?.role ?? "EMPLOYEE";
    if (!isAdmin(role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const data = schema.parse(await req.json());

    const gebruiker = await prisma.user.findUnique({
      where: { id: data.userId },
      select: { id: true },
    });
    if (!gebruiker) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const mutatie = await prisma.overtimeAdjustment.create({
      data: {
        userId: data.userId,
        date: new Date(`${data.date}T00:00:00Z`),
        hours: data.hours,
        reason: data.reason,
        // Wie hem invoerde, voor de navolgbaarheid.
        createdById: session.user?.id ?? null,
      },
    });

    return NextResponse.json(mutatie, { status: 201 });
  } catch (e) { return handleError(e); }
}
```

- [ ] **Step 2: Schrijf de verwijderroute**

Maak `src/app/api/overtime-adjustments/[id]/route.ts`:

```ts
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { isAdmin } from "@/lib/roles";
import { handleError } from "@/lib/api";

/**
 * Een mutatie is niet te wijzigen, alleen te verwijderen en opnieuw in te
 * voeren. Zo ontstaan er geen stille correcties op correcties, en blijft in de
 * opsomming te volgen wat er is gebeurd.
 */
export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await auth();
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const role = (session.user as any)?.role ?? "EMPLOYEE";
    if (!isAdmin(role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const { id } = await params;
    const bestaand = await prisma.overtimeAdjustment.findUnique({ where: { id }, select: { id: true } });
    if (!bestaand) return NextResponse.json({ error: "Not found" }, { status: 404 });

    await prisma.overtimeAdjustment.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (e) { return handleError(e); }
}
```

- [ ] **Step 3: Controleer types en build**

```bash
npx tsc --noEmit
```

Verwacht: geen uitvoer.

```bash
DATABASE_URL="postgresql://x:x@localhost:5432/x" PATH="$HOME/.nvm/versions/node/v20.20.1/bin:$PATH" npm run build
```

Verwacht: exitcode 0, met `/api/overtime-adjustments` en `/api/overtime-adjustments/[id]` in het routeoverzicht.

- [ ] **Step 4: Commit**

```bash
git add src/app/api/overtime-adjustments
git commit -m "feat: handmatige mutaties op het urensaldo"
```

---

### Task 6: Het scherm

**Files:**
- Create: `src/components/personeel/overtime-client.tsx`
- Modify: `src/app/(app)/personeel/[id]/page.tsx`

**Interfaces:**
- Consumes: alle pure functies uit taken 2 en 3; de routes uit taken 4 en 5; `getEffectiveContract` uit `@/lib/contracts` en `serializeContract`/`contractSelect` uit `@/app/api/contracts/route`; `formatDate` en `formatHours` uit `@/lib/utils`.
- Produces: niets. Dit is de laatste taak.

- [ ] **Step 1: Verzamel de gegevens op de serverpagina**

In `src/app/(app)/personeel/[id]/page.tsx` wordt de medewerker al opgehaald met zijn contracten en km-sjablonen. Vul dat aan:

- de twee nieuwe velden `overtimeOpeningDate` en `overtimeOpeningHours`;
- `overtimeAdjustments`, gesorteerd op datum;
- alle urenregels vanaf de peildatum: `prisma.timeEntry.findMany({ where: { userId, date: { gte: peildatum } }, select: { date: true, hours: true } })`. **Geen filter op `absenceRequestId`** — verlof telt mee.

Bepaal daarna op de server:

- `months = monthsToSettle(peildatum, new Date())`;
- `hoursByMonth = bucketHoursByMonth(entries)`;
- `contractHoursByMonth`: per maand het contract dat aan het **eind** van die maand geldt, met `getEffectiveContract(contracten, laatsteDagVanDieMaand)`. Dat is dezelfde regel die `src/app/api/payroll/route.ts:72` al gebruikt; wijk daar niet van af. Nul-urencontracten leveren `null` op, zodat `monthTarget` die maand overslaat;
- de uren van de lopende maand en het contract dat daarvoor geldt.

Heeft de medewerker geen peildatum, sla het ophalen dan over en geef `null` door — dan is er niets te rekenen.

- [ ] **Step 2: Schrijf het component**

Maak `src/components/personeel/overtime-client.tsx`, in de vorm van de andere blokken op die pagina (`CommuteTemplateClient` is het kortste voorbeeld): een `Card` met een `CardHeader`, de opsomming eronder, en een `Dialog` voor de invoer.

De opsomming toont per regel:

| Soort | Wat er staat |
|---|---|
| Beginstand | `Beginstand ${formatDate(date)}` en het aantal uren |
| Maand | de maand in woorden en jaar, `geboekt X / target Y`, en het verschil |
| Mutatie | `formatDate(date)`, de reden, het aantal uren, en een prullenbak |

Daaronder een streep, het **saldo**, en daar weer onder de lopende maand als losse regel met de tekst "loopt nog" — grijs, en zichtbaar buiten het saldo.

Let op de opmaak van getallen: een positief saldo krijgt een `+` ervoor, een negatief zijn eigen minteken, en gebruik `formatHours` uit `@/lib/utils` zoals de rest van de app dat doet. Kleur alleen als het iets toevoegt: een tekort in `text-destructive`, de rest in de gewone tekstkleur.

Heeft de medewerker geen peildatum, toon dan geen opsomming maar één regel die zegt dat er nog geen beginstand is ingesteld, met de knop om dat te doen.

- [ ] **Step 3: Laat de beginstand instellen**

Een venstertje met twee velden: de peildatum (`<input type="date">`) en het aantal uren. Opslaan gaat met een `PUT` naar `/api/users/${userId}` met `overtimeOpeningDate` en `overtimeOpeningHours`.

De server weigert een datum die niet op de eerste van een maand ligt; toon die melding uit het `error`-veld in plaats van zelf een controle te verzinnen.

- [ ] **Step 4: Laat mutaties toevoegen en verwijderen**

Een venstertje met datum, uren (met teken) en reden, dat `POST /api/overtime-adjustments` aanroept. Verwijderen met een `confirm()` en `DELETE /api/overtime-adjustments/${id}`, zoals de andere blokken op deze pagina dat ook doen.

Ververs na elke wijziging met `router.refresh()`; de pagina is server-gerenderd en rekent het saldo daar opnieuw uit.

- [ ] **Step 5: Zet het blok op de pagina**

Plaats `OvertimeClient` op `src/app/(app)/personeel/[id]/page.tsx` ná `ContractsClient` — het saldo leunt op de contracten, dus die volgorde leest logisch.

- [ ] **Step 6: Controleer types, tests en build**

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

- [ ] **Step 7: Commit**

```bash
git add src/components/personeel/overtime-client.tsx "src/app/(app)/personeel/[id]/page.tsx"
git commit -m "feat: urensaldo op de medewerkerspagina"
```

---

## Klaar wanneer

- Een beheerder stelt per medewerker een beginstand met peildatum in, en ziet daarna een opsomming waarin per maand te volgen is hoe het saldo loopt.
- Tekorten tellen negatief mee; de lopende maand staat apart en telt niet mee.
- Verlof telt mee als "aan je target voldaan", alle soorten.
- Handmatige mutaties zijn toe te voegen en te verwijderen, met een verplichte reden.
- Nul-urencontracten en medewerkers zonder peildatum krijgen geen saldo.
- `npx tsc --noEmit` is schoon, `npm run build` geeft exitcode 0 en de volledige vitest-suite is groen.
