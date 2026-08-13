# Vakantie-uren per jaar op het contract — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Het aantal vakantie-uren per jaar is in te vullen bij het contract van een medewerker, en dat getal voedt het vakantiesaldo op het dashboard en het verlofscherm.

**Architecture:** `Contract` krijgt één nullable kolom `vacationHours`. Een pure functie beantwoordt "hoeveel vakantie-uren heeft deze medewerker dit jaar?" — een expliciete `VacationBudget`-rij wint, anders komt het getal van het contract dat op 31 december van dat jaar geldt, anders van het laatste contract dat het jaar nog overlapte. Het dashboard en de verlofpagina rekenen dat op de server uit; de contracten zelf gaan nooit naar de browser, want er staan salarissen in.

**Tech Stack:** Next.js 16 (App Router), React 19, react-hook-form + zod, Prisma 6 op PostgreSQL, vitest.

**Spec:** `docs/superpowers/specs/2026-08-13-vakantie-uren-op-contract-design.md`

## Global Constraints

- Testen zijn in deze repo uitsluitend voor pure functies, in `src/lib/*.test.ts`. Er is geen DOM-testomgeving (`vitest.config.mts` draait `environment: "node"`); schrijf geen component- of routetests.
- Verbind niets met de database. Draai geen `prisma db push`, geen `prisma migrate`, geen seed. `prisma generate` mag wel: dat leest alleen het schemabestand.
- Prisma's `Decimal` serialiseert als string. Alles wat uit de database komt gaat door `Number()`.
- Datums: de kolommen zijn `@db.Date`; buiten Prisma wordt overal met `YYYY-MM-DD`-strings gerekend. Nooit `getDay()`, `getDate()` of `setDate()`.
- Contractgegevens bevatten salarissen. Er mag geen contractveld naar een clientcomponent behalve wat dit plan expliciet noemt (`startDate`, `endDate`, `vacationHours`, `userId`) — en op de verlofpagina gaan zelfs díé niet mee, daar gaat alleen het uitgerekende budget naar de client.
- `npx` en `npm test` hebben in deze omgeving het voorvoegsel `PATH="$HOME/.nvm/versions/node/v20.20.1/bin:$PATH"` nodig; zonder dat mist de systeem-node `crypto.getRandomValues` en start vitest niet.
- Commit-berichten in het Nederlands, met de trailer `Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>`.
- Commentaar in het Nederlands, dat uitlegt wáárom; volg de dichtheid van de omringende code.

---

## Bestandsoverzicht

| Bestand | Verantwoordelijkheid | Taak |
|---|---|---|
| `prisma/schema.prisma` | De kolom `vacationHours` op `Contract`. | 1 |
| `src/app/api/contracts/route.ts` | Select, serialisatie en zod-schema van een contract. `[id]/route.ts` en de personeelspagina hergebruiken deze drie, dus dit is de enige plek. | 1 |
| `src/components/personeel/contracts-client.tsx` | Het contractformulier en de contracttabel. | 1 |
| `src/lib/vacation-budget.ts` | Nieuw. De keuzeregel als pure functie, plus het aanvullen van de budgetlijst. | 2 |
| `src/lib/vacation-budget.test.ts` | Nieuw. Testen daarvan. | 2 |
| `src/components/vacation/absence-client.tsx` | Verwerkt budgetrijen zonder id: "uit contract", geen verwijderknop, opslaan als nieuwe rij. | 3 |
| `src/app/(app)/absence/page.tsx` | Vult de budgetlijst aan vanuit de contracten. | 4 |
| `src/app/(app)/page.tsx` | Het vakantieblok op het dashboard. | 4 |

Volgorde: taak 3 gaat vóór taak 4. De client leert eerst omgaan met een rij zonder id; pas daarna gaan de pagina's zulke rijen sturen. Andersom zou de tussenstand niet typecorrect zijn.

---

### Task 1: Het veld op het contract

