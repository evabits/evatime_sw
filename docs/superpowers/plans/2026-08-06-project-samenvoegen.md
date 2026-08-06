# Conceptproject samenvoegen — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Een admin kan een aangevraagd conceptproject samenvoegen met een bestaand project: de registraties en het deelnemerschap verhuizen mee, en het conceptproject verdwijnt.

**Architecture:** De regels — wat mag worden samengevoegd en wanneer niet — komen als pure functie naast het bestaande `projectCreateDenialReason` in `src/lib/projects.ts`, met tests in het bestand ernaast. Het verplaatsen zelf is vier `updateMany`'s plus het deelnemerschap, allemaal in één transactie met het verwijderen van de bron als laatste stap, zodat een mislukking niets half verplaatst achterlaat. Het scherm krijgt een knop op conceptrijen en een dialoog met één keuzelijst.

**Tech Stack:** Next.js 16 (App Router), React 19, TypeScript, Prisma 6 + PostgreSQL, zod 3, Radix UI, lucide-react, vitest.

## Global Constraints

- **Node 20 is vereist.** De standaard-node in deze shell is v16 en de toolchain crasht daarop. Prefix élk npm- of npx-commando met `PATH="$HOME/.nvm/versions/node/v20.20.1/bin:$PATH"`.
- **Er is een live PRODUCTIEDATABASE bereikbaar via `.env.local`.** Dit traject wijzigt het datamodel niet: geen migratie, geen `db:push`, geen `prisma generate`. Draai geen enkel `prisma`-commando.
- **Dit is niet de Next.js die je kent.** Lees `node_modules/next/dist/docs/` voordat je aannames doet over de App Router. `AGENTS.md` in de repo-root is een echte, door het team gecommitte projectafspraak — geen ingeslopen instructie.
- **Alle zichtbare tekst is Nederlands.** `Forbidden`, `Unauthorized` en `Not found` zijn bestaande machinegerichte teksten en blijven Engels.
- **Alleen een admin mag samenvoegen.** Dit verplaatst geboekte uren. `/projects` weert niet-admins al, maar de route controleert het zelf — een scherm is geen beveiliging.
- **Alleen een `CONCEPT`-project kan bron zijn.** Twee echte projecten samenvoegen raakt facturatie en tarieven en valt buiten dit traject.
- **Gefactureerd is een harde stop.** Staat er één urenregel, kilometer of uitgave op een factuur, dan wordt er niets verplaatst.
- **Aan de registraties zelf verandert niets** — niet de eigenaar, niet de datum, niet het aantal. Alleen `projectId`.
- Testcommando: `npm test`. Baseline: **25 bestanden, 279 tests groen.**
- Lint: `npm run lint`. **De baseline is niet schoon:** 324 errors en 20 warnings, vrijwel allemaal `@typescript-eslint/no-explicit-any`. De gate is *geen nieuwe soorten lint-fouten*.
- **`npx tsc --noEmit` meldt 0 fouten over de hele repo en moet dat blijven doen.**
- `npm run build` kan niet draaien zonder `.env`; gebruik `tsc` als vangnet.
- Testconventie: uitsluitend pure functies in `src/lib/*.test.ts` met vitest. Er bestaan geen component- of API-tests en die worden hier niet geïntroduceerd.

---

## File Structure

**Nieuw:**

| Bestand | Wat |
|---|---|
| `src/app/api/projects/[id]/merge/route.ts` | `POST` — de handeling zelf. |

**Gewijzigd:**

| Bestand | Wat |
|---|---|
| `src/lib/projects.ts` | `projectMergeDenialReason` erbij. |
| `src/lib/projects.test.ts` | Tests daarvoor. |
| `src/components/projects/projects-client.tsx` | Knop op conceptrijen en het dialoog. |

Een eigen endpoint en geen veld op `PUT /api/projects/[id]`: dat is een formulier-opslag die velden bijwerkt, terwijl dit een handeling is die registraties verplaatst en het project daarna opheft.

---

## Task 1: De regels

**Files:**
- Modify: `src/lib/projects.ts`
- Modify: `src/lib/projects.test.ts`

**Interfaces:**
- Produces:
  ```ts
  type MergeProject = { id: string; status: string; archivedAt: Date | null };
  type InvoicedCounts = { timeEntries: number; kmEntries: number; expenses: number };

  function projectMergeDenialReason(
    source: MergeProject | null,
    target: MergeProject | null,
    invoiced: InvoicedCounts,
  ): string | null
  ```
  Task 2 roept deze aan.

- [ ] **Step 1: Schrijf de falende tests**

