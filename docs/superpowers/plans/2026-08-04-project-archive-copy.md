# Project Archive & Copy Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Maak projectnamen uniek in de hele app, laat een project met één klik gekopieerd worden met al zijn instellingen, en laat meerdere projecten tegelijk archiveren.

**Architecture:** Vier losse stukken die elkaar nauwelijks raken. De naamregel is een `@unique` in het schema plus één gedeelde helper `projectNameTakenError` in `src/lib/api.ts` die beide projectroutes aanroepen, zodat ze niet uit elkaar kunnen lopen. Kopiëren voegt geen servercode toe: het hergebruikt het bestaande formulier en de bestaande `POST`, en de enige nieuwe code is een gedeelde `fillForm`-functie waar zowel bewerken als kopiëren doorheen gaat. Bulk archiveren is één nieuwe route met één `updateMany` plus een selectiekolom in de tabel. Het rolgat op vier bestaande routes wordt met vier identieke regels gedicht.

**Tech Stack:** Next.js 16 (App Router), React 19, TypeScript, Prisma 6 + PostgreSQL, zod 3, react-hook-form, Radix UI, Tailwind 4, vitest, lucide-react.

## Global Constraints

- **Node 20 is vereist.** De standaard-node in deze shell is v16 en npm weigert daarop te draaien. Prefix élk npm- of npx-commando met `source ~/.nvm/nvm.sh && nvm use 20 &&`.
- **Er is een live PRODUCTIEDATABASE bereikbaar via `.env.local`,** met echte uren en verstuurde facturen. Draai NOOIT `npm run db:push`, `npm run db:migrate`, of een script met `--write`. Lezen mag. Een mens voert de migratie uit bij de uitrol.
- Prisma leest `.env.local` niet vanzelf: `prisma.config.ts` doet `import "dotenv/config"`, wat alleen `.env` laadt. Laad hem expliciet met `set -a; . ./.env.local; set +a` vóór een leescommando.
- Na een wijziging aan `prisma/schema.prisma`: `DATABASE_URL="postgresql://x:x@localhost:5432/x" npx prisma generate`. De dummy-URL garandeert dat je niet bij productie komt; genereren raakt geen database aan.
- Dit project heeft geen `prisma/migrations`-map en gebruikt `db:push`. Wijzig alleen `prisma/schema.prisma`; schrijf geen migratiebestanden.
- **Dit is niet de Next.js die je kent.** Lees `node_modules/next/dist/docs/` voordat je aannames doet. Clientcomponenten hebben `"use client"` nodig; route-params zijn een Promise (`const { id } = await params`).
- `src/lib/roles.ts` is canoniek voor rolcontroles. `(session.user as any)?.role ?? "EMPLOYEE"` is de vaste manier waarop deze codebase de rol van de sessie leest.
- **Alle zichtbare tekst is Nederlands.** De naamweigering luidt exact `Er bestaat al een project met deze naam`, met status 400.
- **Uniciteit is hoofdletterongevoelig en gearchiveerde projecten tellen mee.** Een gearchiveerd project bezet zijn naam, zodat terugzetten nooit botst.
- Testcommando: `npm test`. Baseline: **18 bestanden, 166 tests groen.**
- Lint: `npm run lint`. **De baseline is niet schoon:** 301 errors en 20 warnings, vrijwel allemaal `@typescript-eslint/no-explicit-any`, want deze codebase gebruikt `any` overal. De gate is *geen nieuwe soorten lint-fouten*.
- **`npx tsc --noEmit` meldt 0 fouten over de hele repo en moet dat blijven doen.** Dat is een echt signaal en je belangrijkste gereedschap.
- `npm run build` kan niet draaien zonder `.env`; gebruik `tsc` als vangnet.
- **Testconventie van deze repo, als feit:** er wordt uitsluitend getest op pure functies in `src/lib/*.test.ts` met vitest. Er bestaan geen component-, integratie- of API-tests, en dit traject introduceert dat testtype niet. Dit traject levert daardoor waarschijnlijk geen nieuwe unittests op — de naamcontrole is een database-query en bulk archiveren is één `updateMany`. Blijkt er tijdens het bouwen tóch pure logica te ontstaan die het waard is, voeg dan een test toe volgens dat patroon.

---

## File Structure

**Nieuw:**

| Bestand | Verantwoordelijkheid |
|---|---|
| `src/app/api/projects/bulk-archive/route.ts` | Eén route die een reeks projecten in één `updateMany` archiveert. |