**Files:**
- Modify: `prisma/schema.prisma:476-496` (model `Contract`)
- Modify: `src/app/api/contracts/route.ts:8-66`
- Modify: `src/components/personeel/contracts-client.tsx:21-46`, `:88-103`, `:163-193`, `:287-290`

**Interfaces:**
- Produces: het contractveld `vacationHours: number | null` in de geserialiseerde vorm die `serializeContract` teruggeeft, en de kolom `Contract.vacationHours` in het Prisma-schema. Taak 4 leest die kolom rechtstreeks met een eigen `select`.

**Achtergrond:** `src/app/api/contracts/[id]/route.ts` en `src/app/(app)/personeel/[id]/page.tsx` importeren `contractSelect`, `serializeContract` en `contractBodySchema` uit `route.ts`. Wie die drie bijwerkt, werkt alle contractpaden bij; er is geen tweede plek.

- [ ] **Step 1: Voeg de kolom toe aan het schema**

In `prisma/schema.prisma`, in `model Contract`, direct onder de regel `contractHours        Decimal?             @db.Decimal(5, 2)`:

```prisma
  // Vakantie-uren per jaar. Voedt het vakantiesaldo op /absence en het
  // dashboard; leeg betekent "geen afspraak vastgelegd", en dan blijft het
  // saldo leeg zoals het altijd was.
  vacationHours        Decimal?             @db.Decimal(5, 2)
```

- [ ] **Step 2: Genereer de Prisma-client opnieuw**

Run: `PATH="$HOME/.nvm/versions/node/v20.20.1/bin:$PATH" npx prisma generate`
Verwacht: "Generated Prisma Client". Dit leest alleen `schema.prisma` en maakt geen verbinding met de database. Zonder deze stap kent TypeScript het nieuwe veld niet.

- [ ] **Step 3: Laat het veld mee in de API**

In `src/app/api/contracts/route.ts` vier kleine toevoegingen:

In `contractSelect`, achter `contractHours: true,`:

```ts
  vacationHours: true,
```

In `serializeContract`, direct onder de regel voor `contractHours`:

```ts
    vacationHours: c.vacationHours != null ? Number(c.vacationHours) : null,
```

In `contractBodySchema`, direct onder `contractHours: num,`:

```ts
  vacationHours: num,
```

In `toContractData`, in het teruggegeven object direct onder `contractHours,`:

```ts
    vacationHours: b.vacationHours ?? null,
```

- [ ] **Step 4: Zet het veld in het contractformulier**

In `src/components/personeel/contracts-client.tsx`:

In `interface Contract`, achter `contractHours: number | null;`:

```ts
  vacationHours: number | null;
```

In het zod-`schema`, direct onder `contractHours: z.coerce.number().positive().optional(),`:

```ts
  vacationHours: z.coerce.number().positive().optional(),
```

In `openEdit`, in het `form.reset({ ... })`-object direct onder de regel voor `contractHours`:

```ts
      vacationHours: c.vacationHours ?? undefined,
```

En in de dialoog, direct onder het blok met "Contracturen per week":

```tsx
            <div className="space-y-1">
              <Label>Vakantie-uren per jaar</Label>
              <Input type="number" step="0.5" min="0" placeholder="bijv. 160" {...form.register("vacationHours", numberField)} />
            </div>
```

- [ ] **Step 5: Zet het veld in de contracttabel**

In hetzelfde bestand, in de `TableHeader`, direct achter `<TableHead>Uren</TableHead>`:

```tsx
                  <TableHead>Vakantie-uren</TableHead>
```

En in de rij, direct achter de cel die `c.contractHours` toont:

```tsx
                      <TableCell>{c.vacationHours != null ? `${c.vacationHours}u` : <span className="text-muted-foreground">—</span>}</TableCell>
```

- [ ] **Step 6: Typecontrole en testen**