Voeg onderaan `src/lib/projects.test.ts` toe:

```ts
import { projectMergeDenialReason } from "./projects";

describe("projectMergeDenialReason", () => {
  const concept = { id: "p1", status: "CONCEPT", archivedAt: null };
  const doel = { id: "p2", status: "ACTIVE", archivedAt: null };
  const schoon = { timeEntries: 0, kmEntries: 0, expenses: 0 };

  it("allows merging a bare concept project into an active one", () => {
    expect(projectMergeDenialReason(concept, doel, schoon)).toBeNull();
  });

  it("allows a concept project as the target too", () => {
    // Twee mensen die hetzelfde aanvragen is een reeel geval.
    expect(
      projectMergeDenialReason(concept, { id: "p3", status: "CONCEPT", archivedAt: null }, schoon),
    ).toBeNull();
  });

  it("refuses a missing source", () => {
    expect(projectMergeDenialReason(null, doel, schoon)).toBe("Het bronproject bestaat niet");
  });

  it("refuses a missing target", () => {
    expect(projectMergeDenialReason(concept, null, schoon)).toBe("Het doelproject bestaat niet");
  });

  it("refuses merging a project with itself", () => {
    expect(projectMergeDenialReason(concept, concept, schoon)).toBe(
      "Een project kan niet met zichzelf worden samengevoegd",
    );
  });

  it("refuses a source that is not a concept project", () => {
    // Twee echte projecten samenvoegen raakt facturatie en tarieven.
    expect(projectMergeDenialReason({ ...concept, status: "ACTIVE" }, doel, schoon)).toBe(
      "Alleen een conceptproject kan worden samengevoegd",
    );
  });

  it("refuses an archived source", () => {
    expect(
      projectMergeDenialReason({ ...concept, archivedAt: new Date("2026-01-01") }, doel, schoon),
    ).toBe("Een gearchiveerd project kan niet worden samengevoegd");
  });

  it("refuses an archived target", () => {
    expect(
      projectMergeDenialReason(concept, { ...doel, archivedAt: new Date("2026-01-01") }, schoon),
    ).toBe("Het doelproject is gearchiveerd");
  });

  it("refuses when hours are already invoiced", () => {
    expect(projectMergeDenialReason(concept, doel, { ...schoon, timeEntries: 1 })).toBe(
      "Er staan gefactureerde uren op dit project",
    );
  });

  it("refuses when kilometres are already invoiced", () => {
    expect(projectMergeDenialReason(concept, doel, { ...schoon, kmEntries: 1 })).toBe(
      "Er staan gefactureerde kilometers op dit project",
    );
  });

  it("refuses when expenses are already invoiced", () => {
    expect(projectMergeDenialReason(concept, doel, { ...schoon, expenses: 1 })).toBe(
      "Er staan gefactureerde uitgaven op dit project",
    );
  });
});
```

- [ ] **Step 2: Draai de tests en stel vast dat ze falen**

Run: `PATH="$HOME/.nvm/versions/node/v20.20.1/bin:$PATH" npx vitest run src/lib/projects.test.ts`
Expected: FAIL — `projectMergeDenialReason` bestaat niet.

- [ ] **Step 3: Schrijf de implementatie**

Voeg onderaan `src/lib/projects.ts` toe:

```ts
export type MergeProject = { id: string; status: string; archivedAt: Date | null };

export type InvoicedCounts = { timeEntries: number; kmEntries: number; expenses: number };

/**
 * Waarom een conceptproject NIET met een doelproject mag worden samengevoegd,
 * of null als het mag. Zelfde vorm als projectCreateDenialReason hierboven.
 *
 * De volgorde is opzet. Bestaan gaat voor alles, want zonder de projecten valt
 * er niets te zeggen. "Met zichzelf" komt vóór de statuscontrole omdat dat de
 * begrijpelijkste melding is voor wat overduidelijk een vergissing is. De
 * factuurcontroles staan achteraan: ze zijn het duurst om op te halen en het
 * zeldzaamst, en de goedkopere weigeringen hebben dan al afgevangen.
 *
 * Gefactureerd is een harde stop en geen waarschuwing: een factuurregel die na
 * het samenvoegen naar een ander project verwijst, is niet uit te leggen aan
 * wie die factuur controleert.
 */
export function projectMergeDenialReason(
  source: MergeProject | null,
  target: MergeProject | null,
  invoiced: InvoicedCounts,
): string | null {
  if (!source) return "Het bronproject bestaat niet";
  if (!target) return "Het doelproject bestaat niet";
  if (source.id === target.id) return "Een project kan niet met zichzelf worden samengevoegd";
  if (source.status !== "CONCEPT") return "Alleen een conceptproject kan worden samengevoegd";
  if (source.archivedAt) return "Een gearchiveerd project kan niet worden samengevoegd";
  if (target.archivedAt) return "Het doelproject is gearchiveerd";
  if (invoiced.timeEntries > 0) return "Er staan gefactureerde uren op dit project";
  if (invoiced.kmEntries > 0) return "Er staan gefactureerde kilometers op dit project";
  if (invoiced.expenses > 0) return "Er staan gefactureerde uitgaven op dit project";
  return null;
}
```