**Gewijzigd:**

| Bestand | Wat |
|---|---|
| `prisma/schema.prisma` | `Project.name` wordt `@unique`. |
| `src/lib/api.ts` | `projectNameTakenError` erbij. |
| `src/app/api/projects/route.ts` | Naam trimmen, naamcontrole, `P2002`-afhandeling. |
| `src/app/api/projects/[id]/route.ts` | Idem, plus `isAdmin` op `DELETE` en `PATCH`. |
| `src/app/api/customers/[id]/route.ts` | `isAdmin` op `DELETE` en `PATCH`. |
| `src/components/projects/projects-client.tsx` | `fillForm`, kopieerknop, selectiekolom, bulkknop. |

`src/components/projects/projects-client.tsx` is 446 regels en groeit hier met ongeveer 60. Dat is
groot maar niet uitzonderlijk voor deze codebase, en de tabel en het formulier delen te veel
toestand om ze nu zinvol te splitsen. Niet opsplitsen in dit traject.

---

## Task 1: Naamuniciteit

**Files:**
- Modify: `prisma/schema.prisma` (het `Project`-model)
- Modify: `src/lib/api.ts` (functie erbij, onderaan)
- Modify: `src/app/api/projects/route.ts`
- Modify: `src/app/api/projects/[id]/route.ts`

**Interfaces:**
- Produces: `projectNameTakenError(name: string, exceptId?: string): Promise<NextResponse | null>` in `src/lib/api.ts` — geeft `null` als de naam vrij is, anders een kant-en-klare 400-response.

**Deze taak levert geen unittests op.** De controle is een Prisma-query; er is geen pure functie
om te testen. De gate is `npx tsc --noEmit` plus de handmatige controles onderaan deze taak.

- [ ] **Step 1: Zet de uniciteitseis in het schema**

In `prisma/schema.prisma`, in `model Project`, wijzig de regel `name String` naar:

```prisma
  name              String                @unique
```

Verder niets aan dit model wijzigen.

- [ ] **Step 2: Genereer de Prisma-client opnieuw**

Run: `source ~/.nvm/nvm.sh && nvm use 20 && DATABASE_URL="postgresql://x:x@localhost:5432/x" npx prisma generate`
Expected: `Generated Prisma Client`. Dit raakt geen database aan.

- [ ] **Step 3: Voeg de gedeelde controle toe aan `src/lib/api.ts`**

Onderaan het bestand, ná `projectMembershipError`:

```ts
/**
 * Geeft een 400-response als er al een project met deze naam bestaat, en null
 * als de naam vrij is.
 *
 * Hoofdletterongevoelig: "Onderhoud" en "onderhoud" zijn voor een mens dezelfde
 * naam, terwijl de @unique in de database dat onderscheid wél maakt. Die unique
 * ligt eronder als vangnet tegen twee mensen die tegelijk opslaan; deze functie
 * is de echte regel.
 *
 * Gearchiveerde projecten worden NIET uitgesloten: die bezetten hun naam, zodat
 * terugzetten nooit op een naamconflict stuit.
 *
 * exceptId sluit het project zelf uit, zodat een project bij het bewerken niet
 * met zijn eigen naam botst.
 */
export async function projectNameTakenError(
  name: string,
  exceptId?: string,
): Promise<NextResponse | null> {
  const clash = await prisma.project.findFirst({
    where: {
      name: { equals: name, mode: "insensitive" },
      ...(exceptId ? { id: { not: exceptId } } : {}),
    },
    select: { id: true },
  });
  if (!clash) return null;
  return NextResponse.json(
    { error: "Er bestaat al een project met deze naam" },
    { status: 400 },
  );
}
```

`prisma` en `NextResponse` worden bovenin dit bestand al geïmporteerd; voeg geen imports toe.

- [ ] **Step 4: Pas `POST /api/projects` aan**

In `src/app/api/projects/route.ts`:

Wijzig de import op regel 5 van `import { handleError } from "@/lib/api";` naar:

```ts
import { handleError, projectNameTakenError } from "@/lib/api";
```

Wijzig in `const schema = z.object({ ... })` de regel `name: z.string().min(1),` naar:

```ts
  name: z.string().trim().min(1),
```

Voeg in `POST`, direct ná het `denial`-blok en vóór `prisma.project.create`, toe:

```ts
    const nameError = await projectNameTakenError(rest.name);
    if (nameError) return nameError;
```

Vervang tot slot de afsluitende `catch` van `POST` — de regel
`} catch (e) { return handleError(e); }` die op `POST` volgt — door:

```ts
  } catch (e: any) {
    // Vangnet voor de @unique: alleen bereikbaar bij twee gelijktijdige opslagen.
    if (e?.code === "P2002") {
      return NextResponse.json({ error: "Er bestaat al een project met deze naam" }, { status: 400 });
    }
    return handleError(e);
  }
}
```

Let op: laat de `catch` van `GET` in hetzelfde bestand ongemoeid.

- [ ] **Step 5: Pas `PUT /api/projects/[id]` aan**

In `src/app/api/projects/[id]/route.ts`:

Wijzig de import op regel 5 naar:

```ts
import { handleError, projectNameTakenError } from "@/lib/api";
```

Wijzig in `const schema = z.object({ ... })` de regel `name: z.string().min(1),` naar:

```ts
  name: z.string().trim().min(1),
```

Voeg in `PUT`, direct ná de regel `const { tags, levelRates, memberIds, ...rest } = schema.parse(await req.json());` en vóór `prisma.project.update`, toe:

```ts
    const nameError = await projectNameTakenError(rest.name, id);
    if (nameError) return nameError;
```

`id` komt uit de regel `const { id } = await params;` die daar al boven staat.

Vervang de afsluitende `catch` van `PUT` door:

```ts
  } catch (e: any) {
    // Vangnet voor de @unique: alleen bereikbaar bij twee gelijktijdige opslagen.
    if (e?.code === "P2002") {
      return NextResponse.json({ error: "Er bestaat al een project met deze naam" }, { status: 400 });
    }
    return handleError(e);
  }
}
```

Laat de `catch` van `GET`, `DELETE` en `PATCH` in dit bestand ongemoeid.

- [ ] **Step 6: Controleer de typen en de tests**

Run: `source ~/.nvm/nvm.sh && nvm use 20 && npx tsc --noEmit`
Expected: geen uitvoer, 0 fouten.

Run: `source ~/.nvm/nvm.sh && nvm use 20 && npm test`
Expected: 18 bestanden, 166 tests, groen. Deze taak voegt geen tests toe en mag er ook geen breken.

- [ ] **Step 7: Controleer de query tegen productie, alleen lezend**

Dit bewijst dat `mode: "insensitive"` werkt op deze database en dat de naam echt vrij ligt.
Het script schrijft niets.

Maak `check-name.ts` in de repo-root (Prisma-scripts moeten vanaf de root draaien, anders wordt
`@prisma/client` niet gevonden):

```ts
import { PrismaClient } from "@prisma/client";
const db = new PrismaClient();
async function main() {
  const one = await db.project.findFirst({ select: { name: true } });
  if (!one) return console.log("geen projecten");
  const upper = await db.project.findFirst({
    where: { name: { equals: one.name.toUpperCase(), mode: "insensitive" } },
    select: { name: true },
  });
  console.log(`"${one.name.toUpperCase()}" vindt hoofdletterongevoelig:`, upper?.name ?? "NIETS");
  const nope = await db.project.findFirst({
    where: { name: { equals: "zzz-bestaat-niet", mode: "insensitive" } },
  });
  console.log("onbestaande naam vindt:", nope ? "IETS (fout)" : "niets (goed)");
}
main().catch(console.error).finally(() => db.$disconnect());
```

Run: `set -a; . ./.env.local; set +a; source ~/.nvm/nvm.sh && nvm use 20 && npx tsx ./check-name.ts; rm -f ./check-name.ts`
Expected: de eerste regel vindt de naam terug ondanks de hoofdletters; de tweede vindt niets.
Verwijder het script daarna — het hoort niet in de commit.

- [ ] **Step 8: Commit**

```bash
git add prisma/schema.prisma src/lib/api.ts src/app/api/projects/route.ts "src/app/api/projects/[id]/route.ts"
git commit -m "feat: projectnamen zijn uniek in de hele app"
```

**Handmatig na te lopen bij de uitrol** (kan nu niet, er is geen draaiende app met de nieuwe kolom):
een project hernoemen naar een bestaande naam, dezelfde naam met andere hoofdletters en met
spaties eromheen, een project opslaan zonder de naam te wijzigen, en een nieuwe naam gebruiken die
al door een gearchiveerd project bezet is.