Run: `PATH="$HOME/.nvm/versions/node/v20.20.1/bin:$PATH" npx tsc --noEmit`
Verwacht: geen uitvoer. Klaagt hij dat `vacationHours` niet bestaat op het Prisma-type, dan is stap 2 niet gedraaid.

Run: `PATH="$HOME/.nvm/versions/node/v20.20.1/bin:$PATH" npm test`
Verwacht: PASS. Er komen in deze taak geen testen bij — er is niets puurs toegevoegd.

- [ ] **Step 7: Commit**

```bash
git add prisma/schema.prisma src/app/api/contracts/route.ts src/components/personeel/contracts-client.tsx
git commit -m "feat: vakantie-uren per jaar op het contract

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 2: De keuzeregel als pure functie

**Files:**
- Create: `src/lib/vacation-budget.ts`
- Create: `src/lib/vacation-budget.test.ts`

**Interfaces:**
- Consumes: uit `src/lib/contracts.ts` — `getEffectiveContract<T extends ContractDates>(contracts: T[], refDate: string): T | null` (het contract dat op die datum geldt: de laatste startdatum die de datum dekt, anders `null`), `rangeOverlaps(aStart, aEnd, bStart, bEnd): boolean` (null-start is min-oneindig, null-eind is plus-oneindig), en het type `ContractDates = { startDate: string | null; endDate: string | null }`.
- Produces:
  - `type ContractVacation = ContractDates & { vacationHours: number | null }`
  - `type BudgetRow = { id: string | null; userId: string; year: number; hours: number; user: { id: string; name: string } }`
  - `contractVacationHours(contracts: ContractVacation[], year: number): number | null`
  - `fillBudgets(budgets: BudgetRow[], users: Array<{ id: string; name: string }>, contracts: Array<ContractVacation & { userId: string }>, year: number): BudgetRow[]`
  - `toContractVacation(rows): Array<ContractVacation & { userId: string }>`

- [ ] **Step 1: Schrijf de falende testen**

Maak `src/lib/vacation-budget.test.ts` met:

```ts
import { describe, it, expect } from "vitest";
import { contractVacationHours, fillBudgets, toContractVacation } from "./vacation-budget";

const lopend = { startDate: "2020-01-01", endDate: null, vacationHours: 160 };

describe("contractVacationHours", () => {
  it("takes the hours of the contract in force at the end of the year", () => {
    expect(contractVacationHours([lopend], 2026)).toBe(160);
  });

  it("prefers the later contract when two of them cover the year", () => {
    const oud = { startDate: "2020-01-01", endDate: "2026-06-30", vacationHours: 160 };
    const nieuw = { startDate: "2026-07-01", endDate: null, vacationHours: 200 };
    expect(contractVacationHours([oud, nieuw], 2026)).toBe(200);
  });

  it("falls back to the last contract that overlapped the year", () => {
    // Contract liep in augustus af en er kwam niets voor terug: over dat jaar
    // had hij wel degelijk vakantie-uren.
    const afgelopen = { startDate: "2020-01-01", endDate: "2026-08-31", vacationHours: 160 };
    expect(contractVacationHours([afgelopen], 2026)).toBe(160);
  });

  it("ignores a contract that ended before the year began", () => {
    const oud = { startDate: "2019-01-01", endDate: "2025-12-31", vacationHours: 160 };
    expect(contractVacationHours([oud], 2026)).toBeNull();
  });

  it("gives nothing when the contract leaves the field empty", () => {
    expect(contractVacationHours([{ ...lopend, vacationHours: null }], 2026)).toBeNull();
  });

  it("gives nothing without any contract", () => {
    expect(contractVacationHours([], 2026)).toBeNull();
  });

  it("does not look past the contract in force, even when an older one has a number", () => {
    // Het geldende contract zwijgt over vakantie-uren. Dan is er geen afspraak,
    // en een ouder contract erbij halen zou een verlopen afspraak laten
    // doorwerken.
    const oud = { startDate: "2020-01-01", endDate: "2025-12-31", vacationHours: 160 };
    const nieuw = { startDate: "2026-01-01", endDate: null, vacationHours: null };
    expect(contractVacationHours([oud, nieuw], 2026)).toBeNull();
  });
});

