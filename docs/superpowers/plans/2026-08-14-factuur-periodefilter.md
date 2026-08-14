# Periodefilter bij het aanmaken van een factuur — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bij het aanmaken van een factuur filtert een van-tot periode wat je kunt aanvinken, standaard de vorige kalendermaand, met een kopvinkje om alles in één keer aan of uit te zetten.

**Architecture:** Er verandert niets aan de API of het schema. De pagina haalt al alle openstaande regels van de klant op; er komt één pure functie bij die die lijst splitst in "binnen de periode" en "ervóór nog open", en het scherm werkt vanaf dan uitsluitend met het eerste deel. Dat de achterstand in dezelfde berekening zit is het punt: een standaard van vorige maand mag geen werk uit beeld laten verdwijnen.

**Tech Stack:** Next.js 16 (App Router), React 19, Tailwind, vitest.

**Spec:** `docs/superpowers/specs/2026-08-14-factuur-periodefilter-design.md`

## Global Constraints

- Testen zijn in deze repo uitsluitend voor pure functies, in `src/lib/*.test.ts`. Er is geen DOM-testomgeving (`vitest.config.mts` draait `environment: "node"`); schrijf geen component- of routetests.
- Geen schemawijziging, geen migratie, geen API-wijziging. De routes `/api/time` en `/api/km` kennen `from` en `to` al, maar die worden hier bewust niet gebruikt — zie de architectuur hierboven.
- "Vorige maand" komt uit de bestaande `resolvePeriod("last-month", now)` in `src/lib/periods.ts`. Er komt geen tweede manier bij om dat uit te rekenen.
- Datums die uit de API komen zijn volledige ISO-tijdstempels (`2026-07-14T00:00:00.000Z`); vergelijken gebeurt op de dag, dus op `.slice(0, 10)`.
- Verbind niets met de database. `npm test`, `npx tsc --noEmit` en `npm run build` zijn genoeg.
- `npx` en `npm test` hebben het voorvoegsel `PATH="$HOME/.nvm/versions/node/v20.20.1/bin:$PATH"` nodig; `npm run build` daarnaast `DATABASE_URL="postgresql://x:x@localhost:5432/x"` (prisma generate eist dat de variabele bestaat, maar maakt geen verbinding).
- Commit-berichten in het Nederlands, met de trailer `Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>`.
- Commentaar in het Nederlands, dat uitlegt wáárom; volg de dichtheid van de omringende code.

---

## Bestandsoverzicht

| Bestand | Verantwoordelijkheid | Taak |
|---|---|---|
| `src/lib/invoice-period.ts` | Nieuw. Splitst een lijst regels in "binnen de periode" en "ervóór nog open". | 1 |
| `src/lib/invoice-period.test.ts` | Nieuw. Testen daarvan. | 1 |
| `src/components/invoices/new-invoice-client.tsx` | De datumvelden, het filteren, de achterstandsregel, het opschonen van de selectie (taak 2) en de twee kopvinkjes (taak 3). | 2, 3 |

---

### Task 1: De periodesplitsing

**Files:**
- Create: `src/lib/invoice-period.ts`
- Create: `src/lib/invoice-period.test.ts`

**Interfaces:**
- Produces: `splitInvoicePeriod<T extends { date: string }>(entries: T[], from: string, to: string): { binnen: T[]; ervoorAantal: number; ervoorOudste: string | null }`. `from` en `to` zijn `YYYY-MM-DD` en horen er allebei bij (inclusief). `ervoorOudste` is `YYYY-MM-DD` of `null`. Taak 2 gebruikt hem voor de urenlijst en de km-lijst apart.

**Achtergrond:** de regels komen uit `/api/time` en `/api/km` en hebben een `date` die als volledige ISO-tijdstempel is geserialiseerd. Vergelijken op de hele string zou werken zolang het tijdstip altijd middernacht UTC is, maar dat is een aanname over de database die hier niet thuishoort; vergelijk daarom op de eerste tien tekens. Omdat `YYYY-MM-DD` lexicografisch én chronologisch dezelfde volgorde heeft, is `<=` op strings hier juist — er hoeft geen `Date` aan te pas te komen.

- [ ] **Step 1: Schrijf de falende testen**

