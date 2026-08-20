# Herhaalprojecten met automatische conceptfactuur — Implementatieplan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Een sjabloon per soort herhaalwerk, per batch een project eruit, en bij het voltooien een conceptfactuur die op goedkeuring van een beheerder wacht.

**Architecture:** Eén nieuwe tabel `RecurringTemplate` en vijf nullable velden op `Project` — een batch ís een project. Alle rekenkunde en tekstopbouw zit als pure functies in `src/lib/recurring.ts` met vitest-dekking. Het voltooien gebeurt in één transactie die het project bijwerkt, de factuur aanmaakt en de twee aan elkaar koppelt.

**Tech Stack:** Next.js 16 (App Router), React 19, Prisma 6 + PostgreSQL (Neon), zod, date-fns, Tailwind, shadcn-componenten uit `src/components/ui`, vitest.

**Spec:** `docs/superpowers/specs/2026-08-20-herhaalprojecten-design.md`

**De casus:** H3X testen voor Zonneplan, per stuk à €20,00, batches van doorgaans 120. Op de factuur staan goedkeur, afkeur en het totaal; **het totaal is wat er gefactureerd wordt** — alles is getest. Facturen `2026-0007` en `2026-0008` zijn de handmatige voorlopers.

## Global Constraints

- **Lees eerst `AGENTS.md`.** Dit is Next.js 16.
- **Datums in de UI altijd `DD-MMM-YYYY`** via `formatDate` uit `src/lib/utils.ts`; `yyyy-MM-dd` alleen als interne sleutel of `<input type="date">`-waarde.
- **Het gefactureerde aantal wordt door de server uitgerekend**, nooit overgenomen van de client.
- **Dit project test uitsluitend pure functies** in `src/lib/*.test.ts`. Geen component-, route- of integratietests.
- **Geen nieuwe npm-afhankelijkheden.**
- **Commentaar en foutmeldingen in het Nederlands**, uitleggend *waarom* en niet *wat*.
- **Imports:** binnen `src/lib/` relatief (`./utils`), in `src/app/` en `src/components/` via de alias (`@/lib/...`). `vitest.config.mts` kent geen alias-resolutie.
- **Route-handlers krijgen `params` als `Promise`.**
- **Node 20 verplicht:** `PATH="$HOME/.nvm/versions/node/v20.20.1/bin:$PATH" npx vitest run`. Ketens met `&&` worden door de permissielaag geweigerd; bij een losse weigering één keer opnieuw proberen.
- **`npx tsc --noEmit` schoon en `npm run build` exit 0.** De build heeft `DATABASE_URL` nodig maar verbindt niet: `DATABASE_URL="postgresql://x:x@localhost:5432/x" npm run build`.
- **De database in `.env.local` is productie.** Alleen lezen, behalve de ene `db:push` in taak 1.

---

## Bestandsindeling

| Bestand | Verantwoordelijkheid |
|---|---|
| `prisma/schema.prisma` | `RecurringTemplate`, enum `BillingMode`, vijf velden op `Project`, tegenveld op `Invoice`, relatie op `Customer`. |
| `src/lib/recurring.ts` | Aantallen, batchnaam, inleidende zin, de conceptfactuur en de weigeringen. Geen React, geen Prisma. |
| `src/lib/recurring.test.ts` | Tests daarvan. |
| `src/lib/invoice-defaults.ts` | De standaardtekst over de betalingstermijn, gedeeld door scherm en server. |
| `src/lib/roles.ts` | Twee nieuwe rechten. |
| `src/app/api/recurring-templates/route.ts` | POST: sjabloon aanmaken. GET: de lijst. |
| `src/app/api/recurring-templates/[id]/route.ts` | PUT en DELETE (archiveren). |
| `src/app/api/recurring-templates/[id]/batches/route.ts` | POST: een batch starten. |
| `src/app/api/projects/[id]/complete-batch/route.ts` | POST: voltooien en de conceptfactuur aanmaken. |
| `src/app/(app)/herhaalprojecten/page.tsx` | De pagina, server-gerenderd. |
| `src/components/recurring/recurring-client.tsx` | Sjablonen, lopende batches en het voltooivenster. |
| `src/components/layout/sidebar.tsx` | Menu-item. |
| `src/app/(app)/page.tsx` | De dashboardtegel. |

---

### Task 1: Schema en database

**Files:**
- Modify: `prisma/schema.prisma`

**Interfaces:**
- Produces: `RecurringTemplate`, enum `BillingMode`, en op `Project`: `templateId`, `quantity`, `approvedCount`, `rejectedCount`, `deliveredAt`, `generatedInvoiceId`.

- [ ] **Step 1: Voeg de enum en de tabel toe**

Zet dit in `prisma/schema.prisma`, ná het blok `enum ProjectStatus { ... }`:

```prisma
enum BillingMode {
  PER_UNIT
  FIXED
  /// Nog niet gebouwd; staat er zodat de derde manier later past zonder het
  /// model om te gooien. De voltooiroute weigert hem met een melding.
  HOURS
}

model RecurringTemplate {
  id              String      @id @default(cuid())
  name            String
  customerId      String
  customer        Customer    @relation(fields: [customerId], references: [id])
  billing         BillingMode @default(PER_UNIT)
  /// Prijs per stuk, of het vaste bedrag bij FIXED.
  unitPrice       Decimal?    @db.Decimal(10, 2)
  /// Voorgesteld aantal bij een nieuwe batch. Voor H3X: 120.
  defaultQuantity Decimal?    @db.Decimal(10, 2)
  /// De omschrijving van de factuurregel: "Testen H3X batterij omvormers".
  lineDescription String
  /// Het onderwerp van de factuur: "Factuur H3X testen".
  invoiceSubject  String?
  /// Testwerk telt goedkeur en afkeur; een vast bedrag niet.
  tracksQuality   Boolean     @default(false)
  archivedAt      DateTime?
  createdAt       DateTime    @default(now())
  updatedAt       DateTime    @updatedAt
  projects        Project[]
}
```