describe("fillBudgets", () => {
  const users = [
    { id: "u1", name: "Anna" },
    { id: "u2", name: "Bert" },
  ];
  const contracten = [
    { userId: "u1", startDate: "2020-01-01", endDate: null, vacationHours: 160 },
    { userId: "u2", startDate: "2020-01-01", endDate: null, vacationHours: 200 },
  ];
  const bestaand = {
    id: "b1", userId: "u1", year: 2026, hours: 999,
    user: { id: "u1", name: "Anna" },
  };

  it("leaves an existing row alone and derives only for the others", () => {
    const uitkomst = fillBudgets([bestaand], users, contracten, 2026);
    expect(uitkomst).toEqual([
      bestaand,
      { id: null, userId: "u2", year: 2026, hours: 200, user: { id: "u2", name: "Bert" } },
    ]);
  });

  it("derives for everyone when there is no row at all", () => {
    const uitkomst = fillBudgets([], users, contracten, 2026);
    expect(uitkomst.map((b) => [b.userId, b.hours, b.id])).toEqual([
      ["u1", 160, null],
      ["u2", 200, null],
    ]);
  });

  it("skips an employee whose contract says nothing", () => {
    const uitkomst = fillBudgets([], users, [contracten[0]], 2026);
    expect(uitkomst.map((b) => b.userId)).toEqual(["u1"]);
  });

  it("sorts by name so a derived row does not land at the bottom", () => {
    const zeger = { id: "b9", userId: "u9", year: 2026, hours: 80, user: { id: "u9", name: "Zeger" } };
    const uitkomst = fillBudgets([zeger], users, contracten, 2026);
    expect(uitkomst.map((b) => b.user.name)).toEqual(["Anna", "Bert", "Zeger"]);
  });
});

describe("toContractVacation", () => {
  it("turns Prisma rows into dates and numbers", () => {
    const rijen = [
      {
        userId: "u1",
        startDate: new Date("2026-01-01T00:00:00Z"),
        endDate: null,
        vacationHours: "160.00",
      },
    ];
    expect(toContractVacation(rijen)).toEqual([
      { userId: "u1", startDate: "2026-01-01", endDate: null, vacationHours: 160 },
    ]);
  });

  it("keeps an empty vacationHours empty instead of turning it into nought", () => {
    const rijen = [{ userId: "u1", startDate: null, endDate: null, vacationHours: null }];
    expect(toContractVacation(rijen)).toEqual([
      { userId: "u1", startDate: null, endDate: null, vacationHours: null },
    ]);
  });
});
```

- [ ] **Step 2: Draai de testen en controleer dat ze falen**

Run: `PATH="$HOME/.nvm/versions/node/v20.20.1/bin:$PATH" npm test -- vacation-budget`
Verwacht: FAIL — `src/lib/vacation-budget.ts` bestaat nog niet.

- [ ] **Step 3: Schrijf de functies**

Maak `src/lib/vacation-budget.ts`:

```ts
import { getEffectiveContract, rangeOverlaps, type ContractDates } from "./contracts";

/**
 * Het vakantiesaldo komt uit twee bronnen, en die moeten niet uit elkaar
 * lopen. Een `VacationBudget`-rij is de uitzondering voor één jaar; het
 * contract is de gewone gang van zaken. Deze module bepaalt op één plek welke
 * van de twee geldt, zodat het dashboard en het verlofscherm hetzelfde getal
 * tonen.
 */
export type ContractVacation = ContractDates & { vacationHours: number | null };

/**
 * Een budgetregel zoals het verlofscherm hem kent. `id` is null wanneer de
 * regel uit een contract is afgeleid en er dus geen rij in de database staat —
 * daaraan hangt in het scherm de tekst "uit contract" en het ontbreken van de
 * verwijderknop.
 */
