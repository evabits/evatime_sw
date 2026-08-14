# Contract dupliceren — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Een contract van een medewerker is te dupliceren, zodat het opvolgende contract niet veld voor veld opnieuw ingetypt hoeft te worden.

**Architecture:** Er komt geen tweede formulier en geen nieuwe API-route. Dezelfde contractdialoog krijgt een derde toestand naast toevoegen en bewerken: dupliceren, met de waarden van het bron-contract al ingevuld en een begindatum die volgt uit de einddatum van dat bron-contract plus één dag. Heeft het bron-contract nog geen einddatum, dan vraagt de dialoog daar eerst om en zet die met een `PUT` op het origineel vóór het nieuwe contract wordt aangemaakt.

**Tech Stack:** Next.js 16 (App Router), React 19, react-hook-form + zod, vitest.

**Spec:** `docs/superpowers/specs/2026-08-14-contract-dupliceren-design.md`

## Global Constraints

- Testen zijn in deze repo uitsluitend voor pure functies, in `src/lib/*.test.ts`. Er is geen DOM-testomgeving (`vitest.config.mts` draait `environment: "node"`); schrijf geen component- of routetests.
- Datumrekenwerk in UTC, met `YYYY-MM-DD` in en uit. Nooit `getDay()`, `getDate()` of `setDate()` — gebruik de UTC-varianten, zoals `src/lib/working-days.ts` dat doet.
- Geen schemawijziging, geen migratie, geen nieuwe API-route.
- Verbind niets met de database. `npm test`, `npx tsc --noEmit` en `npm run build` zijn genoeg.
- `npx`, `npm test` en `npm run build` hebben het voorvoegsel `PATH="$HOME/.nvm/versions/node/v20.20.1/bin:$PATH"` nodig; zonder dat mist de systeem-node `crypto.getRandomValues` en start vitest niet. `npm run build` heeft daarnaast `DATABASE_URL="postgresql://x:x@localhost:5432/x"` als voorvoegsel nodig: `prisma generate` eist dat de variabele bestaat, maar maakt geen verbinding.
- Commit-berichten in het Nederlands, met de trailer `Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>`.
- Commentaar in het Nederlands, dat uitlegt wáárom; volg de dichtheid van de omringende code.

---

## Bestandsoverzicht

| Bestand | Verantwoordelijkheid | Taak |
|---|---|---|
| `src/lib/contracts.ts` | Pure contracthulpjes. Krijgt `nextDay` erbij. | 1 |
| `src/lib/contracts.test.ts` | Testen daarvan. | 1 |
| `src/components/personeel/contracts-client.tsx` | De contracttabel en -dialoog: kopieerknop, derde dialoogtoestand, einddatum van het bron-contract, opslaan in twee stappen. | 2 |

---

### Task 1: `nextDay`

**Files:**
- Modify: `src/lib/contracts.ts` (toevoegen aan het eind van het bestand)
- Test: `src/lib/contracts.test.ts` (nieuw `describe`-blok binnen het bestaande `describe("contracts", ...)`)

**Interfaces:**
- Produces: `nextDay(date: string): string` — neemt `YYYY-MM-DD` en geeft de volgende kalenderdag in dezelfde vorm. Taak 2 gebruikt hem om de begindatum van het nieuwe contract te bepalen.

**Achtergrond:** `src/lib/contracts.ts` bevat de pure hulpjes rond contracten (`getEffectiveContract`, `fillSalary`, `rangeOverlaps`). Het testbestand heeft één omhullend `describe("contracts", ...)` met daarbinnen een blok per functie; volg die indeling.

Let op: dit is een kalenderdag, geen werkdag. Een contract mag op elke dag beginnen, ook op een zaterdag. Er bestaat in `src/lib/working-days.ts` een `previousWorkingDay`; die is hier uitdrukkelijk niet het model.

- [ ] **Step 1: Schrijf de falende testen**

Voeg in `src/lib/contracts.test.ts`, binnen het omhullende `describe("contracts", ...)` en na het laatste bestaande blok, toe:

```ts
  describe("nextDay", () => {
    it("goes to the next day in the middle of a month", () => {
      expect(nextDay("2026-08-14")).toBe("2026-08-15");
    });

    it("crosses a month boundary", () => {
      expect(nextDay("2026-08-31")).toBe("2026-09-01");
    });

    it("crosses a year boundary", () => {
      expect(nextDay("2026-12-31")).toBe("2027-01-01");
    });

    it("finds the leap day in a leap year", () => {
      expect(nextDay("2028-02-28")).toBe("2028-02-29");
    });

    it("steps off the leap day into March", () => {
      expect(nextDay("2028-02-29")).toBe("2028-03-01");
    });

    it("skips straight to March in a common year", () => {
      expect(nextDay("2026-02-28")).toBe("2026-03-01");
    });
  });
```