- [ ] **Step 2: Voeg de velden toe aan `Project`**

In `model Project`, direct ná `plannedEnd`:

```prisma
  /// Uit welk sjabloon deze batch komt. Leeg voor een gewoon project: een batch
  /// is een project, want dan houdt hij vanzelf zijn eigen uren en planning.
  templateId      String?
  template        RecurringTemplate? @relation(fields: [templateId], references: [id])
  /// Het gefactureerde aantal. Altijd gevuld bij een voltooide batch, ook als
  /// er geen goed- en afkeur wordt bijgehouden — dit is wat op de factuur komt.
  quantity        Decimal?           @db.Decimal(10, 2)
  /// De uitsplitsing, alleen bij testwerk. Samen zijn ze gelijk aan quantity;
  /// de route rekent quantity daaruit en gelooft geen totaal van de client.
  approvedCount   Decimal?           @db.Decimal(10, 2)
  rejectedCount   Decimal?           @db.Decimal(10, 2)
  deliveredAt     DateTime?          @db.Date
  /// De conceptfactuur die uit deze batch is voortgekomen. Uniek: één batch
  /// levert er hoogstens één op.
  generatedInvoiceId String?         @unique
  generatedInvoice   Invoice?        @relation("BatchInvoice", fields: [generatedInvoiceId], references: [id])
```

- [ ] **Step 3: Voeg de tegenvelden toe**

Prisma eist voor beide relaties een tegenveld. In `model Invoice`, bij de andere relaties:

```prisma
  /// Tegenveld van Project.generatedInvoice. Wordt nergens gelezen; Prisma
  /// eist hem voor de een-op-een-relatie.
  batch       Project?            @relation("BatchInvoice")
```

En in `model Customer`, bij `projects` en `invoices`:

```prisma
  recurringTemplates RecurringTemplate[]
```

- [ ] **Step 4: Kopieer `.env.local` naar `.env`**

Prisma leest `.env.local` niet: `prisma.config.ts` doet `import "dotenv/config"` en dat laadt alleen `.env`, dat niet bestaat.

```bash
cp .env.local .env
```

- [ ] **Step 5: Lees de diff vóórdat je iets wegschrijft**

```bash
PATH="$HOME/.nvm/versions/node/v20.20.1/bin:$PATH" npx prisma migrate diff --from-schema-datasource prisma/schema.prisma --to-schema-datamodel prisma/schema.prisma --script
```

Verwacht: één `CREATE TYPE "BillingMode"`, één `CREATE TABLE "RecurringTemplate"`, zes `ALTER TABLE "Project" ADD COLUMN`, één `CREATE UNIQUE INDEX` op `Project.generatedInvoiceId`, en `ADD CONSTRAINT ... FOREIGN KEY` voor de drie nieuwe relaties. **Lees de volledige uitvoer.** Staat er ook maar één `DROP` in, stop dan, push niet, en rapporteer BLOCKED met de volledige uitvoer.

- [ ] **Step 6: Push naar de database**

```bash
PATH="$HOME/.nvm/versions/node/v20.20.1/bin:$PATH" npx prisma db push
```

Bij `P1001` (Neon niet bereikbaar) één keer opnieuw proberen.

- [ ] **Step 7: Ruim `.env` op**

```bash
rm -f .env
```

- [ ] **Step 8: Controleer de client**

```bash
npx tsc --noEmit
```

Verwacht: geen uitvoer.

- [ ] **Step 9: Commit**

```bash
git add prisma/schema.prisma
git commit -m "feat: sjabloon en batchvelden voor herhaalprojecten"
```

---

### Task 2: Pure functies — aantallen, naam en inleiding

**Files:**
- Create: `src/lib/recurring.ts`
- Create: `src/lib/recurring.test.ts`

**Interfaces:**
- Consumes: `MAANDEN` en `formatDate` uit `./utils`.
- Produces:
  - `type BillingMode = "PER_UNIT" | "FIXED" | "HOURS"`
  - `type BatchInput = { quantity?: number | null; approved?: number | null; rejected?: number | null }`
  - `batchTotal(invoer: BatchInput, tracksQuality: boolean): number`
  - `suggestBatchName(sjabloonnaam: string, vandaag: Date): string`
  - `recurringInvoiceIntro(opts): string`

- [ ] **Step 1: Schrijf de falende tests**

Maak `src/lib/recurring.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { batchTotal, suggestBatchName, recurringInvoiceIntro } from "./recurring";

describe("batchTotal", () => {
  it("adds up approved and rejected for test work — everything tested is billed", () => {
    // Dit is de kern: 118 goedgekeurd en 2 afgekeurd betekent 120 op de factuur.
    expect(batchTotal({ approved: 118, rejected: 2 }, true)).toBe(120);
  });

  it("takes the plain quantity when quality is not tracked", () => {
    expect(batchTotal({ quantity: 50 }, false)).toBe(50);
  });

  it("ignores the plain quantity when quality is tracked, so the two cannot disagree", () => {
    expect(batchTotal({ quantity: 999, approved: 10, rejected: 1 }, true)).toBe(11);
  });

  it("treats missing numbers as nothing", () => {
    expect(batchTotal({}, true)).toBe(0);
    expect(batchTotal({}, false)).toBe(0);
    expect(batchTotal({ approved: 5 }, true)).toBe(5);
  });
});

describe("suggestBatchName", () => {
  it("puts month and year behind the template name", () => {
    expect(suggestBatchName("H3X testen", new Date(2026, 7, 20))).toBe("H3X testen AUG26");
  });

  it("uses the same month abbreviations as the rest of the app", () => {
    expect(suggestBatchName("SAJ - EVO", new Date(2026, 2, 1))).toBe("SAJ - EVO MRT26");
  });

  it("crosses the turn of the year", () => {
    expect(suggestBatchName("H3X testen", new Date(2027, 0, 5))).toBe("H3X testen JAN27");
  });
});

describe("recurringInvoiceIntro", () => {
  const basis = {
    batchnaam: "H3X testen AUG26",
    opgeleverdOp: "2026-08-20",
    totaal: 120,
    tracksQuality: true,
    approved: 118,
    rejected: 2,
  };

  it("names the batch, the delivery date and the breakdown", () => {
    expect(recurringInvoiceIntro(basis)).toBe(
      "Hierbij ontvangt u de factuur voor H3X testen AUG26, opgeleverd op 20-AUG-2026. " +
        "Van de 120 geteste exemplaren zijn er 118 goedgekeurd en 2 afgekeurd.",
    );
  });

  it("leaves out the breakdown when quality is not tracked", () => {
    expect(recurringInvoiceIntro({ ...basis, tracksQuality: false, approved: null, rejected: null })).toBe(
      "Hierbij ontvangt u de factuur voor H3X testen AUG26, opgeleverd op 20-AUG-2026.",
    );
  });

  it("writes the date as DD-MMM-YYYY and never as ISO", () => {
    expect(recurringInvoiceIntro(basis)).toContain("20-AUG-2026");
    expect(recurringInvoiceIntro(basis)).not.toContain("2026-08-20");
  });

  it("keeps the sentence readable when nothing was rejected", () => {
    const alles = { ...basis, totaal: 120, approved: 120, rejected: 0 };
    expect(recurringInvoiceIntro(alles)).toContain("zijn er 120 goedgekeurd en 0 afgekeurd");
  });
});
```