export type BudgetRow = {
  id: string | null;
  userId: string;
  year: number;
  hours: number;
  user: { id: string; name: string };
};

/**
 * De vakantie-uren die de contracten voor een jaar opleveren, of null.
 *
 * Het contract dat op 31 december geldt is leidend. Zwijgt dat over
 * vakantie-uren, dan is er geen afspraak en wordt er niet verder gezocht: een
 * ouder contract erbij halen zou een verlopen afspraak laten doorwerken.
 *
 * Is er op die datum géén contract, dan telt het laatste contract dat het jaar
 * nog overlapte. Zonder die stap zou iemand van wie het contract in augustus
 * afliep over dat jaar geen budget hebben, terwijl hij er de halve tijd wel
 * een had.
 */
export function contractVacationHours(contracts: ContractVacation[], year: number): number | null {
  const eind = `${year}-12-31`;
  const geldend = getEffectiveContract(contracts, eind);
  if (geldend) return geldend.vacationHours;

  const overlappend = contracts
    .filter((c) => rangeOverlaps(c.startDate, c.endDate, `${year}-01-01`, eind))
    .sort((a, b) => (a.startDate ?? "").localeCompare(b.startDate ?? ""));
  const laatste = overlappend[overlappend.length - 1];
  return laatste ? laatste.vacationHours : null;
}

/**
 * De budgetlijst aangevuld met wat de contracten opleveren.
 *
 * Een bestaande rij blijft ongemoeid — die is met de hand gezet en gaat vóór
 * het contract. Wie geen rij heeft en wél een contractgetal, krijgt een regel
 * zonder id. Wie geen van beide heeft komt er niet in voor: geen budget is
 * iets anders dan een budget van nul.
 *
 * Er wordt op naam gesorteerd omdat de bestaande query dat ook doet; zonder
 * die sortering zouden de afgeleide regels als klomp onderaan belanden.
 */
export function fillBudgets(
  budgets: BudgetRow[],
  users: Array<{ id: string; name: string }>,
  contracts: Array<ContractVacation & { userId: string }>,
  year: number,
): BudgetRow[] {
  const heeftRij = new Set(budgets.map((b) => b.userId));
  const afgeleid: BudgetRow[] = [];

  for (const u of users) {
    if (heeftRij.has(u.id)) continue;
    const uren = contractVacationHours(contracts.filter((c) => c.userId === u.id), year);
    if (uren === null) continue;
    afgeleid.push({ id: null, userId: u.id, year, hours: uren, user: { id: u.id, name: u.name } });
  }

  return [...budgets, ...afgeleid].sort((a, b) => a.user.name.localeCompare(b.user.name));
}

/**
 * Prisma-rijen naar de vorm die de functies hierboven verwachten: datums als
 * `YYYY-MM-DD` en `Decimal` als getal. Twee pagina's doen deze omzetting, dus
 * hij hoort één keer te bestaan.
 */
export function toContractVacation<
  T extends { userId: string; startDate: Date | null; endDate: Date | null; vacationHours: unknown },
>(rows: T[]): Array<ContractVacation & { userId: string }> {
  return rows.map((r) => ({
    userId: r.userId,
    startDate: r.startDate ? r.startDate.toISOString().slice(0, 10) : null,
    endDate: r.endDate ? r.endDate.toISOString().slice(0, 10) : null,
    vacationHours: r.vacationHours != null ? Number(r.vacationHours) : null,
  }));
}
```

- [ ] **Step 4: Draai de testen en controleer dat ze slagen**

Run: `PATH="$HOME/.nvm/versions/node/v20.20.1/bin:$PATH" npm test -- vacation-budget`
Verwacht: PASS, alle testen in dit bestand.

- [ ] **Step 5: Draai de hele suite en de typecontrole**

Run: `PATH="$HOME/.nvm/versions/node/v20.20.1/bin:$PATH" npm test`
Verwacht: PASS.

Run: `PATH="$HOME/.nvm/versions/node/v20.20.1/bin:$PATH" npx tsc --noEmit`
Verwacht: geen uitvoer.

- [ ] **Step 6: Commit**

```bash
git add src/lib/vacation-budget.ts src/lib/vacation-budget.test.ts
git commit -m "feat: vakantiebudget van een jaar uit contract of budgetrij

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 3: Het verlofscherm verdraagt een regel zonder id