- [ ] **Step 4: Draai de tests en stel vast dat ze slagen**

Run: `PATH="$HOME/.nvm/versions/node/v20.20.1/bin:$PATH" npx vitest run src/lib/projects.test.ts`
Expected: PASS, 27 tests in dit bestand (16 bestaande plus 11 nieuwe).

- [ ] **Step 5: Draai de volledige suite**

Run: `PATH="$HOME/.nvm/versions/node/v20.20.1/bin:$PATH" npm test`
Expected: 25 bestanden, 290 tests, groen.

- [ ] **Step 6: Commit**

```bash
git add src/lib/projects.ts src/lib/projects.test.ts
git commit -m "feat: regels voor het samenvoegen van een conceptproject"
```

---

## Task 2: De route

**Files:**
- Create: `src/app/api/projects/[id]/merge/route.ts`

**Interfaces:**
- Consumes: `projectMergeDenialReason` uit Task 1, `isAdmin` uit `src/lib/roles.ts`, `handleError` uit `src/lib/api.ts`.
- Produces: `POST /api/projects/[id]/merge` met body `{ targetId: string }`, dat bij succes `{ timeEntries, kmEntries, kmTemplates, expenses, members }` teruggeeft — de aantallen die daadwerkelijk verplaatst zijn. Task 3 gebruikt de route maar niet die getallen.

**Deze taak levert geen unittests op.** De regels zitten in Task 1; wat hier bijkomt is routewerk, en deze repo heeft geen API-tests.

- [ ] **Step 1: Schrijf de route**

Maak `src/app/api/projects/[id]/merge/route.ts`:

```ts
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { z } from "zod";
import { handleError } from "@/lib/api";
import { isAdmin } from "@/lib/roles";
import { projectMergeDenialReason } from "@/lib/projects";

const schema = z.object({ targetId: z.string().min(1) });

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await auth();
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const role = (session.user as any)?.role ?? "EMPLOYEE";
    // Het scherm toont deze knop alleen aan een admin, maar een scherm is geen
    // beveiliging: dit verplaatst geboekte uren tussen projecten.
    if (!isAdmin(role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const { id } = await params;
    const { targetId } = schema.parse(await req.json());

    const kies = { id: true, status: true, archivedAt: true } as const;
    const [source, target] = await Promise.all([
      prisma.project.findUnique({ where: { id }, select: kies }),
      prisma.project.findUnique({ where: { id: targetId }, select: kies }),
    ]);

    const [timeEntries, kmEntries, expenses] = await Promise.all([
      prisma.timeEntry.count({ where: { projectId: id, invoiced: true } }),
      prisma.kmEntry.count({ where: { projectId: id, invoiced: true } }),
      prisma.expense.count({ where: { projectId: id, invoiced: true } }),
    ]);

    const denial = projectMergeDenialReason(source, target, { timeEntries, kmEntries, expenses });
    if (denial) return NextResponse.json({ error: denial }, { status: 400 });

    // Alles in één transactie, met het verwijderen als laatste stap: klapt dat
    // eruit, dan staan de registraties weer bij de bron in plaats van half
    // verplaatst.
    //
    // Het verwijderen is meteen het vangnet. TimeEntry, KmEntry en KmTemplate
    // hebben een verplichte projectkoppeling zonder onDelete, wat in Prisma
    // neerkomt op Restrict: blijft er één achter, dan weigert de database het
    // verwijderen en rolt alles terug. Expense is de uitzondering — zijn
    // projectId is optioneel, dus daar geldt SetNull en zou een achtergebleven
    // uitgave stilletjes zijn project kwijtraken. Daarom staat hij hier
    // expliciet bij, niet omdat de huidige data hem bevat.
    const verplaatst = await prisma.$transaction(async (tx) => {
      const leden = await tx.projectMember.findMany({
        where: { projectId: id },
        select: { userId: true },
      });

      const uren = await tx.timeEntry.updateMany({ where: { projectId: id }, data: { projectId: targetId } });
      const km = await tx.kmEntry.updateMany({ where: { projectId: id }, data: { projectId: targetId } });
      const sjablonen = await tx.kmTemplate.updateMany({ where: { projectId: id }, data: { projectId: targetId } });
      const uitgaven = await tx.expense.updateMany({ where: { projectId: id }, data: { projectId: targetId } });

      // skipDuplicates omdat de sleutel van ProjectMember [projectId, userId]
      // is: de aanvrager kan al deelnemer van het doel zijn, en dat is precies
      // het geval dat deze functie moet afvangen.
      let leden_toegevoegd = 0;
      if (leden.length > 0) {
        const { count } = await tx.projectMember.createMany({
          data: leden.map((l) => ({ projectId: targetId, userId: l.userId })),
          skipDuplicates: true,
        });
        leden_toegevoegd = count;
      }

      await tx.project.delete({ where: { id } });

      return {
        timeEntries: uren.count,
        kmEntries: km.count,
        kmTemplates: sjablonen.count,
        expenses: uitgaven.count,
        members: leden_toegevoegd,
      };
    });

    return NextResponse.json(verplaatst);
  } catch (e) { return handleError(e); }
}
```