- [ ] **Step 2: Draai de tests en zie ze falen**

```bash
PATH="$HOME/.nvm/versions/node/v20.20.1/bin:$PATH" npx vitest run src/lib/recurring.test.ts
```

Verwacht: FAIL, "Failed to resolve import ./recurring".

- [ ] **Step 3: Schrijf `src/lib/recurring.ts`**

```ts
import { MAANDEN, formatDate } from "./utils";

/**
 * Herhaalprojecten: terugkerend productie- en testwerk dat telkens hetzelfde
 * factuurtje oplevert.
 *
 * Geen React en geen Prisma, zodat het te testen is zonder database en zonder
 * scherm — de conventie van dit project.
 */
export type BillingMode = "PER_UNIT" | "FIXED" | "HOURS";

export type BatchInput = {
  /** Bij een sjabloon dat geen goed- en afkeur bijhoudt. */
  quantity?: number | null;
  approved?: number | null;
  rejected?: number | null;
};

/**
 * Het te factureren aantal.
 *
 * Bij testwerk is dat de som van goedgekeurd en afgekeurd: alles is getest, dus
 * alles wordt gefactureerd. Een batch van 118 goedgekeurd en 2 afgekeurd levert
 * dus een factuur van 120 op.
 *
 * Eén functie voor scherm en server, zodat het bedrag dat je in het venster ziet
 * gegarandeerd hetzelfde is als wat er op de factuur komt.
 */
export function batchTotal(invoer: BatchInput, tracksQuality: boolean): number {
  if (tracksQuality) return Number(invoer.approved ?? 0) + Number(invoer.rejected ?? 0);
  return Number(invoer.quantity ?? 0);
}

/**
 * De voorgestelde naam van een nieuwe batch: `H3X testen AUG26`.
 *
 * Sluit aan op de naamgeving die er met de hand al was — `IOmodule (Prod. JUN26
 * 50x)`, `ACQstacks 10x JUL26` — en gebruikt dezelfde maandafkortingen als elke
 * datum in de app. Een voorstel, geen dwang: het scherm laat hem aanpassen.
 */
export function suggestBatchName(sjabloonnaam: string, vandaag: Date): string {
  const maand = MAANDEN[vandaag.getMonth()];
  const jaar = String(vandaag.getFullYear()).slice(-2);
  return `${sjabloonnaam} ${maand}${jaar}`;
}

/**
 * De inleidende zin boven de factuurregels.
 *
 * De aantallen staan hier en niet in de regelomschrijving: de zin vertelt het
 * verhaal — wat er getest is, wat eruit kwam, wanneer het is opgeleverd — en de
 * regel houdt het totaal met het bedrag.
 */
export function recurringInvoiceIntro(opts: {
  batchnaam: string;
  opgeleverdOp: Date | string;
  totaal: number;
  tracksQuality: boolean;
  approved?: number | null;
  rejected?: number | null;
}): string {
  const eerste = `Hierbij ontvangt u de factuur voor ${opts.batchnaam}, opgeleverd op ${formatDate(opts.opgeleverdOp)}.`;
  if (!opts.tracksQuality) return eerste;
  return (
    `${eerste} Van de ${opts.totaal} geteste exemplaren zijn er ` +
    `${Number(opts.approved ?? 0)} goedgekeurd en ${Number(opts.rejected ?? 0)} afgekeurd.`
  );
}
```

`MAANDEN` is al geëxporteerd uit `src/lib/utils.ts` (regel 20) — dat is eerder gebeurd voor de tijdas van de planning. Je hoeft daar niets aan te doen.

- [ ] **Step 4: Draai de tests en zie ze slagen**

```bash
PATH="$HOME/.nvm/versions/node/v20.20.1/bin:$PATH" npx vitest run src/lib/recurring.test.ts
```

Verwacht: PASS, 11 tests.

- [ ] **Step 5: Commit**

```bash
git add src/lib/recurring.ts src/lib/recurring.test.ts
git commit -m "feat: aantallen, batchnaam en factuurinleiding voor herhaalprojecten"
```

---

### Task 3: Pure functies — de conceptfactuur en de weigeringen

**Files:**
- Modify: `src/lib/recurring.ts`
- Modify: `src/lib/recurring.test.ts`