Maak `src/lib/invoice-period.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { splitInvoicePeriod } from "./invoice-period";

// Zoals de API ze levert: een volledige ISO-tijdstempel, geen kale datum.
const regel = (id: string, dag: string) => ({ id, date: `${dag}T00:00:00.000Z` });

describe("splitInvoicePeriod", () => {
  it("keeps the first and last day of the period", () => {
    const regels = [regel("a", "2026-07-01"), regel("b", "2026-07-31")];
    const uitkomst = splitInvoicePeriod(regels, "2026-07-01", "2026-07-31");
    expect(uitkomst.binnen.map((r) => r.id)).toEqual(["a", "b"]);
    expect(uitkomst.ervoorAantal).toBe(0);
  });

  it("counts the day before the period as backlog", () => {
    const regels = [regel("oud", "2026-06-30"), regel("nieuw", "2026-07-01")];
    const uitkomst = splitInvoicePeriod(regels, "2026-07-01", "2026-07-31");
    expect(uitkomst.binnen.map((r) => r.id)).toEqual(["nieuw"]);
    expect(uitkomst.ervoorAantal).toBe(1);
    expect(uitkomst.ervoorOudste).toBe("2026-06-30");
  });

  it("ignores an entry after the period entirely", () => {
    // Wie in augustus juli factureert heeft altijd openstaande augustusregels.
    // Dat is de factuur van volgende maand, geen achterstand.
    const regels = [regel("later", "2026-08-03")];
    const uitkomst = splitInvoicePeriod(regels, "2026-07-01", "2026-07-31");
    expect(uitkomst.binnen).toEqual([]);
    expect(uitkomst.ervoorAantal).toBe(0);
    expect(uitkomst.ervoorOudste).toBeNull();
  });

  it("reports the earliest date of everything before the period", () => {
    const regels = [
      regel("a", "2026-03-15"),
      regel("b", "2026-01-14"),
      regel("c", "2026-06-30"),
    ];
    const uitkomst = splitInvoicePeriod(regels, "2026-07-01", "2026-07-31");
    expect(uitkomst.ervoorAantal).toBe(3);
    expect(uitkomst.ervoorOudste).toBe("2026-01-14");
  });

  it("gives no oldest date when nothing precedes the period", () => {
    const uitkomst = splitInvoicePeriod([regel("a", "2026-07-10")], "2026-07-01", "2026-07-31");
    expect(uitkomst.ervoorAantal).toBe(0);
    expect(uitkomst.ervoorOudste).toBeNull();
  });

  it("handles an empty list", () => {
    expect(splitInvoicePeriod([], "2026-07-01", "2026-07-31")).toEqual({
      binnen: [],
      ervoorAantal: 0,
      ervoorOudste: null,
    });
  });

  it("compares on the day, not on the timestamp", () => {
    // Een regel laat op de laatste dag van de periode hoort er nog bij; op de
    // hele tijdstempel vergelijken zou hem eruit gooien.
    const laat = { id: "laat", date: "2026-07-31T22:30:00.000Z" };
    const uitkomst = splitInvoicePeriod([laat], "2026-07-01", "2026-07-31");
    expect(uitkomst.binnen.map((r) => r.id)).toEqual(["laat"]);
  });

  it("keeps the order the entries came in", () => {
    // De lijst komt gesorteerd uit de API; die volgorde is wat het scherm toont.
    const regels = [regel("a", "2026-07-20"), regel("b", "2026-07-02")];
    const uitkomst = splitInvoicePeriod(regels, "2026-07-01", "2026-07-31");
    expect(uitkomst.binnen.map((r) => r.id)).toEqual(["a", "b"]);
  });
});
```

- [ ] **Step 2: Draai de testen en controleer dat ze falen**

Run: `PATH="$HOME/.nvm/versions/node/v20.20.1/bin:$PATH" npm test -- invoice-period`
Verwacht: FAIL — `src/lib/invoice-period.ts` bestaat nog niet.

- [ ] **Step 3: Schrijf de functie**

Maak `src/lib/invoice-period.ts`:

```ts
/**
 * Splitst openstaande regels in wat binnen de gekozen factuurperiode valt en
 * wat er van vóór die periode nog openstaat.
 *
 * Die tweede helft is het hele punt van deze functie. Het scherm stelt
 * standaard de vorige kalendermaand voor, en zonder tegenwicht zou alles wat
 * daarvóór is blijven liggen stilletjes uit beeld verdwijnen en nooit meer
 * gefactureerd worden.
 *
 * Regels ná de periode tellen in geen van beide mee: wie in augustus juli
 * factureert heeft altijd openstaande augustusregels, en dat is de factuur van
 * volgende maand, geen achterstand.
 *
 * `from` en `to` zijn `YYYY-MM-DD` en horen er allebei bij. De datums van de
 * regels zijn volledige ISO-tijdstempels, dus er wordt op de eerste tien
 * tekens vergeleken: op de hele tijdstempel vergelijken zou een regel van
 * laat op de laatste dag buiten de periode gooien. `YYYY-MM-DD` heeft
 * lexicografisch dezelfde volgorde als chronologisch, dus `<=` op strings
 * volstaat en er hoeft geen `Date` aan te pas te komen.
 */
export function splitInvoicePeriod<T extends { date: string }>(
  entries: T[],
  from: string,
  to: string,
): { binnen: T[]; ervoorAantal: number; ervoorOudste: string | null } {
  const binnen: T[] = [];
  let ervoorAantal = 0;
  let ervoorOudste: string | null = null;

  for (const e of entries) {
    const dag = e.date.slice(0, 10);
    if (dag < from) {
      ervoorAantal++;
      if (ervoorOudste === null || dag < ervoorOudste) ervoorOudste = dag;
    } else if (dag <= to) {
      binnen.push(e);
    }
  }

  return { binnen, ervoorAantal, ervoorOudste };
}
```

- [ ] **Step 4: Draai de testen en controleer dat ze slagen**

Run: `PATH="$HOME/.nvm/versions/node/v20.20.1/bin:$PATH" npm test -- invoice-period`
Verwacht: PASS, alle acht testen.

- [ ] **Step 5: Draai de hele suite en de typecontrole**

Run: `PATH="$HOME/.nvm/versions/node/v20.20.1/bin:$PATH" npm test`
Verwacht: PASS.

Run: `PATH="$HOME/.nvm/versions/node/v20.20.1/bin:$PATH" npx tsc --noEmit`
Verwacht: geen uitvoer.

- [ ] **Step 6: Commit**

```bash
git add src/lib/invoice-period.ts src/lib/invoice-period.test.ts
git commit -m "feat: splits openstaande regels in periode en achterstand

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 2: De periode op het factuurscherm

**Files:**
- Modify: `src/components/invoices/new-invoice-client.tsx` — imports (`:1-18`), state (`:33-45`), afgeleide waarden (na de bestaande `useEffect` op `:47-56`), en het blok "Niet-gefactureerde registraties" (`:171-262`)

**Interfaces:**
- Consumes: `splitInvoicePeriod<T extends { date: string }>(entries: T[], from: string, to: string): { binnen: T[]; ervoorAantal: number; ervoorOudste: string | null }` uit `@/lib/invoice-period` (taak 1), en `resolvePeriod(preset, now): { from: string; to: string } | null` uit `@/lib/periods` — die geeft alleen `null` terug voor de preset `"custom"`, dus voor `"last-month"` mag je het resultaat met `!` uitpakken.
- Produces: de variabelen `zichtbaarTijd` en `zichtbaarKm` (de gefilterde lijsten) waar taak 3 zijn kopvinkjes op baseert.

**Achtergrond:** de component haalt in een `useEffect` alle regels van de klant op en zet ze in `unbilledTime` en `unbilledKm`. Die twee blijven ongefilterd — daar zit de achterstand in. Alles wat het scherm toont en gebruikt gaat vanaf nu door `zichtbaarTijd` en `zichtbaarKm`. Dat onderscheid is de kern van deze taak: één plek waar gefilterd wordt, en overal daarna de gefilterde lijst, zodat er niets op de factuur kan belanden wat niet in beeld staat.

- [ ] **Step 1: Voeg de imports toe**

In `src/components/invoices/new-invoice-client.tsx`, bij de andere imports uit `@/lib`:

```ts
import { resolvePeriod } from "@/lib/periods";
import { splitInvoicePeriod } from "@/lib/invoice-period";
```

- [ ] **Step 2: Voeg de periodestate toe**

Direct onder `const [dueDate, setDueDate] = useState(...)`:

```ts
  // Er wordt vrijwel altijd één kalendermaand gefactureerd, en bij het
  // aanmaken is dat de maand die net voorbij is. resolvePeriod is dezelfde
  // functie die de rapportagefilters gebruiken; hij geeft alleen null voor de
  // preset "custom".
  const [periodeVan, setPeriodeVan] = useState(() => resolvePeriod("last-month", new Date())!.from);
  const [periodeTot, setPeriodeTot] = useState(() => resolvePeriod("last-month", new Date())!.to);