En breid de importregel bovenaan dat bestand uit met `nextDay`:

```ts
import { getEffectiveContract, fillSalary, rangeOverlaps, nextDay, WEEKS_PER_MONTH } from "./contracts";
```

- [ ] **Step 2: Draai de testen en controleer dat ze falen**

Run: `PATH="$HOME/.nvm/versions/node/v20.20.1/bin:$PATH" npm test -- contracts`
Verwacht: FAIL — `nextDay` bestaat nog niet.

- [ ] **Step 3: Schrijf de functie**

Voeg aan het eind van `src/lib/contracts.ts` toe:

```ts
/**
 * De volgende kalenderdag, in UTC gerekend.
 *
 * Uitdrukkelijk een kalenderdag en geen werkdag: een contract mag op elke dag
 * ingaan, ook op een zaterdag. Wie hier `previousWorkingDay` uit
 * working-days.ts als voorbeeld neemt, slaat per ongeluk het weekend over.
 *
 * UTC omdat de productieserver op UTC draait en de gebruikers in Amsterdam
 * zitten; `setDate()` rekent lokaal en verschuift dan een dag zonder dat er
 * iets klaagt.
 */
export function nextDay(date: string): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}
```

- [ ] **Step 4: Draai de testen en controleer dat ze slagen**

Run: `PATH="$HOME/.nvm/versions/node/v20.20.1/bin:$PATH" npm test -- contracts`
Verwacht: PASS, alle testen in dit bestand.

- [ ] **Step 5: Draai de hele suite en de typecontrole**

Run: `PATH="$HOME/.nvm/versions/node/v20.20.1/bin:$PATH" npm test`
Verwacht: PASS.

Run: `PATH="$HOME/.nvm/versions/node/v20.20.1/bin:$PATH" npx tsc --noEmit`
Verwacht: geen uitvoer.

- [ ] **Step 6: Commit**

```bash
git add src/lib/contracts.ts src/lib/contracts.test.ts
git commit -m "feat: nextDay voor de begindatum van een opvolgend contract

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 2: Dupliceren in de contractdialoog

**Files:**
- Modify: `src/components/personeel/contracts-client.tsx` — importregels (`:17-19`), state van de component (rond `:57-60`), de berekening van `hasOverlap` (rond `:73-79`), `openAdd`/`openEdit`/`close` (`:81-112`), `onSubmit` (`:114-133`), de knoppenkolom in de tabel (rond `:242-251`), de dialoogtitel (`:264`) en het formulier (`:266` en verder)

**Interfaces:**
- Consumes: `nextDay(date: string): string` uit `@/lib/contracts` (taak 1) — `YYYY-MM-DD` in en uit.
- Produces: niets voor latere taken; dit is de laatste.

**Achtergrond — lees dit voordat je begint:**

De dialoog kent nu twee toestanden, die aan `editingId` hangen: is die gezet, dan is het bewerken (`PUT /api/contracts/<id>`), anders toevoegen (`POST /api/contracts` met `userId` erbij). Er komt een derde bij, dupliceren, die aan een nieuwe state `duplicerenVan` hangt. Dupliceren slaat op als een nieuw contract, dus `editingId` blijft daarbij `null`.

Het zod-schema van het formulier beschrijft één contract. De einddatum die het bron-contract nog mist hoort daar niet in — die gaat over een ánder contract. Hij krijgt daarom een eigen `useState`, niet een veld in het schema.

De API-route `src/app/api/contracts/route.ts` valideert de body met `contractBodySchema`. Twee dingen om te weten bij het samenstellen van de `PUT`-body in stap 5: getalvelden mogen `null` zijn (`z.coerce.number().positive().optional().nullable()`), maar tekst- en datumvelden niet — `jobTitle`, `notes`, `startDate` en `endDate` zijn `z.string().optional().or(z.literal(""))` en moeten dus `""` krijgen in plaats van `null`.

- [ ] **Step 1: Voeg het kopieericoon toe aan de imports**

In `src/components/personeel/contracts-client.tsx`, vervang de lucide-importregel:

```ts
import { Plus, Pencil, Trash2, Paperclip, Copy } from "lucide-react";
```

En breid de import uit `@/lib/contracts` uit:

```ts
import { getEffectiveContract, rangeOverlaps, nextDay } from "@/lib/contracts";
```

- [ ] **Step 2: Voeg de state voor het dupliceren toe**

Direct onder `const [editingId, setEditingId] = useState<string | null>(null);`:

```ts
  // Het contract waarvan gedupliceerd wordt. Niet null betekent: de dialoog
  // staat in de derde toestand. editingId blijft daarbij null, want een
  // duplicaat wordt een nieuw contract.
  const [duplicerenVan, setDuplicerenVan] = useState<Contract | null>(null);
  // De einddatum die het bron-contract nog mist. Hoort bij een ánder contract
  // dan het formulier beschrijft, dus staat hij naast het zod-schema.
  const [bronEinddatum, setBronEinddatum] = useState("");