De factuurtellingen staan bewust vóór de transactie: ze bepalen of hij überhaupt begint. Tussen die telling en de transactie zou iemand theoretisch nog kunnen factureren; dit is een adminhandeling in een app met een handvol gebruikers, en die race is het extra werk niet waard.

- [ ] **Step 2: Controleer dat de route-params een Promise zijn**

Deze Next.js-versie geeft route-params als `Promise`. Controleer dat je `const { id } = await params;` gebruikt en niet `params.id`, en vergelijk met een bestaande route met een `[id]`-segment — bijvoorbeeld `src/app/api/projects/[id]/route.ts` — of het patroon klopt. Meld in je rapport wat je vaststelde.

- [ ] **Step 3: Controleer de typen en de tests**

Run: `PATH="$HOME/.nvm/versions/node/v20.20.1/bin:$PATH" npx tsc --noEmit`
Expected: 0 fouten.

Run: `PATH="$HOME/.nvm/versions/node/v20.20.1/bin:$PATH" npm test`
Expected: 25 bestanden, 290 tests, groen.

- [ ] **Step 4: Commit**

```bash
git add "src/app/api/projects/[id]/merge/route.ts"
git commit -m "feat: route om een conceptproject samen te voegen"
```

---

## Task 3: Het scherm

**Files:**
- Modify: `src/components/projects/projects-client.tsx`

**Interfaces:**
- Consumes: `POST /api/projects/[id]/merge` met body `{ targetId }` uit Task 2.

**Deze taak levert geen unittests op.** Het is knopzichtbaarheid en dialoogtoestand.

- [ ] **Step 1: Breid de icoon-import uit**

Bovenaan staat:

```tsx
import { Plus, Pencil, Copy, Trash2, RotateCcw } from "lucide-react";
```

Vervang door:

```tsx
import { Plus, Pencil, Copy, Trash2, RotateCcw, Merge } from "lucide-react";
```

- [ ] **Step 2: Voeg de toestand toe**

Zoek de regel waar `tagKeuze` gedeclareerd wordt:

```tsx
  const [tagKeuze, setTagKeuze] = useState("");
```

Voeg daaronder toe:

```tsx
  // Het conceptproject dat wordt samengevoegd, of null als het dialoog dicht is.
  const [mergeBron, setMergeBron] = useState<any>(null);
  const [mergeDoel, setMergeDoel] = useState("");
```

- [ ] **Step 3: Schrijf de samenvoegfunctie**

Zoek `async function applyTag() {` en voeg dáárvóór toe:

```tsx
  async function applyMerge() {
    if (!mergeBron || !mergeDoel) return;
    const doelNaam = projects.find((p) => p.id === mergeDoel)?.name ?? "";
    if (
      !confirm(
        `"${mergeBron.name}" samenvoegen met "${doelNaam}"? ` +
          `De uren, kilometers en uitgaven verhuizen mee en "${mergeBron.name}" wordt verwijderd.`,
      )
    ) {
      return;
    }
    const res = await fetch(`/api/projects/${mergeBron.id}/merge`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ targetId: mergeDoel }),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      alert(body.error ?? `Fout ${res.status}`);
      return;
    }
    setMergeBron(null);
    setMergeDoel("");
    // Herladen in plaats van de lijst bijwerken: er is een project verdwenen en
    // de urentellingen van het doelproject zijn veranderd.
    loadProjects(showArchived);
  }
```

- [ ] **Step 4: Zet de knop op de conceptrijen**