**Files:**
- Modify: `src/components/vacation/absence-client.tsx:59-65` (interface), `:260-270` (`openBudgetDialog`), `:386-400` (`submitBudget` en `deleteBudget`), `:544-570` (de budgettabel)

**Interfaces:**
- Consumes: niets uit eerdere taken; deze taak verandert alleen de vorm die de client aankan.
- Produces: de prop `initialBudgets` van `AbsenceClient` accepteert nu regels met `id: string | null`. Taak 4 stuurt zulke regels.

**Achtergrond:** het verlofscherm heeft een tabblad "Vakantiebudgetten" met per regel een potlood- en een prullenbakknop. Na deze taak kan een regel bestaan die niet in de database staat (afgeleid uit een contract): die krijgt "uit contract" achter het getal, geen prullenbak, en het potlood opent de dialoog als nieuwe rij in plaats van als wijziging. Er verandert nog niets zichtbaars — er komen pas afgeleide regels binnen in taak 4.

- [ ] **Step 1: Maak het id optioneel in het type**

In `src/components/vacation/absence-client.tsx`, in `interface VacationBudget`, vervang `id: string;` door:

```ts
  // null betekent: afgeleid uit het contract, er staat geen rij in de
  // database. Daaraan hangt de tekst "uit contract", het ontbreken van de
  // verwijderknop, en dat opslaan een nieuwe rij maakt in plaats van een
  // bestaande te wijzigen.
  id: string | null;
```

- [ ] **Step 2: Laat de dialoog een afgeleide regel als nieuwe rij openen**

Vervang `openBudgetDialog` door:

```tsx
  function openBudgetDialog(budget?: VacationBudget) {
    setServerError("");
    if (budget?.id) {
      setEditingBudget(budget);
      budgetForm.reset({ userId: budget.userId, year: budget.year, hours: budget.hours });
    } else if (budget) {
      // Afgeleid uit het contract: er valt niets te wijzigen, dit wordt een
      // nieuwe rij. De waarden staan al klaar zodat alleen het getal nog hoeft.
      setEditingBudget(null);
      budgetForm.reset({ userId: budget.userId, year: budget.year, hours: budget.hours });
    } else {
      setEditingBudget(null);
      budgetForm.reset({ userId: "", year, hours: "" as any });
    }
    setBudgetDialogOpen(true);
  }
```

- [ ] **Step 3: Laat opslaan de afgeleide regel vervangen**

In `submitBudget`, in de tak die POST doet, vervang het `setBudgets`-blok door:

```tsx
      setBudgets((prev) => {
        // Op medewerker en jaar samenvoegen, niet op id: de regel die hier
        // vervangen wordt is vaak de afgeleide, en die heeft geen id. Op id
        // zoeken zou de afgeleide regel naast de nieuwe echte laten staan.
        const bestaand = prev.findIndex((b) => b.userId === saved.userId && b.year === saved.year);
        return bestaand >= 0
          ? prev.map((b, i) => (i === bestaand ? saved : b))
          : [...prev, saved].sort((a, b) => a.user.name.localeCompare(b.user.name));
      });
```

- [ ] **Step 4: Toon de herkomst en verberg de verwijderknop**

In de budgettabel, vervang de openingsregel van de rij zodat een regel zonder id ook een sleutel heeft:

```tsx
                        <tr key={b.id ?? `${b.userId}-${b.year}`} className="border-t hover:bg-muted/30">
```

Vervang de cel met het budgetgetal door:

```tsx
                          <td className="px-4 py-3 text-right">
                            {b.hours}
                            {b.id === null && (
                              <span className="ml-1.5 text-xs text-muted-foreground">uit contract</span>
                            )}
                          </td>
```

En zet de verwijderknop tussen accolades zodat hij alleen verschijnt bij een echte rij. De knop luidt daarna:

```tsx
                              {b.id !== null && (
                                <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => deleteBudget(b.id!)}>
                                  <Trash2 className="h-3.5 w-3.5" />
                                </Button>
                              )}
```

- [ ] **Step 5: Typecontrole en testen**

Run: `PATH="$HOME/.nvm/versions/node/v20.20.1/bin:$PATH" npx tsc --noEmit`
Verwacht: geen uitvoer. Klaagt hij over `deleteBudget(b.id)`, dan mist de `!` uit stap 4 of de omhullende `b.id !== null`.

Run: `PATH="$HOME/.nvm/versions/node/v20.20.1/bin:$PATH" npm test`
Verwacht: PASS. Er komen geen testen bij: dit is React en die wordt in deze repo niet automatisch getest.

- [ ] **Step 6: Commit**

```bash
git add src/components/vacation/absence-client.tsx
git commit -m "feat: verlofscherm verdraagt een budgetregel uit het contract

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 4: De pagina's rekenen het budget uit

**Files:**
- Modify: `src/app/(app)/absence/page.tsx:17-69`
- Modify: `src/app/(app)/page.tsx:37-112`

**Interfaces:**
- Consumes: uit `@/lib/vacation-budget` — `contractVacationHours(contracts: ContractVacation[], year: number): number | null`, `fillBudgets(budgets: BudgetRow[], users: Array<{ id: string; name: string }>, contracts: Array<ContractVacation & { userId: string }>, year: number): BudgetRow[]`, en `toContractVacation(rows)` die Prisma-rijen met `userId`, `startDate`, `endDate` en `vacationHours` omzet. `BudgetRow` heeft `id: string | null`. Uit taak 1: de kolom `Contract.vacationHours`.
- Produces: niets voor latere taken; dit is de laatste.

**Achtergrond:** dit is de enige taak die contracten opvraagt buiten de contract-API om. Vraag uitsluitend `userId`, `startDate`, `endDate` en `vacationHours` op — de rest van een contract is salaris en dat hoort hier niet. Op de verlofpagina gaat zelfs dat niet naar de client: `fillBudgets` draait op de server en alleen de uitkomst wordt doorgegeven.

- [ ] **Step 1: Laat de verlofpagina de contracten en de eigen naam ophalen**

In `src/app/(app)/absence/page.tsx` staat één `Promise.all` met vijf queries (de vijfde is `prisma.workSchedule.findMany`). Voeg er een zesde aan toe en breid de bestemmingsvariabelen uit. De array wordt:

```ts
  const [requests, budgets, users, currentUser, scheduleRows, contractRows] = await Promise.all([
```

De query van `currentUser` haalt nu ook de naam op, want een medewerker zonder adminrechten komt niet in de `users`-lijst voor en `fillBudgets` heeft een naam nodig:

```ts
    prisma.user.findUnique({ where: { id: userId }, select: { weeklyHours: true, name: true } }),
```

En als zesde element, na `prisma.workSchedule.findMany(...)`:

```ts
    // Alleen de velden die het budget bepalen: de rest van een contract is
    // salaris en heeft op dit scherm niets te zoeken.
    prisma.contract.findMany({
      where: admin ? {} : { userId },
      select: { userId: true, startDate: true, endDate: true, vacationHours: true },
    }),
```

- [ ] **Step 2: Vul de budgetlijst aan op de verlofpagina**

In hetzelfde bestand, na de `Promise.all` en naast de bestaande regels die `calendarToken` en `schedules` bepalen:

```ts
  // De budgetlijst aangevuld met wat de contracten opleveren. Dit gebeurt hier
  // en niet in de client, zodat de contracten de browser niet halen.
  const budgetRegels = fillBudgets(
    serialize(budgets).map((b: any) => ({ ...b, hours: Number(b.hours) })),
    admin ? users : [{ id: userId, name: currentUser?.name ?? "" }],
    toContractVacation(contractRows),
    year,
  );
```

En geef die door in plaats van de bestaande `initialBudgets`-uitdrukking:

```tsx
      initialBudgets={budgetRegels}
```

Voeg boven aan het bestand de import toe:

```ts
import { fillBudgets, toContractVacation } from "@/lib/vacation-budget";
```

- [ ] **Step 3: Laat het dashboard de contracten ophalen**

In `src/app/(app)/page.tsx` staat een grote `Promise.all`. Voeg als laatste element toe, na `magStandup ? countMissingHours(standupDag) : Promise.resolve(0),`:

```ts
    prisma.contract.findMany({
      where: { userId },
      select: { userId: true, startDate: true, endDate: true, vacationHours: true },
    }),
```

En zet `eigenContracten` als laatste naam in de destructurering van diezelfde `const [...] = await Promise.all([`-regel, achter `missendeUren`.

- [ ] **Step 4: Laat het dashboard het contract gebruiken als er geen budgetrij is**

In hetzelfde bestand, vervang de regel die `vacBudgetHours` bepaalt door:

```ts
  // Een budgetrij voor dit jaar wint; anders zegt het contract het. Zonder
  // allebei blijft het nul, zoals het altijd was.
  const vacBudgetHours = vacationBudget
    ? Number(vacationBudget.hours)
    : (contractVacationHours(toContractVacation(eigenContracten), currentYear) ?? 0);
```

Voeg boven aan het bestand de import toe:

```ts
import { contractVacationHours, toContractVacation } from "@/lib/vacation-budget";
```

- [ ] **Step 5: Typecontrole, testen en build**

Run: `PATH="$HOME/.nvm/versions/node/v20.20.1/bin:$PATH" npx tsc --noEmit`
Verwacht: geen uitvoer.

Run: `PATH="$HOME/.nvm/versions/node/v20.20.1/bin:$PATH" npm test`
Verwacht: PASS.

Run: `PATH="$HOME/.nvm/versions/node/v20.20.1/bin:$PATH" npm run build`
Verwacht: de build slaagt. Deze stap vangt wat `tsc` niet ziet, zoals een clientcomponent die per ongeluk iets van de server importeert.

- [ ] **Step 6: Commit**

```bash
git add "src/app/(app)/absence/page.tsx" "src/app/(app)/page.tsx"
git commit -m "feat: vakantiesaldo valt terug op het contract

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Uitrol

De schemawijziging is één nullable kolom. `npm run db:push` tegen de productiedatabase kan vóór de code live gaat en breekt niets: de draaiende versie kent de kolom niet en raakt hem niet aan. Schema eerst, code daarna — een push naar main deployt meteen. Deze stap hoort bij de mens die de merge doet, niet bij een implementerende subagent: die verbindt niets met de database.

## Handmatige controle na afloop

1. Open een medewerker op /personeel, bewerk zijn contract: het veld "Vakantie-uren per jaar" staat er, en na opslaan toont de contracttabel het getal.
2. Ga naar /absence, tabblad Vakantiebudgetten: die medewerker staat er nu in met "uit contract" achter het getal, en zonder prullenbak.
3. Klik op het potlood van zo'n regel, pas het getal aan en sla op: de regel wordt een gewone rij (geen "uit contract" meer, mét prullenbak) en staat er maar één keer.
4. Vraag als die medewerker verlof aan: de regel "Saldo na aanvraag" in de dialoog rekent met het contractgetal.
5. Kijk op het dashboard: het blokje toont "Xu van <contractgetal>u opgenomen".
6. Een medewerker zonder ingevuld contractveld verandert nergens: geen regel in het tabblad, en op het dashboard nog steeds nul van nul.