```

- [ ] **Step 3: Laat de bestaande openers de nieuwe toestand opruimen**

In `openAdd`, direct na `setEditingId(null);`:

```ts
    setDuplicerenVan(null);
    setBronEinddatum("");
```

In `openEdit`, direct na `setEditingId(c.id);`:

```ts
    setDuplicerenVan(null);
    setBronEinddatum("");
```

En in `close`, direct na `setEditingId(null);`:

```ts
    setDuplicerenVan(null);
    setBronEinddatum("");
```

- [ ] **Step 4: Voeg de opener voor het dupliceren toe**

Direct onder de functie `openEdit`:

```tsx
  function openDuplicate(c: Contract) {
    setEditingId(null);
    setDuplicerenVan(c);
    setBronEinddatum(c.endDate ?? "");
    form.reset({
      contractType: c.contractType,
      contractHours: c.contractHours ?? undefined,
      vacationHours: c.vacationHours ?? undefined,
      // Het nieuwe contract begint de dag na het oude. Zonder einddatum op het
      // origineel valt er nog niets te berekenen; het veld in de dialoog vult
      // dit alsnog zodra je die datum opgeeft.
      startDate: c.endDate ? nextDay(c.endDate) : "",
      // Uitdrukkelijk een lege string en geen undefined: react-hook-form
      // schrijft undefined niet naar een invoerveld, waardoor de einddatum van
      // een eerder geopend contract zou blijven staan.
      endDate: "",
      salaryMonthly: c.salaryMonthly ?? undefined,
      salaryHourly: c.salaryHourly ?? undefined,
      jobTitle: c.jobTitle ?? undefined,
      ftePercentage: c.ftePercentage ?? undefined,
      notes: c.notes ?? undefined,
    });
    setServerError("");
    setDialogOpen(true);
  }