**Interfaces:**
- Consumes: `batchTotal`, `recurringInvoiceIntro` uit taak 2.
- Produces:
  - `type RecurringTemplateData` en `type BatchData` (zie de code hieronder)
  - `recurringInvoiceDraft(sjabloon, batch, invoer): { subject: string; intro: string; line: {...}; subtotal: number }`
  - `completeBatchDenial(sjabloon, batch, invoer): string | null`

- [ ] **Step 1: Schrijf de falende tests**

Voeg onderaan `src/lib/recurring.test.ts` toe, en breid de importregel uit met `recurringInvoiceDraft` en `completeBatchDenial`:

```ts
const sjabloon = (over: Partial<Parameters<typeof recurringInvoiceDraft>[0]> = {}) => ({
  id: "t1",
  name: "H3X testen",
  customerId: "k-zonneplan",
  billing: "PER_UNIT" as const,
  unitPrice: "20.00",
  defaultQuantity: "120",
  lineDescription: "Testen H3X batterij omvormers",
  invoiceSubject: "Factuur H3X testen",
  tracksQuality: true,
  ...over,
});

const batch = (over = {}) => ({
  id: "p1",
  name: "H3X testen AUG26",
  generatedInvoiceId: null as string | null,
  deliveredAt: "2026-08-20",
  ...over,
});

const invoer = { approved: 118, rejected: 2 };

describe("recurringInvoiceDraft", () => {
  it("bills the total, not the approved count", () => {
    // De twee handmatige voorlopers, 2026-0007 en 2026-0008, waren precies dit:
    // 120 x € 20,00 = € 2.400,00.
    const d = recurringInvoiceDraft(sjabloon(), batch(), invoer);
    expect(d.line.quantity).toBe(120);
    expect(d.line.unitPrice).toBe(20);
    expect(d.line.total).toBe(2400);
    expect(d.subtotal).toBe(2400);
  });

  it("takes subject and line description from the template", () => {
    const d = recurringInvoiceDraft(sjabloon(), batch(), invoer);
    expect(d.subject).toBe("Factuur H3X testen");
    expect(d.line.description).toBe("Testen H3X batterij omvormers");
    expect(d.line.lineType).toBe("OTHER");
  });

  it("falls back to the batch name when the template has no subject", () => {
    // Een factuur zonder onderwerp leest als een fout; de batchnaam is altijd
    // beter dan niets.
    const d = recurringInvoiceDraft(sjabloon({ invoiceSubject: null }), batch(), invoer);
    expect(d.subject).toBe("H3X testen AUG26");
  });

  it("puts the counts in the intro", () => {
    const d = recurringInvoiceDraft(sjabloon(), batch(), invoer);
    expect(d.intro).toContain("118 goedgekeurd en 2 afgekeurd");
    expect(d.intro).toContain("20-AUG-2026");
  });

  it("bills a fixed amount as one unit", () => {
    const vast = sjabloon({ billing: "FIXED", tracksQuality: false, unitPrice: "750.00" });
    const d = recurringInvoiceDraft(vast, batch(), { quantity: 1 });
    expect(d.line.quantity).toBe(1);
    expect(d.line.total).toBe(750);
  });
});

describe("completeBatchDenial", () => {
  it("allows a normal batch", () => {
    expect(completeBatchDenial(sjabloon(), batch(), invoer)).toBeNull();
  });

  it("refuses a batch that already has an invoice", () => {
    expect(completeBatchDenial(sjabloon(), batch({ generatedInvoiceId: "f1" }), invoer)).toBe(
      "Deze batch is al gefactureerd. Verwijder eerst de conceptfactuur als je opnieuw wilt beginnen.",
    );
  });

  it("refuses billing by hours, which is not built yet", () => {
    expect(completeBatchDenial(sjabloon({ billing: "HOURS" }), batch(), invoer)).toBe(
      "Factureren op uren is nog niet beschikbaar voor herhaalprojecten.",
    );
  });

  it("refuses a template without a rate, and says where to fix it", () => {
    expect(completeBatchDenial(sjabloon({ unitPrice: null }), batch(), invoer)).toBe(
      "Stel eerst een tarief in op het sjabloon.",
    );
    expect(completeBatchDenial(sjabloon({ unitPrice: "0" }), batch(), invoer)).toBe(
      "Stel eerst een tarief in op het sjabloon.",
    );
  });

  it("refuses a batch with nothing to bill", () => {
    expect(completeBatchDenial(sjabloon(), batch(), { approved: 0, rejected: 0 })).toBe(
      "Vul een aantal groter dan nul in.",
    );
  });

  it("refuses negative numbers", () => {
    expect(completeBatchDenial(sjabloon(), batch(), { approved: -1, rejected: 5 })).toBe(
      "Een aantal kan niet negatief zijn.",
    );
  });
});
```

- [ ] **Step 2: Draai de tests en zie ze falen**

```bash
PATH="$HOME/.nvm/versions/node/v20.20.1/bin:$PATH" npx vitest run src/lib/recurring.test.ts
```

Verwacht: FAIL, "recurringInvoiceDraft is not a function".

- [ ] **Step 3: Breid `src/lib/recurring.ts` uit**