```

- [ ] **Step 3: Leid de zichtbare lijsten en de achterstand af**

Direct onder de bestaande `useEffect` die de regels ophaalt:

```ts
  // unbilledTime en unbilledKm blijven ongefilterd — daar zit de achterstand
  // in. Alles wat het scherm toont en gebruikt gaat door de zichtbare lijsten,
  // zodat er niets op de factuur kan belanden wat je niet in beeld hebt.
  const tijdSplitsing = splitInvoicePeriod(unbilledTime, periodeVan, periodeTot);
  const kmSplitsing = splitInvoicePeriod(unbilledKm, periodeVan, periodeTot);
  const zichtbaarTijd = tijdSplitsing.binnen;
  const zichtbaarKm = kmSplitsing.binnen;

  const achterstandAantal = tijdSplitsing.ervoorAantal + kmSplitsing.ervoorAantal;
  // De oudste van de twee lijsten. Sorteren mag op de string, want YYYY-MM-DD
  // loopt lexicografisch gelijk met de kalender.
  const achterstandOudste =
    [tijdSplitsing.ervoorOudste, kmSplitsing.ervoorOudste]
      .filter((d): d is string => d !== null)
      .sort()[0] ?? null;
```

- [ ] **Step 4: Laat de selectie de periode volgen**

Direct onder het blok uit stap 3:

```ts
  // Een aangevinkte regel die buiten de nieuwe periode valt zou onzichtbaar
  // meeliften naar de factuur. Teruggeven van dezelfde Set wanneer er niets
  // afvalt is nodig: een nieuwe Set zou elke render opnieuw state zetten.
  useEffect(() => {
    const zichtbaar = new Set(zichtbaarTijd.map((e) => e.id));
    setSelectedTimeIds((prev) => {
      const next = new Set([...prev].filter((id) => zichtbaar.has(id)));
      return next.size === prev.size ? prev : next;
    });
    const zichtbaarK = new Set(zichtbaarKm.map((e) => e.id));
    setSelectedKmIds((prev) => {
      const next = new Set([...prev].filter((id) => zichtbaarK.has(id)));
      return next.size === prev.size ? prev : next;
    });
    // zichtbaarTijd en zichtbaarKm zijn elke render nieuwe arrays en kunnen
    // dus geen dependency zijn; de waarden waaruit ze volgen wel.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [periodeVan, periodeTot, unbilledTime, unbilledKm]);
```

- [ ] **Step 5: Zet de datumvelden boven de lijsten**

In het blok `{customerId && (unbilledTime.length > 0 || unbilledKm.length > 0) && (`, als eerste kind van `<CardContent className="space-y-4">`:

```tsx
            <div className="grid grid-cols-2 gap-3 sm:max-w-md">
              <div className="space-y-1">
                <Label>Van</Label>
                <Input type="date" value={periodeVan} onChange={(e) => setPeriodeVan(e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label>Tot en met</Label>
                <Input type="date" value={periodeTot} onChange={(e) => setPeriodeTot(e.target.value)} />
              </div>
            </div>
```

- [ ] **Step 6: Laat de tabellen de zichtbare lijsten tonen**

In datzelfde blok, vervang in de urensectie `unbilledTime` door `zichtbaarTijd` op alle drie de plekken: de voorwaarde `{unbilledTime.length > 0 && (`, de tarief-waarschuwing `{unbilledTime.some((e) => resolveHourRate(e) == null) && (` en de rijen `{unbilledTime.map((e) => {`.

Vervang in de kilometersectie `unbilledKm` door `zichtbaarKm` op beide plekken: de voorwaarde `{unbilledKm.length > 0 && (` en de rijen `{unbilledKm.map((e) => (`.

Laat de buitenste voorwaarde op regel 171 (`customerId && (unbilledTime.length > 0 || unbilledKm.length > 0)`) staan zoals hij is: die gaat over of er überhaupt iets openstaat bij deze klant, en de kaart moet ook verschijnen wanneer de periode leeg is maar er wél achterstand is.

- [ ] **Step 7: Zeg het wanneer de periode leeg is**

Direct na het blok met de kilometertabel, nog binnen `<CardContent>`:

```tsx
            {zichtbaarTijd.length === 0 && zichtbaarKm.length === 0 && (
              <p className="text-sm text-muted-foreground">
                Geen registraties in deze periode.
              </p>
            )}
```

- [ ] **Step 8: Zet de achterstandsregel eronder**

Direct na het blok uit stap 7, als laatste kind van `<CardContent>`:

```tsx
            {achterstandAantal > 0 && achterstandOudste !== null && (
              <div className="flex flex-wrap items-center gap-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm dark:border-amber-900 dark:bg-amber-950/30">
                <span>
                  Nog {achterstandAantal} {achterstandAantal === 1 ? "regel" : "regels"} open van
                  vóór deze periode, oudste {formatDate(achterstandOudste)}.
                </span>
                <Button size="sm" variant="outline" onClick={() => setPeriodeVan(achterstandOudste)}>
                  Periode oprekken
                </Button>
              </div>
            )}
```

`formatDate` komt uit `@/lib/utils` en is in dit bestand al geïmporteerd.

- [ ] **Step 9: Laat de selectie ook op de zichtbare lijst werken bij het toevoegen**

In `addLinesFromSelection`, vervang de twee regels die de selectie omzetten naar regels:

```ts
    const selectedTime = zichtbaarTijd.filter((e) => selectedTimeIds.has(e.id));
```

en

```ts
    const selectedKm = zichtbaarKm.filter((e) => selectedKmIds.has(e.id));
```

De effect uit stap 4 houdt de selectie al binnen de periode; dit is de tweede grendel op dezelfde deur, en hij kost niets.

- [ ] **Step 10: Typecontrole, testen en build**

Run: `PATH="$HOME/.nvm/versions/node/v20.20.1/bin:$PATH" npx tsc --noEmit`
Verwacht: geen uitvoer.

Run: `PATH="$HOME/.nvm/versions/node/v20.20.1/bin:$PATH" npm test`
Verwacht: PASS. Er komen geen testen bij: dit is React, en dat wordt in deze repo niet automatisch getest.

Run: `DATABASE_URL="postgresql://x:x@localhost:5432/x" PATH="$HOME/.nvm/versions/node/v20.20.1/bin:$PATH" npm run build`
Verwacht: de build slaagt.

- [ ] **Step 11: Commit**

```bash
git add src/components/invoices/new-invoice-client.tsx
git commit -m "feat: periodefilter bij het aanmaken van een factuur

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 3: Alles aan- en uitvinken

**Files:**
- Modify: `src/components/invoices/new-invoice-client.tsx` — een klein component boven `NewInvoiceClient`, en de twee lege kolomkoppen in de tabellen

**Interfaces:**
- Consumes: `zichtbaarTijd` en `zichtbaarKm` uit taak 2 — de gefilterde lijsten regels, elk met een `id`. Verder `resolveHourRate(entry)` uit `@/lib/rates`, al geïmporteerd in dit bestand, die `null` geeft wanneer een urenregel geen tarief heeft.
- Produces: niets voor latere taken; dit is de laatste.

**Achtergrond:** beide tabellen hebben al een lege kolomkop (`<TableHead className="w-8"></TableHead>`) boven de kolom met vinkjes. Daar komt het kopvinkje.

Let op één ding in de urentabel: het vinkje van een regel is `disabled={rate == null}` — een urenregel zonder tarief kan niet geselecteerd worden. Het kopvinkje moet daarom over de selecteerbare regels gaan en niet over alle zichtbare, anders staat hij nooit op "alles aan" zodra er één regel zonder tarief tussen staat. Bij kilometers speelt dat niet: die vinkjes zijn nooit uitgeschakeld.

- [ ] **Step 1: Schrijf het kopvinkje**

Zet dit boven `export function NewInvoiceClient(`, na de bestaande `interface`-declaraties:

```tsx
/**
 * Het vinkje in de kolomkop dat een hele lijst aan- of uitzet.
 *
 * `ids` zijn de regels waar het over gaat: bij uren alleen de selecteerbare
 * (een regel zonder tarief heeft een uitgeschakeld vinkje), anders zou de kop
 * nooit op "alles aan" komen te staan.
 *
 * De halve stand is `indeterminate`, en dat is geen attribuut maar een
 * eigenschap van het element — hij moet dus via een ref gezet worden. De ref
 * geeft bewust niets terug: React 19 leest een teruggegeven waarde als
 * opruimfunctie.
 */
function AllesVinkje({
  ids,
  geselecteerd,
  onChange,
}: {
  ids: string[];
  geselecteerd: Set<string>;
  onChange: (next: Set<string>) => void;
}) {
  const aantalAan = ids.filter((id) => geselecteerd.has(id)).length;
  const allesAan = ids.length > 0 && aantalAan === ids.length;

  return (
    <input
      type="checkbox"
      className="h-4 w-4"
      title={allesAan ? "Alles uitvinken" : "Alles aanvinken"}
      checked={allesAan}
      disabled={ids.length === 0}
      ref={(el) => {
        if (el) el.indeterminate = aantalAan > 0 && !allesAan;
      }}
      onChange={() => {
        const next = new Set(geselecteerd);
        for (const id of ids) {
          if (allesAan) next.delete(id);
          else next.add(id);
        }
        onChange(next);
      }}
    />
  );
}
```

- [ ] **Step 2: Zet het kopvinkje boven de urentabel**

In de urentabel, vervang de lege kolomkop `<TableHead className="w-8"></TableHead>` door:

```tsx
                      <TableHead className="w-8">
                        <AllesVinkje
                          ids={zichtbaarTijd.filter((e) => resolveHourRate(e) != null).map((e) => e.id)}
                          geselecteerd={selectedTimeIds}
                          onChange={setSelectedTimeIds}
                        />
                      </TableHead>
```

- [ ] **Step 3: Zet het kopvinkje boven de kilometertabel**

In de kilometertabel, vervang de lege kolomkop `<TableHead className="w-8"></TableHead>` door:

```tsx
                      <TableHead className="w-8">
                        <AllesVinkje
                          ids={zichtbaarKm.map((e) => e.id)}
                          geselecteerd={selectedKmIds}
                          onChange={setSelectedKmIds}
                        />
                      </TableHead>
```

- [ ] **Step 4: Typecontrole, testen en build**

Run: `PATH="$HOME/.nvm/versions/node/v20.20.1/bin:$PATH" npx tsc --noEmit`
Verwacht: geen uitvoer. Klaagt hij dat `setSelectedTimeIds` geen `(next: Set<string>) => void` is, dan is de prop `onChange` verkeerd getypt — `useState`'s setter accepteert een waarde én een functie, en een waarde volstaat hier.

Run: `PATH="$HOME/.nvm/versions/node/v20.20.1/bin:$PATH" npm test`
Verwacht: PASS.

Run: `DATABASE_URL="postgresql://x:x@localhost:5432/x" PATH="$HOME/.nvm/versions/node/v20.20.1/bin:$PATH" npm run build`
Verwacht: de build slaagt.

- [ ] **Step 5: Commit**

```bash
git add src/components/invoices/new-invoice-client.tsx
git commit -m "feat: alles aan- en uitvinken bij het kiezen van registraties

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Handmatige controle na afloop

Dit is React en dat wordt hier niet automatisch getest; loop het in de draaiende app na:

1. Kies een klant met openstaande regels: de velden Van en Tot staan op de vorige kalendermaand en de lijst toont alleen die maand.
2. De achterstandsregel verschijnt met een aantal en de oudste datum (in productie staat er werk open tot januari). "Periode oprekken" zet Van op die datum en de lijst wordt langer.
3. Zet Van en Tot op een periode zonder regels: er staat "Geen registraties in deze periode", en de achterstandsregel klopt nog steeds.
4. Vink een paar regels aan en verzet daarna de periode zodat ze erbuiten vallen: de selectie is weg en "Toevoegen aan factuur" is weer uitgeschakeld.
5. Het kopvinkje boven de urentabel zet alle regels mét tarief aan, staat half bij een deelselectie, en zet ze weer uit. Regels zonder tarief blijven uitgeschakeld en tellen niet mee.
6. Hetzelfde kopvinkje boven de kilometertabel.
7. Voeg een selectie toe aan de factuur: er komen alleen regels op die je ook echt in beeld had.