---

## Task 2: Het rolgat op archiveren en terugzetten dichten

**Files:**
- Modify: `src/app/api/projects/[id]/route.ts` (`DELETE` en `PATCH`)
- Modify: `src/app/api/customers/[id]/route.ts` (`DELETE` en `PATCH`)

**Interfaces:**
- Consumes: `isAdmin` uit `src/lib/roles.ts` — in beide bestanden al geïmporteerd.
- Produces: niets nieuws.

Vier routes archiveren of zetten terug en toetsen vandaag alleen dat er een sessie is. De `PUT`
ernaast in dezelfde bestanden is wél `isAdmin`-gated. Elke ingelogde medewerker kan dus elk project
en elke klant archiveren. Dat is een omissie, geen keuze.

**Deze taak levert geen unittests op.** Het is vier keer dezelfde bestaande rolcontrole; er is geen
nieuwe logica. De gate is `npx tsc --noEmit` en het lezen van de vier handlers.

- [ ] **Step 1: Dicht `DELETE` en `PATCH` op projecten**

In `src/app/api/projects/[id]/route.ts`, in `DELETE`, direct ná
`if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });`:

```ts
    const role = (session.user as any)?.role ?? "EMPLOYEE";
    if (!isAdmin(role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
```

Doe exact hetzelfde in `PATCH` in datzelfde bestand.

`isAdmin` staat al in de imports van dit bestand (regel 7); voeg geen import toe.

- [ ] **Step 2: Dicht `DELETE` en `PATCH` op klanten**

In `src/app/api/customers/[id]/route.ts`, in `DELETE`, direct ná de `if (!session)`-regel:

```ts
    const role = (session.user as any)?.role ?? "EMPLOYEE";
    if (!isAdmin(role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
```

Doe exact hetzelfde in `PATCH` in datzelfde bestand.

`isAdmin` staat al in de imports van dit bestand (regel 7); voeg geen import toe.

- [ ] **Step 3: Controleer dat er geen niet-adminpad kapotgaat**

Run: `grep -rn "method: \"DELETE\"\|method: \"PATCH\"" src/components src/app --include=*.tsx`

Loop de treffers langs en stel per stuk vast op welke pagina hij staat. Alle aanroepen naar
`/api/projects/[id]` en `/api/customers/[id]` moeten vanaf `projects-client.tsx` of
`customers-client.tsx` komen, en beide pagina's zijn al adminonly
(`src/app/(app)/projects/page.tsx` en `src/app/(app)/customers/page.tsx` doen `redirect("/")` voor
niet-admins). Vind je een aanroep vanaf een pagina die ook voor medewerkers open staat, stop dan en
meld dat — dan is de rolcontrole niet zomaar een omissie en moet er eerst een beslissing komen.

- [ ] **Step 4: Controleer de typen en de tests**

Run: `source ~/.nvm/nvm.sh && nvm use 20 && npx tsc --noEmit`
Expected: 0 fouten.

Run: `source ~/.nvm/nvm.sh && nvm use 20 && npm test`
Expected: 18 bestanden, 166 tests, groen.

- [ ] **Step 5: Commit**

```bash
git add "src/app/api/projects/[id]/route.ts" "src/app/api/customers/[id]/route.ts"
git commit -m "fix: archiveren en terugzetten van projecten en klanten is adminonly"
```

---

## Task 3: Een project kopiëren

**Files:**
- Modify: `src/components/projects/projects-client.tsx`

**Interfaces:**
- Consumes: `POST /api/projects` uit Task 1, inclusief de naamweigering.
- Produces: niets voor latere taken.

Geen servercode. De bestaande `POST` accepteert al `tags`, `levelRates`, `memberIds`, `billable`,
`status`, `customerId`, `description` en `defaultKmRate` — precies alles wat een kopie nodig heeft.

**Deze taak levert geen unittests op.** Het is uitsluitend formuliertoestand in een clientcomponent;
de repo heeft geen componenttests en dit traject introduceert ze niet.

- [ ] **Step 1: Trek het vullen van het formulier uit `startEdit`**

`startEdit` en de nieuwe kopieeractie vullen hetzelfde formulier met dezelfde velden. Als dat twee
keer los wordt geschreven, gaat de kopie op termijn afwijken van het bewerkscherm. Eén functie dus.