```ts
export type RecurringTemplateData = {
  id: string;
  name: string;
  customerId: string;
  billing: BillingMode;
  /** Prisma levert Decimal als string aan. */
  unitPrice: number | string | null;
  defaultQuantity: number | string | null;
  lineDescription: string;
  invoiceSubject: string | null;
  tracksQuality: boolean;
};

export type BatchData = {
  id: string;
  name: string;
  generatedInvoiceId: string | null;
  deliveredAt: Date | string;
};

/** Eén factuurregel plus de bijbehorende kopteksten. */
export type RecurringDraft = {
  subject: string;
  intro: string;
  line: {
    description: string;
    quantity: number;
    unitPrice: number;
    total: number;
    lineType: "OTHER";
  };
  subtotal: number;
};

/**
 * De conceptfactuur die uit een voltooide batch volgt.
 *
 * Eén regel van het type OTHER: dit is geen tijd- of kilometerregistratie maar
 * een afgesproken stukprijs, en die hoort niet aan uren gekoppeld te worden.
 */
export function recurringInvoiceDraft(
  sjabloon: RecurringTemplateData,
  batch: BatchData,
  invoer: BatchInput,
): RecurringDraft {
  const totaal = batchTotal(invoer, sjabloon.tracksQuality);
  const prijs = Number(sjabloon.unitPrice ?? 0);
  const bedrag = Math.round(totaal * prijs * 100) / 100;

  return {
    // Een factuur zonder onderwerp leest als een fout; de batchnaam is altijd
    // beter dan niets.
    subject: sjabloon.invoiceSubject?.trim() || batch.name,
    intro: recurringInvoiceIntro({
      batchnaam: batch.name,
      opgeleverdOp: batch.deliveredAt,
      totaal,
      tracksQuality: sjabloon.tracksQuality,
      approved: invoer.approved,
      rejected: invoer.rejected,
    }),
    line: {
      description: sjabloon.lineDescription,
      quantity: totaal,
      unitPrice: prijs,
      total: bedrag,
      lineType: "OTHER",
    },
    subtotal: bedrag,
  };
}

/**
 * Waarom een batch niet voltooid mag worden, of `null` als het mag.
 *
 * De volgorde is bewust: eerst wat er niet aan te doen is (al gefactureerd, een
 * manier die nog niet bestaat), dan wat de beheerder moet instellen, dan wat de
 * invoer zelf mankeert. Zo krijgt iemand de melding die hem verder helpt.
 */
export function completeBatchDenial(
  sjabloon: RecurringTemplateData,
  batch: BatchData,
  invoer: BatchInput,
): string | null {
  if (batch.generatedInvoiceId) {
    return "Deze batch is al gefactureerd. Verwijder eerst de conceptfactuur als je opnieuw wilt beginnen.";
  }
  if (sjabloon.billing === "HOURS") {
    return "Factureren op uren is nog niet beschikbaar voor herhaalprojecten.";
  }
  if (Number(sjabloon.unitPrice ?? 0) <= 0) {
    return "Stel eerst een tarief in op het sjabloon.";
  }

  const getallen = [invoer.quantity, invoer.approved, invoer.rejected]
    .filter((n) => n !== null && n !== undefined)
    .map(Number);
  if (getallen.some((n) => n < 0)) return "Een aantal kan niet negatief zijn.";

  if (batchTotal(invoer, sjabloon.tracksQuality) <= 0) return "Vul een aantal groter dan nul in.";
  return null;
}
```

- [ ] **Step 4: Draai de tests en zie ze slagen**

```bash
PATH="$HOME/.nvm/versions/node/v20.20.1/bin:$PATH" npx vitest run src/lib/recurring.test.ts
```

Verwacht: PASS, 22 tests (11 uit taak 2 plus 11 nieuwe).

- [ ] **Step 5: Commit**

```bash
git add src/lib/recurring.ts src/lib/recurring.test.ts
git commit -m "feat: conceptfactuur en weigeringen voor een voltooide batch"
```

---

### Task 4: Gedeelde bouwstenen — betalingstekst en rechten

**Files:**
- Create: `src/lib/invoice-defaults.ts`
- Modify: `src/components/invoices/new-invoice-client.tsx`
- Modify: `src/lib/roles.ts`
- Modify: `src/lib/roles.test.ts`

**Interfaces:**
- Produces: `STANDAARD_BETALINGSTEKST` uit `src/lib/invoice-defaults.ts`; `canManageRecurringTemplates(role)` en `canCompleteRecurringBatch(role)` uit `src/lib/roles.ts`.

- [ ] **Step 1: Verplaats de betalingstekst naar een gedeelde plek**

In `src/components/invoices/new-invoice-client.tsx` staat `STANDAARD_NOTITIE` met de tekst over de betalingstermijn. De server heeft die straks ook nodig voor een gegenereerde factuur, en twee kopieën zouden uiteenlopen.

Maak `src/lib/invoice-defaults.ts`:

```ts
/**
 * De standaardtekst onderaan een factuur.
 *
 * Hier en niet in het factuurscherm, omdat een automatisch gegenereerde factuur
 * hem ook nodig heeft. Twee kopieën zouden vroeg of laat uiteenlopen, en dan
 * staat er op de ene factuur een ander rekeningnummer dan op de andere.
 *
 * De dertig dagen hier horen bij de vervaldatum, die ook op vandaag plus dertig
 * staat.
 */
export const STANDAARD_BETALINGSTEKST =
  "Wij verzoeken u vriendelijk het totaalbedrag binnen 30 dagen over te maken op onze IBAN rekening NL90 INGB 0008 9967 99 t.n.v. EVAbits onder vermelding van het factuurnummer.";
```

Vervang in `new-invoice-client.tsx` de constante door een import uit `@/lib/invoice-defaults`, en laat het bestaande commentaarblok erboven vervallen of verhuizen — de uitleg staat nu in de nieuwe module.

- [ ] **Step 2: Voeg de twee rechten toe**

In `src/lib/roles.ts`: zet in het `can`-blok van **elke** rol de twee sleutels, zodat het bestand een volledige matrix blijft — dat is wat het commentaar bovenaan belooft:

| Rol | `manageRecurringTemplates` | `completeRecurringBatch` |
|---|---|---|
| ADMIN | `true` | `true` |
| FINANCE | `false` | `false` |
| TEAMLEAD | `false` | **`true`** |
| EMPLOYEE | `false` | `false` |

En de helpers bij de andere, onder `canManagePlanning`:

```ts
export function canManageRecurringTemplates(role: string): boolean {
  return role === "ADMIN";
}

/**
 * Een teamleider mag een batch afronden maar ziet de factuur niet: hij rondt het
 * werk af, de beheerder keurt goed en verstuurt.
 */
export function canCompleteRecurringBatch(role: string): boolean {
  return role === "ADMIN" || role === "TEAMLEAD";
}
```

- [ ] **Step 3: Schrijf de tests**