In de rij-acties staat:

```tsx
                          <Button variant="ghost" size="icon" onClick={() => startCopy(p)} title="Kopiëren">
                            <Copy className="h-3.5 w-3.5" />
                          </Button>
```

Voeg direct daarná toe:

```tsx
                          {p.status === "CONCEPT" && (
                            <Button
                              variant="ghost"
                              size="icon"
                              title="Samenvoegen met een bestaand project"
                              onClick={() => { setMergeBron(p); setMergeDoel(""); }}
                            >
                              <Merge className="h-3.5 w-3.5" />
                            </Button>
                          )}
```

- [ ] **Step 5: Voeg het dialoog toe**

Zoek het tag-dialoog, dat begint met:

```tsx
      <Dialog open={tagActie !== null} onOpenChange={(o) => { if (!o) setTagActie(null); }}>
```

Voeg **direct vóór** dat dialoog toe:

```tsx
      <Dialog open={mergeBron !== null} onOpenChange={(o) => { if (!o) setMergeBron(null); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Samenvoegen met een bestaand project</DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            <p className="text-sm text-muted-foreground">
              De uren, kilometers en uitgaven van &quot;{mergeBron?.name}&quot; verhuizen naar het
              gekozen project, en de deelnemers krijgen daar boekrecht. &quot;{mergeBron?.name}&quot;
              wordt daarna verwijderd.
            </p>
            <Select onValueChange={setMergeDoel} value={mergeDoel}>
              <SelectTrigger><SelectValue placeholder="Kies een doelproject" /></SelectTrigger>
              <SelectContent>
                {projects
                  .filter((p) => p.id !== mergeBron?.id && !p.archivedAt)
                  .map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.customer ? `${p.customer.name} — ` : ""}{p.name}
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setMergeBron(null)}>Annuleren</Button>
            <Button onClick={applyMerge} disabled={!mergeDoel}>Samenvoegen</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
```

- [ ] **Step 6: Controleer dat de knop alleen staat waar hij hoort**

Run: `git diff src/components/projects/projects-client.tsx`

Stel vast dat de samenvoegknop binnen de tak voor niet-gearchiveerde projecten staat — dezelfde tak als bewerken en kopiëren — en dat hij achter `p.status === "CONCEPT"` zit. Een gearchiveerd project toont alleen "Herstellen" en hoort deze knop niet te krijgen. Meld in je rapport wat je vaststelde.

- [ ] **Step 7: Controleer de typen, de tests en de lint**

Run: `PATH="$HOME/.nvm/versions/node/v20.20.1/bin:$PATH" npx tsc --noEmit`
Expected: 0 fouten.

Run: `PATH="$HOME/.nvm/versions/node/v20.20.1/bin:$PATH" npm test`
Expected: 25 bestanden, 290 tests, groen.

Run: `PATH="$HOME/.nvm/versions/node/v20.20.1/bin:$PATH" npm run lint`
Expected: 324 errors en 20 warnings, gelijk aan de baseline. `useState<any>` voor `mergeBron` levert géén nieuwe fout op: `initialProjects` is in dit bestand al `any[]` en de rest van het bestand werkt op dezelfde manier met projecten.

- [ ] **Step 8: Commit**

```bash
git add src/components/projects/projects-client.tsx
git commit -m "feat: conceptproject samenvoegen vanuit het projectenscherm"
```

---

## Uitrol

Geen migratie, geen schemawijziging, geen backfill. Pushen naar `main` volstaat en Vercel deployt.

Handmatig na te lopen na de deploy:

- [ ] Een conceptproject met twee urenregels samenvoegen met een actief project → de twee regels staan in `/time` onder het doelproject, op naam van dezelfde medewerker, met dezelfde datums en uren; het conceptproject is uit de lijst verdwenen.
- [ ] De aanvrager staat daarna als deelnemer op het doelproject.
- [ ] Hetzelfde doen wanneer de aanvrager al deelnemer van het doel was → geen fout, en hij staat er één keer in.
- [ ] Bij een actief project staat er geen samenvoegknop; bij een gearchiveerd project alleen "Herstellen".
- [ ] **Een conceptproject waarvan een urenregel gefactureerd is → geweigerd, en er is niets verplaatst.** Dit is de belangrijkste controle van de lijst: hij bewijst dat de weigering vóór de transactie valt en niet halverwege.
- [ ] Het lege conceptproject `productie`, zonder deelnemers en zonder uren, samenvoegen → werkt, en verdwijnt.
- [ ] De urentelling in de projectenlijst van het doelproject is opgehoogd met wat er verhuisde.