Vervang de hele bestaande functie `startEdit` in `src/components/projects/projects-client.tsx` door:

```tsx
  // Vult het formulier vanuit een bestaand project. `name` en `customerId`
  // staan er los in omdat bewerken en kopiëren daar elk hun eigen regel voor
  // hebben; al het andere is identiek en hoort daarom in één functie, zodat een
  // nieuw veld niet in één van de twee vergeten kan worden.
  function fillForm(project: any, name: string, customerId: string) {
    setSelectedTags(project.tags ?? []);
    form.reset({
      customerId,
      name,
      description: project.description ?? "",
      status: project.status,
      defaultKmRate: project.defaultKmRate ? Number(project.defaultKmRate) : "",
      billable: project.billable,
    });
    // project.levelRates is alleen afwezig wanneer de query die dit project laadde
    // zijn include vergeten is — niet een legitieme "geen tarieven"-staat, want dat is [].
    const ratesKnown = Array.isArray(project.levelRates);
    setLevelRatesKnown(ratesKnown);
    setLevelRates(
      ratesKnown
        ? Object.fromEntries(project.levelRates.map((r: any) => [r.level, String(r.rate)]))
        : {},
    );
    setMemberIdsKnown(Array.isArray(project.members));
    setMemberIds((project.members ?? []).map((m: any) => m.userId));
    setDialogOpen(true);
  }

  function startEdit(project: any) {
    setEditing(project.id);
    // Bewerken houdt de klant die er staat, ook als die inmiddels gearchiveerd
    // is: iemand die een typefout in de omschrijving herstelt, moet niet
    // gedwongen worden het project aan een andere klant te hangen.
    fillForm(project, project.name, project.customerId ?? "");
  }

  // Kopiëren opent hetzelfde formulier in AANMAAKSTAND: editing blijft null, dus
  // opslaan doet een POST en er ontstaat pas een project als de gebruiker opslaat.
  //
  // De twee *Known-vlaggen zijn hier het gevoelige punt. Ze staan in fillForm op
  // Array.isArray(...), en de projectenpagina laadt levelRates én members mee, dus
  // ze komen op true te staan en het formulier stuurt beide velden mee. Zou een van
  // beide false zijn, dan laat het formulier het veld weg en levert de kopie
  // stilzwijgend een project op zonder tarieven of zonder deelnemers. Controleer dat
  // met de hand na iedere wijziging aan de query op src/app/(app)/projects/page.tsx.
  function startCopy(project: any) {
    setEditing(null);
    // Een gearchiveerde klant staat NIET in de `customers`-prop en dus niet in
    // de keuzelijst. Zouden we zijn id toch invullen, dan toont de Select zijn
    // placeholder terwijl er wel degelijk een waarde in het formulier zit, en
    // slaat de kopie stilzwijgend op onder een klant die je niet zag staan.
    // Daarom bewust leegmaken: de bestaande verplicht-melding dwingt dan een
    // keuze af. Dat geldt net zo voor een kaal conceptproject zonder klant.
    const klantBeschikbaar = customers.some((c: any) => c.id === project.customerId);
    fillForm(project, `${project.name} (kopie)`, klantBeschikbaar ? project.customerId : "");
  }
```

Twee dingen zijn hier bewust anders dan in de oude `startEdit`:

- `setDialogOpen(true)` staat nu ín `fillForm` in plaats van erna, zodat beide aanroepers hem
  onmogelijk kunnen vergeten.
- De klant komt als parameter binnen in plaats van rechtstreeks uit het project, zodat bewerken en
  kopiëren elk hun eigen regel kunnen hebben zonder de rest van het formulier te dupliceren.
  Bewerken houdt wat er stond; kopiëren maakt leeg wat niet gekozen kan worden.

- [ ] **Step 2: Voeg de kopieerknop aan de rij toe**

Wijzig de import van lucide-react bovenin het bestand van:

```tsx
import { Plus, Pencil, Trash2, RotateCcw } from "lucide-react";
```

naar:

```tsx
import { Plus, Pencil, Copy, Trash2, RotateCcw } from "lucide-react";
```

Voeg in de actiekolom, in de `<>`-tak voor niet-gearchiveerde rijen, een knop toe tussen de
bewerkknop en de archiveerknop:

```tsx
                          <Button variant="ghost" size="icon" onClick={() => startCopy(p)} title="Kopiëren">
                            <Copy className="h-3.5 w-3.5" />
                          </Button>
```