```

- [ ] **Step 5: Laat opslaan het bron-contract eerst afsluiten**

Vervang `onSubmit` door:

```tsx
  async function onSubmit(data: FormData) {
    setLoading(true);
    setServerError("");

    // Dupliceren van een contract dat nog doorloopt: dat krijgt eerst zijn
    // einddatum. Anders sluiten de twee niet op elkaar aan en overlappen ze.
    // De overige velden gaan onveranderd mee, want PUT vervangt de hele body.
    // jobTitle, notes en de datums moeten "" zijn en niet null: het zod-schema
    // van de route staat daar geen null toe.
    if (duplicerenVan && !duplicerenVan.endDate) {
      const bron = await fetch(`/api/contracts/${duplicerenVan.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contractType: duplicerenVan.contractType,
          contractHours: duplicerenVan.contractHours,
          vacationHours: duplicerenVan.vacationHours,
          startDate: duplicerenVan.startDate ?? "",
          endDate: bronEinddatum,
          salaryMonthly: duplicerenVan.salaryMonthly,
          salaryHourly: duplicerenVan.salaryHourly,
          jobTitle: duplicerenVan.jobTitle ?? "",
          ftePercentage: duplicerenVan.ftePercentage,
          notes: duplicerenVan.notes ?? "",
        }),
      });
      if (!bron.ok) {
        setLoading(false);
        const err = await bron.json();
        setServerError(err.error ?? "Fout bij het bijwerken van het bestaande contract");
        return;
      }
    }

    const url = editingId ? `/api/contracts/${editingId}` : "/api/contracts";
    const method = editingId ? "PUT" : "POST";
    const body = editingId ? data : { userId: user.id, ...data };
    const res = await fetch(url, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    setLoading(false);
    if (res.ok) {
      close();
      router.refresh();
    } else {
      const err = await res.json();
      // Bij het dupliceren staat de einddatum van het bestaande contract er op
      // dit punt al op. Dat is geen schade, maar je moet het weten voordat je
      // het opnieuw probeert.
      const staart =
        duplicerenVan && !duplicerenVan.endDate
          ? " De einddatum van het bestaande contract is wel opgeslagen."
          : "";
      setServerError((err.error ?? "Fout bij opslaan") + staart);
    }
  }
```

- [ ] **Step 6: Zet de kopieerknop in de tabel**

In de laatste `TableCell` van een contractrij staan nu twee knoppen. Zet de kopieerknop vóór het potlood, zodat de prullenbak de laatste blijft:

```tsx
                          <Button variant="ghost" size="icon" onClick={() => openDuplicate(c)} title="Dupliceren">
                            <Copy className="h-3.5 w-3.5" />
                          </Button>
```

- [ ] **Step 7: Geef de dialoog zijn derde titel**

Vervang de titelregel:

```tsx
            <DialogTitle>
              {editingId ? "Contract bewerken" : duplicerenVan ? "Contract dupliceren" : "Contract toevoegen"}
            </DialogTitle>
```

- [ ] **Step 8: Vraag om de einddatum van het bron-contract**

Direct onder de openingsregel van het formulier (`<form onSubmit={form.handleSubmit(onSubmit)} className="space-y-3">`), als eerste blok binnen het formulier:

```tsx
            {duplicerenVan && !duplicerenVan.endDate && (
              <div className="space-y-1 rounded-md border border-amber-200 bg-amber-50 p-3 dark:border-amber-900 dark:bg-amber-950/30">
                <Label>Einddatum bestaand contract</Label>
                <Input
                  type="date"
                  value={bronEinddatum}
                  onChange={(e) => {
                    setBronEinddatum(e.target.value);
                    // De begindatum van het nieuwe contract volgt hieruit, dus
                    // die schuift mee terwijl je typt.
                    form.setValue("startDate", e.target.value ? nextDay(e.target.value) : "");
                  }}
                />
                <p className="text-xs text-muted-foreground">
                  Het bestaande contract loopt nog door. Het nieuwe contract begint de dag erna.
                </p>
              </div>
            )}
```

- [ ] **Step 9: Blokkeer opslaan zolang die einddatum ontbreekt**

Vervang de opslaanknop in de `DialogFooter`:

```tsx
              <Button type="submit" disabled={loading || (duplicerenVan !== null && !bronEinddatum)}>
                {loading ? "Opslaan..." : "Opslaan"}
              </Button>
```

- [ ] **Step 10: Laat de overlapwaarschuwing het bron-contract negeren**

De waarschuwing "deze periode overlapt met een bestaand contract" kijkt naar alle contracten behalve het contract dat bewerkt wordt. Bij het dupliceren van een contract dat nog doorloopt zou hij daardoor altijd afgaan: dat contract heeft in de lijst nog geen einddatum, terwijl het er in dezelfde handeling een krijgt. Vervang daarom de berekening van `hasOverlap`:

```ts
  const hasOverlap = initialContracts.some((c) => {
    if (c.id === editingId) return false;
    // Het bron-contract van een duplicaat krijgt in dezelfde handeling zijn
    // einddatum, dus overlapt het straks niet meer. Zonder deze regel gaat de
    // waarschuwing af op een overlap die je net aan het opheffen bent.
    if (c.id === duplicerenVan?.id) return false;
    return rangeOverlaps(
      watchedStart || null, watchedEnd || null,
      c.startDate, c.endDate,
    );
  });
```

- [ ] **Step 11: Typecontrole, testen en build**

Run: `PATH="$HOME/.nvm/versions/node/v20.20.1/bin:$PATH" npx tsc --noEmit`
Verwacht: geen uitvoer.

Run: `PATH="$HOME/.nvm/versions/node/v20.20.1/bin:$PATH" npm test`
Verwacht: PASS. Er komen in deze taak geen testen bij: dit is React, en dat wordt in deze repo niet automatisch getest.

Run: `DATABASE_URL="postgresql://x:x@localhost:5432/x" PATH="$HOME/.nvm/versions/node/v20.20.1/bin:$PATH" npm run build`
Verwacht: de build slaagt.

- [ ] **Step 12: Commit**

```bash
git add src/components/personeel/contracts-client.tsx
git commit -m "feat: contract dupliceren vanaf de contracttabel

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Handmatige controle na afloop

Dit is React en dat wordt hier niet automatisch getest; loop het in de draaiende app na:

1. Dupliceer een contract mét einddatum (Jort Oosterveld heeft er een): de dialoog heet "Contract dupliceren", de begindatum staat op de dag ná die einddatum, de einddatum is leeg en de rest is overgenomen.
2. Dupliceer een contract zónder einddatum (de meeste): bovenin staat het gele blok, de opslaanknop is grijs, en zodra je de einddatum invult verschijnt de begindatum van het nieuwe contract.
3. Sla dat op: er staan twee contracten die op elkaar aansluiten, zonder overlapwaarschuwing, en het oude heeft nu een einddatum.
4. Open daarna "Contract toevoegen": het formulier is leeg, zonder resten van het duplicaat.
5. Dupliceer een contract zonder salaris meteen nadat je een contract mét salaris hebt bewerkt: de salarisvelden horen leeg te zijn. Blijven ze staan, dan schrijft react-hook-form `undefined` niet naar het invoerveld en moeten die velden net als `endDate` een lege string krijgen.
6. Bijlagen van het bron-contract horen niet mee te komen.