Voeg onderaan `src/lib/roles.test.ts` toe, en zet de twee helpers erbij in de importregel:

```ts
describe("canManageRecurringTemplates", () => {
  it("only lets an admin manage the templates", () => {
    expect(canManageRecurringTemplates("ADMIN")).toBe(true);
    expect(canManageRecurringTemplates("FINANCE")).toBe(false);
    expect(canManageRecurringTemplates("TEAMLEAD")).toBe(false);
    expect(canManageRecurringTemplates("EMPLOYEE")).toBe(false);
  });
});

describe("canCompleteRecurringBatch", () => {
  it("lets an admin and a team lead finish a batch", () => {
    expect(canCompleteRecurringBatch("ADMIN")).toBe(true);
    expect(canCompleteRecurringBatch("TEAMLEAD")).toBe(true);
  });

  it("keeps everyone else out", () => {
    expect(canCompleteRecurringBatch("FINANCE")).toBe(false);
    expect(canCompleteRecurringBatch("EMPLOYEE")).toBe(false);
    expect(canCompleteRecurringBatch("ONBEKEND")).toBe(false);
  });
});
```

- [ ] **Step 4: Controleer types, tests en build**

```bash
npx tsc --noEmit
```

```bash
PATH="$HOME/.nvm/versions/node/v20.20.1/bin:$PATH" npx vitest run
```

Verwacht: alles groen, met de vijf nieuwe tests erbij.

```bash
DATABASE_URL="postgresql://x:x@localhost:5432/x" PATH="$HOME/.nvm/versions/node/v20.20.1/bin:$PATH" npm run build
```

Verwacht: exitcode 0.

- [ ] **Step 5: Commit**

```bash
git add src/lib/invoice-defaults.ts src/lib/roles.ts src/lib/roles.test.ts src/components/invoices/new-invoice-client.tsx
git commit -m "feat: gedeelde betalingstekst en rechten voor herhaalprojecten"
```

---

### Task 5: Routes voor de sjablonen

**Files:**
- Create: `src/app/api/recurring-templates/route.ts`
- Create: `src/app/api/recurring-templates/[id]/route.ts`

**Interfaces:**
- Consumes: `canManageRecurringTemplates` uit taak 4, `handleError` uit `@/lib/api`.
- Produces: `GET`/`POST` op `/api/recurring-templates`, `PUT`/`DELETE` op `/api/recurring-templates/[id]`.

- [ ] **Step 1: Schrijf de lijst- en aanmaakroute**

Maak `src/app/api/recurring-templates/route.ts`. Volg de vorm van een recente route in dit project, bijvoorbeeld `src/app/api/overtime-adjustments/route.ts`: `auth()`, rolcontrole, `schema.parse`, en alles in `try { ... } catch (e) { return handleError(e); }`.

Het zod-schema:

```ts
const schema = z.object({
  name: z.string().trim().min(1),
  customerId: z.string().min(1),
  billing: z.enum(["PER_UNIT", "FIXED", "HOURS"]).default("PER_UNIT"),
  unitPrice: z.number().positive().optional().nullable(),
  defaultQuantity: z.number().positive().optional().nullable(),
  lineDescription: z.string().trim().min(1),
  invoiceSubject: z.string().trim().optional().nullable(),
  tracksQuality: z.boolean().default(false),
});
```

`GET` geeft de niet-gearchiveerde sjablonen met hun klant, gesorteerd op naam. Beide methodes zijn beheerder-only via `canManageRecurringTemplates`.

- [ ] **Step 2: Schrijf de wijzig- en archiveerroute**

Maak `src/app/api/recurring-templates/[id]/route.ts` met `PUT` (hetzelfde schema) en `DELETE`.

**`DELETE` archiveert, hij verwijdert niet:** aan een sjabloon hangen batches, en die zouden hun herkomst kwijtraken. Zet `archivedAt` op nu. Bestaande batches blijven werken; er kunnen geen nieuwe meer uit.

- [ ] **Step 3: Controleer types en build**

```bash
npx tsc --noEmit
```

```bash
DATABASE_URL="postgresql://x:x@localhost:5432/x" PATH="$HOME/.nvm/versions/node/v20.20.1/bin:$PATH" npm run build
```

Verwacht: exitcode 0, met beide routes in het routeoverzicht.

- [ ] **Step 4: Commit**

```bash
git add src/app/api/recurring-templates
git commit -m "feat: routes om sjablonen voor herhaalprojecten te beheren"
```

---

### Task 6: Een batch starten en voltooien

**Files:**
- Create: `src/app/api/recurring-templates/[id]/batches/route.ts`
- Create: `src/app/api/projects/[id]/complete-batch/route.ts`

**Interfaces:**
- Consumes: alles uit `src/lib/recurring.ts`, `STANDAARD_BETALINGSTEKST`, `canCompleteRecurringBatch`, `canManageRecurringTemplates`, `nextInvoiceNumber` uit `@/lib/invoice-number`.
- Produces: `POST /api/recurring-templates/[id]/batches` en `POST /api/projects/[id]/complete-batch`.

- [ ] **Step 1: Schrijf de route die een batch start**

`POST /api/recurring-templates/[id]/batches` met body `{ name?: string }`. Beheerder-only.

Hij maakt een `Project` aan met de klant van het sjabloon, `status: "ACTIVE"`, `templateId`, en de naam uit de body of anders `suggestBatchName(sjabloon.name, new Date())`. Een gearchiveerd sjabloon wordt geweigerd met een Nederlandse melding.

Let op: `Project.name` is **uniek** in dit schema. Botst de naam, dan vertaalt `handleError` de `P2002` al naar een 409 met "Deze waarde is al in gebruik" — dat is hier verwarrend. Vang het af met een eigen controle en de melding dat er al een project met die naam bestaat.

- [ ] **Step 2: Schrijf de voltooiroute**

Maak `src/app/api/projects/[id]/complete-batch/route.ts`:

```ts
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { z } from "zod";
import { canCompleteRecurringBatch } from "@/lib/roles";
import { handleError } from "@/lib/api";
import { batchTotal, completeBatchDenial, recurringInvoiceDraft } from "@/lib/recurring";
import { STANDAARD_BETALINGSTEKST } from "@/lib/invoice-defaults";
import { nextInvoiceNumber } from "@/lib/invoice-number";

const schema = z.object({
  deliveredAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Datum als jjjj-mm-dd"),
  quantity: z.number().optional().nullable(),
  approved: z.number().optional().nullable(),
  rejected: z.number().optional().nullable(),
});

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await auth();
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const role = (session.user as any)?.role ?? "EMPLOYEE";
    if (!canCompleteRecurringBatch(role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const { id } = await params;
    const data = schema.parse(await req.json());

    const batch = await prisma.project.findUnique({
      where: { id },
      include: { template: true },
    });
    if (!batch) return NextResponse.json({ error: "Not found" }, { status: 404 });
    if (!batch.template) {
      return NextResponse.json({ error: "Dit project komt niet uit een herhaalsjabloon" }, { status: 400 });
    }

    const opgeleverd = new Date(`${data.deliveredAt}T00:00:00Z`);
    const invoer = { quantity: data.quantity, approved: data.approved, rejected: data.rejected };
    const batchData = {
      id: batch.id,
      name: batch.name,
      generatedInvoiceId: batch.generatedInvoiceId,
      deliveredAt: data.deliveredAt,
    };

    const weigering = completeBatchDenial(batch.template as any, batchData, invoer);
    if (weigering) return NextResponse.json({ error: weigering }, { status: 400 });

    // De server rekent het aantal en het bedrag zelf uit; wat de client toont is
    // een voorbeeld en geen bewijs.
    const draft = recurringInvoiceDraft(batch.template as any, batchData, invoer);
    const totaal = batchTotal(invoer, batch.template.tracksQuality);

    // 21%, hetzelfde vaste percentage dat POST /api/invoices als standaard
    // hanteert. Er is geen instelling voor het btw-tarief: de kolom op Invoice
    // heeft @default(21) en het factuurscherm laat het per factuur aanpassen.
    const btw = 21;
    const btwBedrag = Math.round((draft.subtotal * btw) / 100 * 100) / 100;
    const invoiceNumber = await nextInvoiceNumber();

    // Alles in één transactie: een halve uitvoering laat een voltooid project
    // achter zonder factuur, of een factuur die aan niets hangt.
    const factuur = await prisma.$transaction(async (tx) => {
      const inv = await tx.invoice.create({
        data: {
          invoiceNumber,
          customerId: batch.template!.customerId,
          issueDate: new Date(),
          dueDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
          status: "DRAFT",
          subject: draft.subject,
          intro: draft.intro,
          notes: STANDAARD_BETALINGSTEKST,
          vatRate: btw,
          subtotal: draft.subtotal,
          vatAmount: btwBedrag,
          total: draft.subtotal + btwBedrag,
          lines: { create: [{ ...draft.line, sortOrder: 0 }] },
        },
      });

      await tx.project.update({
        where: { id: batch.id },
        data: {
          status: "COMPLETED",
          deliveredAt: opgeleverd,
          quantity: totaal,
          approvedCount: batch.template!.tracksQuality ? Number(data.approved ?? 0) : null,
          rejectedCount: batch.template!.tracksQuality ? Number(data.rejected ?? 0) : null,
          generatedInvoiceId: inv.id,
        },
      });

      return inv;
    });

    return NextResponse.json({ invoiceId: factuur.id, invoiceNumber: factuur.invoiceNumber }, { status: 201 });
  } catch (e) { return handleError(e); }
}
```

Het btw-tarief is nagekeken: er is géén instelling voor. `Invoice.vatRate` heeft `@default(21)` in het schema en `POST /api/invoices` gebruikt een zod-default van 21. Deze route volgt dat; het tarief blijft per factuur aanpasbaar in het factuurscherm.

- [ ] **Step 3: Controleer types, tests en build**

```bash
npx tsc --noEmit
```

```bash
PATH="$HOME/.nvm/versions/node/v20.20.1/bin:$PATH" npx vitest run
```

```bash
DATABASE_URL="postgresql://x:x@localhost:5432/x" PATH="$HOME/.nvm/versions/node/v20.20.1/bin:$PATH" npm run build
```

Verwacht: exitcode 0, met beide nieuwe routes in het overzicht.

- [ ] **Step 4: Commit**

```bash
git add "src/app/api/recurring-templates/[id]/batches" "src/app/api/projects/[id]/complete-batch"
git commit -m "feat: batch starten en voltooien met een conceptfactuur"
```

---

### Task 7: De pagina Herhaalprojecten

**Files:**
- Create: `src/app/(app)/herhaalprojecten/page.tsx`
- Create: `src/components/recurring/recurring-client.tsx`
- Modify: `src/components/layout/sidebar.tsx`

**Interfaces:**
- Consumes: alle routes uit taken 5 en 6; `batchTotal` en `recurringInvoiceDraft` uit `@/lib/recurring` om het voorbeeld in het venster te tonen.
- Produces: niets voor latere taken.

- [ ] **Step 1: Schrijf de server-pagina**

Volg `src/app/(app)/planning/page.tsx` als voorbeeld: rol controleren met `canCompleteRecurringBatch` en anders `redirect("/")`, gegevens ophalen, `serialize(...)`, doorgeven.

Haal op: de niet-gearchiveerde sjablonen met hun klant, en de projecten met een `templateId` (de batches) met hun sjabloon en hun eventuele factuur. Geef ook de rol door, zodat het scherm weet of het de sjabloonbeheer mag tonen.

- [ ] **Step 2: Schrijf het component**

Maak `src/components/recurring/recurring-client.tsx`, in de vorm van de andere beheerschermen (`src/components/customers/customers-client.tsx` is een goed voorbeeld van lijst plus venster).