Gearchiveerde rijen krijgen geen kopieerknop: die tonen alleen "Herstellen" en zijn ook niet te
bewerken. Laat die tak ongemoeid.

- [ ] **Step 3: Controleer de typen en de tests**

Run: `source ~/.nvm/nvm.sh && nvm use 20 && npx tsc --noEmit`
Expected: 0 fouten.

Run: `source ~/.nvm/nvm.sh && nvm use 20 && npm test`
Expected: 18 bestanden, 166 tests, groen.

- [ ] **Step 4: Lees je eigen diff terug op de *Known-vlaggen**

Run: `git diff src/components/projects/projects-client.tsx`

Stel met eigen ogen vast dat `setLevelRatesKnown` en `setMemberIdsKnown` in `fillForm` staan en dat
`startCopy` er langs komt. Dit is de fout die deze codebase in twee eerdere trajecten heeft
gemaakt: een formulier dat een veld weglaat en daarmee bestaande gegevens wist. Bij kopiëren is de
schade omgekeerd — geen wissing, maar een kopie die stilzwijgend leeg blijft op precies de twee
velden die de gebruiker wilde meenemen.

- [ ] **Step 5: Commit**

```bash
git add src/components/projects/projects-client.tsx
git commit -m "feat: project kopieren vult het formulier met alle instellingen"
```

**Handmatig na te lopen bij de uitrol:** een project met tarieven en deelnemers kopiëren, direct
opslaan, en op de nieuwe rij controleren dat de kolommen Deelnemers en Km-tarief gelijk zijn aan
het origineel; een kopie annuleren en controleren dat er niets is aangemaakt; twee keer hetzelfde
project kopiëren zonder hernoemen en bij de tweede de naamweigering krijgen.

---

## Task 4: Meerdere projecten tegelijk archiveren

**Files:**
- Create: `src/app/api/projects/bulk-archive/route.ts`
- Modify: `src/components/projects/projects-client.tsx`

**Interfaces:**
- Consumes: `isAdmin` uit `src/lib/roles.ts`, `handleError` uit `src/lib/api.ts`.
- Produces: `POST /api/projects/bulk-archive` met body `{ ids: string[] }`, antwoord `{ count: number }`.

**Deze taak levert geen unittests op.** De route is één `updateMany` en de rest is
formuliertoestand; er is geen pure functie om te testen.

- [ ] **Step 1: Maak de route**

Create `src/app/api/projects/bulk-archive/route.ts`:

```ts
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { z } from "zod";
import { handleError } from "@/lib/api";
import { isAdmin } from "@/lib/roles";

const schema = z.object({
  ids: z.array(z.string().min(1)).min(1).max(500),
});

export async function POST(req: Request) {
  try {
    const session = await auth();
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const role = (session.user as any)?.role ?? "EMPLOYEE";
    if (!isAdmin(role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const { ids } = schema.parse(await req.json());

    // Eén updateMany, dus alles of niets. Al gearchiveerde projecten vallen
    // vanzelf buiten de where en leveren geen foutmelding op — count telt
    // daarom wat er daadwerkelijk is gearchiveerd, niet hoeveel ids er kwamen.
    const { count } = await prisma.project.updateMany({
      where: { id: { in: ids }, archivedAt: null },
      data: { archivedAt: new Date() },
    });
    return NextResponse.json({ count });
  } catch (e) { return handleError(e); }
}
```

Deze map ligt naast `src/app/api/projects/[id]/`. Een statisch segment wint in de App Router van een
dynamisch segment, dus `/api/projects/bulk-archive` komt hier terecht en niet bij `[id]`.

- [ ] **Step 2: Voeg de selectietoestand toe**

In `src/components/projects/projects-client.tsx`, direct ná de regel
`const [memberIdsKnown, setMemberIdsKnown] = useState(true);`:

```tsx
  const [selected, setSelected] = useState<string[]>([]);
```

- [ ] **Step 3: Trek de zichtbare rijen uit de JSX**

De tabel filtert vandaag inline in de JSX. De kopcheckbox, de bulkknop en de tabelrijen moeten
gegarandeerd over dezelfde rijen gaan; door ze uit één variabele te laten lezen kan dat niet
uiteenlopen.

Voeg direct vóór de `return (` van de component toe:

```tsx
  // Eén lijst waar de tabel, de kopcheckbox én de bulkknop uit lezen, zodat
  // "selecteer alles" nooit meer archiveert dan er op het scherm staat.
  const visible = projects
    .filter((p) => statusFilter === "all" || p.status === statusFilter)
    .filter((p) => !noCustomerOnly || !p.customer);
  const selectable = visible.filter((p) => !p.archivedAt);
  const selectedVisible = selectable.filter((p) => selected.includes(p.id));
  const allSelected = selectable.length > 0 && selectedVisible.length === selectable.length;
```

Vervang in de JSX het blok:

```tsx
              {projects
              .filter((p) => statusFilter === "all" || p.status === statusFilter)
              .filter((p) => !noCustomerOnly || !p.customer)
              .map((p) => (
```

door:

```tsx
              {visible.map((p) => (
```

- [ ] **Step 4: Voeg de archiveerfunctie toe**

Direct ná de bestaande functie `archiveProject`:

```tsx
  async function archiveSelected() {
    // selectedVisible, niet selected: wie eerst aanvinkt en daarna het
    // statusfilter wijzigt, mag niet iets archiveren dat hij niet meer ziet.
    const ids = selectedVisible.map((p) => p.id);
    const woord = ids.length === 1 ? "project" : "projecten";
    if (!confirm(`Weet u zeker dat u ${ids.length} ${woord} wilt archiveren?`)) return;
    const res = await fetch("/api/projects/bulk-archive", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids }),
    });
    if (res.ok) {
      setSelected([]);
      loadProjects(showArchived);
    }
  }
```

`selectedVisible` is in Step 3 vóór de `return` gedefinieerd, dus binnen deze functie in scope.

- [ ] **Step 5: Voeg de bulkknop toe**

In de kopbalk, direct vóór de knop `Project toevoegen`:

```tsx
          {selectedVisible.length > 0 && (
            <Button variant="destructive" onClick={archiveSelected}>
              Archiveer geselecteerde ({selectedVisible.length})
            </Button>
          )}
```

- [ ] **Step 6: Voeg de selectiekolom aan de tabel toe**

Voeg in `<TableHeader>` een kolom toe vóór `<TableHead>Project</TableHead>`:

```tsx
                <TableHead className="w-10">
                  <input
                    type="checkbox"
                    className="h-4 w-4 rounded border-input accent-primary"
                    checked={allSelected}
                    disabled={selectable.length === 0}
                    onChange={(e) =>
                      setSelected(e.target.checked ? selectable.map((p) => p.id) : [])
                    }
                    title="Alle zichtbare projecten selecteren"
                  />
                </TableHead>
```

Voeg in de rij een cel toe vóór de naamcel:

```tsx
                  <TableCell>
                    {!p.archivedAt && (
                      <input
                        type="checkbox"
                        className="h-4 w-4 rounded border-input accent-primary"
                        checked={selected.includes(p.id)}
                        onChange={(e) =>
                          setSelected((prev) =>
                            e.target.checked ? [...prev, p.id] : prev.filter((id) => id !== p.id),
                          )
                        }
                      />
                    )}
                  </TableCell>
```

Een gearchiveerde rij krijgt een lege cel en dus geen selectievakje: archiveren wat al gearchiveerd
is heeft geen betekenis.

Wijzig tot slot de lege-tabelregel — de tabel heeft er een kolom bij:

```tsx
                <TableRow><TableCell colSpan={10} className="text-center text-muted-foreground py-8">Geen projecten gevonden</TableCell></TableRow>
```

- [ ] **Step 7: Controleer de typen en de tests**

Run: `source ~/.nvm/nvm.sh && nvm use 20 && npx tsc --noEmit`
Expected: 0 fouten.

Run: `source ~/.nvm/nvm.sh && nvm use 20 && npm test`
Expected: 18 bestanden, 166 tests, groen.

- [ ] **Step 8: Controleer dat de nieuwe route de dynamische route niet verdringt**

Run: `ls src/app/api/projects/`
Expected: je ziet `[id]`, `bulk-archive` en `route.ts` naast elkaar. `[id]/route.ts` heeft geen
`POST`-handler, dus er is ook geen dubbelzinnigheid over welke route een `POST` op
`/api/projects/bulk-archive` afhandelt.

- [ ] **Step 9: Commit**

```bash
git add src/app/api/projects/bulk-archive/route.ts src/components/projects/projects-client.tsx
git commit -m "feat: meerdere projecten tegelijk archiveren"
```

**Handmatig na te lopen bij de uitrol:** drie projecten aanvinken en archiveren, en controleren dat
de teller in de knop klopte en alle drie verdwijnen; selecteer-alles aanvinken terwijl er op status
gefilterd is en controleren dat alleen de zichtbare rijen aangevinkt worden; aanvinken, dan het
statusfilter wijzigen, en controleren dat de knop meetelt met wat er nog zichtbaar is; controleren
dat een gearchiveerde rij geen selectievakje heeft; als niet-admin een `POST` naar
`/api/projects/bulk-archive` sturen en 403 krijgen.

---

## Uitrol

**Door een mens, met de database.** Niets hiervan kon tijdens de bouw tegen productie gedraaid
worden.

**Dit traject gaat pas naar productie ná traject 1 (`project-billable`) en traject 2
(`project-members`).** Die staan er nog niet op; hun eigen plannen beschrijven hun uitrolvolgorde,
en die moet eerst helemaal af zijn.

Daarna, in één stap:

1. `prisma migrate diff` draaien en de volledige lijst lezen. Er hoort **alleen** een uniciteitseis
   op `Project.name` bij te komen. Verdwijnt er een kolom, stop dan — bij de batch met werkniveaus
   verdween er onverwacht een kolom die niemand had gecontroleerd.
2. `npm run db:push`.
3. Deployen.

Er is geen backfill en er wordt niets verwijderd.

`db:push` faalt wanneer er onverwacht toch dubbele namen zijn. Dat is een nette uitkomst en geen
ramp: hernoem de botsende projecten in de app en draai opnieuw. Gemeten op 2026-08-04 waren er 25
projecten met 0 dubbele namen, hoofdletterongevoelig en getrimd vergeleken.

## Bekend en bewust blijven staan

Twee punten die de reviews vonden, die zijn afgewogen en niet in dit traject zijn opgelost:

- **Een project zonder deelnemers kopiëren levert een kopie mét een deelnemer op.**
  `POST /api/projects` behandelt een lege `memberIds` als afwezig en valt dan terug op de aanmaker
  (`src/app/api/projects/route.ts:98-104`). Dat gedrag bestaat sinds traject 2 en is daar bewust zo
  gekozen voor het conceptproject-knopje; voor kopiëren pakt het verrassend uit.
- **De client stuurt de projectnaam ongetrimd.** Het zod-schema op de server trimt hem wel, dus de
  opgeslagen naam en de uniciteitstoets kloppen. Alleen de melding "verplicht" van het formulier
  slaat niet aan bij een naam die alleen uit spaties bestaat.

Handmatig na te lopen na de deploy:

- [ ] Een project hernoemen naar de naam van een ander project → `Er bestaat al een project met deze naam`.
- [ ] Diezelfde naam met andere hoofdletters, en met spaties eromheen → dezelfde weigering.
- [ ] Een project opslaan zonder de naam te wijzigen → slaat gewoon op, botst niet met zichzelf.
- [ ] Een nieuw project aanmaken met de naam van een **gearchiveerd** project → weigering.
- [ ] Via "+ Nieuw conceptproject" in het urenformulier een bestaande naam gebruiken → de weigering van de server is zichtbaar in de melding.
- [ ] Een project met tarieven en deelnemers kopiëren, direct opslaan, en de kolommen Deelnemers en Km-tarief van de kopie vergelijken met het origineel.
- [ ] Een kopie maken van een project waarvan de klant gearchiveerd is → het klantveld is leeg en het formulier vraagt om een klant.
- [ ] Een kopie annuleren → er is geen project aangemaakt.
- [ ] Twee keer hetzelfde project kopiëren zonder hernoemen → de tweede krijgt de naamweigering.
- [ ] Drie projecten aanvinken en bulk archiveren → alle drie verdwijnen, de teller klopte.
- [ ] Selecteer-alles aanvinken terwijl er op status gefilterd is → alleen de zichtbare rijen.
- [ ] Aanvinken, dan het statusfilter wijzigen → de knop telt alleen wat nog zichtbaar is.
- [ ] Een gearchiveerd project heeft geen selectievakje.
- [ ] Als niet-admin proberen te archiveren via de API → 403, voor zowel `/api/projects/[id]` als `/api/customers/[id]` als de bulkroute.
- [ ] Een gearchiveerd project met openstaande uren: die uren staan nog steeds op een nieuwe factuur.