Twee `Card`-blokken:

- **Sjablonen** — alleen tonen als de rol ze mag beheren. Per sjabloon: naam, klant, hoe er gefactureerd wordt, het tarief, en knoppen om te wijzigen, te archiveren en een nieuwe batch te starten. Het aanmaakvenster heeft velden voor alle sjabloonvelden, met een schakelaar "houdt goed- en afkeur bij".
- **Lopende batches** — de batches met status `ACTIVE`, met naam, klant, startdatum en een knop "Voltooien". Daaronder de voltooide batches met hun factuurnummer, zodat je kunt terugzien wat eruit gekomen is.

- [ ] **Step 3: Bouw het voltooivenster**

Het venster toont, afhankelijk van `tracksQuality`, twee velden (goedgekeurd, afgekeurd) of één (aantal), plus de opleverdatum met vandaag als standaard.

Reken met `batchTotal` en `recurringInvoiceDraft` **live** uit wat de factuur wordt, en toon dat onder de velden: `118 + 2 = 120 × €20,00 = €2.400,00`. Dat is dezelfde functie die de server straks gebruikt, dus wat je ziet is wat je krijgt.

Bevestigen roept `POST /api/projects/[id]/complete-batch` aan. Bij een fout toon je `body.error`; bij succes ververs je met `router.refresh()` en meld je welk factuurnummer er klaarstaat.

- [ ] **Step 4: Zet het menu-item in de zijbalk**

De groep **Beheer** staat op `roles: ["ADMIN"]`, en het filter op regel 184 (`if (group.roles && !group.roles.includes(role)) return null;`) verbergt dan de héle groep voor een teamleider. Die beperking verruimen zou hem ook Klanten, Gebruikers en Loonverwerking tonen.

Maak daarom een **eigen groep**, net zoals eerder voor Planning is gedaan. Zet hem tussen de groep "Team" en de groep "Personeel":

```tsx
  {
    label: "Herhaalprojecten",
    roles: ["ADMIN", "TEAMLEAD"],
    items: [
      { href: "/herhaalprojecten", label: "Batches", icon: Repeat },
    ],
  },
```

Het icoon `Repeat` bestaat in de geïnstalleerde `lucide-react` (nagekeken); voeg hem toe aan de import bovenaan.

- [ ] **Step 5: Controleer types, tests en build**

```bash
npx tsc --noEmit
```

```bash
PATH="$HOME/.nvm/versions/node/v20.20.1/bin:$PATH" npx vitest run
```

```bash
DATABASE_URL="postgresql://x:x@localhost:5432/x" PATH="$HOME/.nvm/versions/node/v20.20.1/bin:$PATH" npm run build
```

Verwacht: exitcode 0, met `/herhaalprojecten` in het routeoverzicht.

- [ ] **Step 6: Commit**

```bash
git add "src/app/(app)/herhaalprojecten" src/components/recurring src/components/layout/sidebar.tsx
git commit -m "feat: pagina voor herhaalprojecten en het voltooien van een batch"
```

---

### Task 8: De dashboardtegel

**Files:**
- Modify: `src/app/(app)/page.tsx`

**Interfaces:**
- Consumes: niets nieuws.
- Produces: niets. Dit is de laatste taak.

- [ ] **Step 1: Tel de conceptfacturen**

In `src/app/(app)/page.tsx` staat al een `Promise.all` met de gegevens voor het dashboard, en een tegel "Nog te factureren" die alleen voor beheerders verschijnt. Voeg een query toe die de conceptfacturen telt en hun totaalbedrag optelt:

```ts
    prisma.invoice.aggregate({
      where: { status: "DRAFT" },
      _count: true,
      _sum: { total: true },
    }),
```

- [ ] **Step 2: Zet de tegel neer**

Naast "Nog te factureren", met dezelfde `Card`-vorm en dezelfde voorwaarde dat er iets te melden valt: alleen tonen als het aantal groter is dan nul.

De tegel toont het aantal conceptfacturen en het totaalbedrag met `formatCurrency`, en is een link naar `/invoices`. Gebruik `FileCheck` als icoon; die bestaat in de geïnstalleerde `lucide-react` (nagekeken).

**Wie hem ziet:** de bestaande tegel staat achter `isAdmin && teFactureren.length > 0`. Volg dat: `isAdmin && concepten._count > 0`. Een teamleider mag geen factuurbedragen zien, en die komt op het dashboard sowieso niet langs deze tegel.

- [ ] **Step 3: Controleer types, tests en build**

```bash
npx tsc --noEmit
```

```bash
PATH="$HOME/.nvm/versions/node/v20.20.1/bin:$PATH" npx vitest run
```

```bash
DATABASE_URL="postgresql://x:x@localhost:5432/x" PATH="$HOME/.nvm/versions/node/v20.20.1/bin:$PATH" npm run build
```

Verwacht: exitcode 0.

- [ ] **Step 4: Commit**

```bash
git add "src/app/(app)/page.tsx"
git commit -m "feat: dashboardtegel voor conceptfacturen die op goedkeuring wachten"
```

---

## Klaar wanneer

- Een beheerder legt een sjabloon vast en start daaruit een batch met een voorgestelde naam.
- Een beheerder of teamleider voltooit die batch via een venster dat de aantallen en de opleverdatum bevestigt en live toont wat de factuur wordt.
- Er staat daarna een conceptfactuur klaar met de juiste klant, het onderwerp uit het sjabloon, één regel met het totaal maal het tarief, en een inleiding die de batch, de opleverdatum en bij testwerk de goed- en afkeur noemt.
- Het dashboard toont hoeveel concepten op goedkeuring wachten.
- Een teamleider ziet alleen de herhaalprojecten en komt niet bij de facturen.
- Een batch levert hoogstens één factuur op.
- `npx tsc --noEmit` is schoon, `npm run build` geeft exitcode 0 en de volledige vitest-suite is groen.
