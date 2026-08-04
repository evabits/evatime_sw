# Tag Management Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Geef tags een eigen beheerpagina met aanmaken, hernoemen en samenvoegen, en laat een tag in één handeling aan meerdere projecten toegewezen of ervan afgehaald worden.

**Architecture:** Alle naamvergelijking loopt via één pure module `src/lib/tags.ts`, die ook de gereserveerde naam `wbso` definieert die de loonverwerking hardgecodeerd gebruikt — zodat de payrollroute en de tagroutes niet uit elkaar kunnen lopen. De beheerpagina volgt het bestaande patroon van `/expense-categories`: servercomponent met eigen Prisma-query, clientcomponent met inline bewerken. Hernoemen en samenvoegen zijn één route met twee uitkomsten: bij een botsing antwoordt hij met een conflictbeschrijving in plaats van een fout, en pas na bevestiging verhuist hij de projecten. Bulk taggen hergebruikt de selectiekolom die traject 3 op `/projects` heeft gebouwd.

**Tech Stack:** Next.js 16 (App Router), React 19, TypeScript, Prisma 6 + PostgreSQL, zod 3, Radix UI, Tailwind 4, vitest, lucide-react.

## Global Constraints

- **Node 20 is vereist.** De standaard-node in deze shell is v16 en Prisma crasht daarop. Prefix élk npm- of npx-commando met `source ~/.nvm/nvm.sh && nvm use 20 &&`.
- **Er is een live PRODUCTIEDATABASE bereikbaar via `.env.local`,** met echte uren en verstuurde facturen. Draai NOOIT `npm run db:push` of `npm run db:migrate`. Lezen mag. **Dit traject wijzigt het schema niet**, dus er is geen enkele reden om een migratiecommando aan te raken.
- Prisma leest `.env.local` niet vanzelf: `prisma.config.ts` doet `import "dotenv/config"`, wat alleen `.env` laadt. Laad hem expliciet met `set -a; . ./.env.local; set +a` vóór een leescommando, en draai Prisma-scripts vanaf de repo-root.
- **Dit is niet de Next.js die je kent.** Lees `node_modules/next/dist/docs/` voordat je aannames doet. Clientcomponenten hebben `"use client"` nodig; route-params zijn een Promise (`const { id } = await params`).
- `src/lib/roles.ts` is canoniek voor rolcontroles. `(session.user as any)?.role ?? "EMPLOYEE"` is de vaste manier waarop deze codebase de rol van de sessie leest.
- **Alle zichtbare tekst is Nederlands.** `Forbidden`, `Unauthorized` en `Not found` zijn de bestaande machinegerichte foutteksten en blijven Engels.
- Exacte weigeringsteksten, status 400: `Er bestaat al een tag met deze naam` en `Deze tag wordt gebruikt door de loonverwerking en kan niet hernoemd worden`.
- **`GET /api/tags` blijft ongewijzigd.** Hij is bereikbaar voor élke rol omdat de rapportfilters erop draaien. Voeg er geen `_count`, `include` of `select` van projecten aan toe — dat zou iedere medewerker een volledige projectlijst per tag geven.
- Testcommando: `npm test`. Baseline: **18 bestanden, 166 tests groen.**
- Lint: `npm run lint`. **De baseline is niet schoon:** 311 errors en 20 warnings, vrijwel allemaal `@typescript-eslint/no-explicit-any`, want deze codebase gebruikt `any` overal. De gate is *geen nieuwe soorten lint-fouten*.
- **`npx tsc --noEmit` meldt 0 fouten over de hele repo en moet dat blijven doen.**
- `npm run build` kan niet draaien zonder `.env`; gebruik `tsc` als vangnet.
- Testconventie: uitsluitend pure functies in `src/lib/*.test.ts` met vitest. Er bestaan geen component- of API-tests en die worden hier niet geïntroduceerd.

---

## File Structure

**Nieuw:**

| Bestand | Verantwoordelijkheid |
|---|---|
| `src/lib/tags.ts` | Naamnormalisatie, de gereserveerde naam, en het samenvoegen van ingetypte met bestaande namen. Puur. |
| `src/lib/tags.test.ts` | Tests daarvoor. |
| `src/app/api/tags/[id]/route.ts` | `PUT` — hernoemen, met samenvoegen bij een botsing. |
| `src/app/(app)/tags/page.tsx` | Servercomponent, adminonly, haalt tags met hun projecten op. |
| `src/components/tags/tags-client.tsx` | De tabel, het aanmaakveld, inline hernoemen, de samenvoegbevestiging. |
| `src/app/api/projects/bulk-tag/route.ts` | Eén tag toevoegen aan of verwijderen van een reeks projecten. |

**Gewijzigd:**

| Bestand | Wat |
|---|---|
| `src/app/api/payroll/route.ts` | De letterlijke string `"wbso"` wordt `RESERVED_TAG_NAME`. |
| `src/lib/api.ts` | `findTagByName` en `resolveTagNames` erbij. |
| `src/app/api/tags/route.ts` | `POST` erbij. `GET` blijft ongemoeid. |
| `src/app/api/projects/route.ts` | Tagnamen door `resolveTagNames` vóór de `connectOrCreate`. |
| `src/app/api/projects/[id]/route.ts` | Idem. |
| `src/components/layout/sidebar.tsx` | Menu-item `/tags` onder Beheer. |
| `src/components/projects/projects-client.tsx` | Twee bulkknoppen en het tagdialoogje. |

---

## Task 1: De pure tagmodule en de gereserveerde naam

**Files:**
- Create: `src/lib/tags.ts`, `src/lib/tags.test.ts`
- Modify: `src/app/api/payroll/route.ts`

**Interfaces:**
- Produces:
  - `RESERVED_TAG_NAME: string` — de constante `"wbso"`.
  - `normalizeTagName(name: string): string`
  - `isReservedTagName(name: string): boolean`

De loonverwerking zoekt vandaag hardgecodeerd naar een tag met de naam `"wbso"`. Zodra er een
hernoemknop bestaat, kan iemand die tag omdopen en gaan de WBSO-uren stilzwijgend naar nul. Die
naam moet dus op één plek staan die zowel de payrollroute als de tagroute leest.

- [ ] **Step 1: Write the failing test**

Create `src/lib/tags.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { normalizeTagName, isReservedTagName, RESERVED_TAG_NAME } from "./tags";

describe("normalizeTagName", () => {
  it("trims surrounding whitespace", () => {
    expect(normalizeTagName(" Marketing ")).toBe("marketing");
  });

  it("lowercases", () => {
    expect(normalizeTagName("MARKETING")).toBe("marketing");
  });

  it("maps two spellings of one name onto the same key", () => {
    expect(normalizeTagName("Marketing")).toBe(normalizeTagName(" marketing"));
  });

  it("returns an empty string for whitespace only", () => {
    expect(normalizeTagName("   ")).toBe("");
  });
});

describe("isReservedTagName", () => {
  it("recognises the payroll tag in any spelling", () => {
    expect(isReservedTagName("wbso")).toBe(true);
    expect(isReservedTagName("WBSO")).toBe(true);
    expect(isReservedTagName(" Wbso ")).toBe(true);
  });

  it("does not over-reach to names that merely contain it", () => {
    expect(isReservedTagName("wbso2")).toBe(false);
    expect(isReservedTagName("efro")).toBe(false);
    expect(isReservedTagName("")).toBe(false);
  });

  it("exports the reserved name so payroll and the tag routes cannot drift", () => {
    expect(RESERVED_TAG_NAME).toBe("wbso");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `source ~/.nvm/nvm.sh && nvm use 20 && npx vitest run src/lib/tags.test.ts`
Expected: FAIL — `Failed to resolve import "./tags"`.

- [ ] **Step 3: Write the module**

Create `src/lib/tags.ts`:

```ts
/**
 * De tagnaam waar `GET /api/payroll` op zoekt om WBSO-uren per medewerker te
 * bepalen. Die route matcht hoofdletterongevoelig, dus de schrijfwijze van de
 * tag zelf maakt niet uit — maar de naam wel.
 *
 * Hij staat hier omdat er sinds dit traject een hernoemknop bestaat. Zou de
 * payrollroute zijn eigen letterlijke string houden, dan kan iemand de tag
 * omdopen en gaan de WBSO-uren stil naar nul zonder enig signaal in de UI.
 * `PUT /api/tags/[id]` weigert daarom te hernoemen wat hier gereserveerd is.
 */
export const RESERVED_TAG_NAME = "wbso";

/** De sleutel waarop tagnamen vergeleken worden: getrimd en zonder hoofdletters. */
export function normalizeTagName(name: string): string {
  return name.trim().toLowerCase();
}

export function isReservedTagName(name: string): boolean {
  return normalizeTagName(name) === RESERVED_TAG_NAME;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `source ~/.nvm/nvm.sh && nvm use 20 && npx vitest run src/lib/tags.test.ts`
Expected: PASS, 7 tests.

- [ ] **Step 5: Laat de payrollroute dezelfde constante gebruiken**

In `src/app/api/payroll/route.ts` staat in een `prisma.timeEntry.groupBy` deze regel:

```ts
          project: { tags: { some: { name: { equals: "wbso", mode: "insensitive" } } } },
```

Wijzig hem naar:

```ts
          project: { tags: { some: { name: { equals: RESERVED_TAG_NAME, mode: "insensitive" } } } },
```

En voeg bovenaan het bestand toe, bij de andere imports:

```ts
import { RESERVED_TAG_NAME } from "@/lib/tags";
```

Het gedrag verandert niet: `RESERVED_TAG_NAME` is exact `"wbso"`, en `mode: "insensitive"` blijft
staan.

- [ ] **Step 6: Controleer dat er geen tweede hardgecodeerde wbso is blijven staan**

Run: `grep -rn "wbso" --include=*.ts --include=*.tsx src/`

Expected: treffers in `src/lib/tags.ts` (de constante en de tests), in `src/lib/tags.test.ts`, en in
`src/app/api/payroll/route.ts` alleen als variabelenaam (`wbso`, `wbsoMap`) — géén tweede letterlijke
`"wbso"`-string in een query. Vind je er wel een, wijzig die dan ook naar `RESERVED_TAG_NAME` en meld
het in je rapport.

- [ ] **Step 7: Controleer de typen en de volledige suite**

Run: `source ~/.nvm/nvm.sh && nvm use 20 && npx tsc --noEmit`
Expected: 0 fouten.

Run: `source ~/.nvm/nvm.sh && nvm use 20 && npm test`
Expected: 19 bestanden, 173 tests, groen.

- [ ] **Step 8: Commit**

```bash
git add src/lib/tags.ts src/lib/tags.test.ts src/app/api/payroll/route.ts
git commit -m "feat: gedeelde tagnaamregels en de gereserveerde wbso-naam"
```

---

## Task 2: De tagroutes — aanmaken, hernoemen, samenvoegen

**Files:**
- Modify: `src/lib/api.ts` (functie erbij, onderaan)
- Modify: `src/app/api/tags/route.ts` (`POST` erbij)
- Create: `src/app/api/tags/[id]/route.ts`

**Interfaces:**
- Consumes: `isReservedTagName` uit `src/lib/tags.ts`.
- Produces:
  - `findTagByName(name: string): Promise<{ id: string; name: string } | null>` in `src/lib/api.ts`.
  - `POST /api/tags` met `{ name }` → 201 met `{ id, name, createdAt, projects: [] }`.
  - `PUT /api/tags/[id]` met `{ name }` → `{ id, name, createdAt }`, of `{ conflict: { id, name, projectCount } }` bij een botsing.
  - `PUT /api/tags/[id]` met `{ name, mergeInto }` → `{ merged: true, into: string }`.

**Deze taak levert geen unittests op.** Alles wat hier bijkomt is querycode; de pure logica zit al in
Task 1. De gate is `npx tsc --noEmit` en het lezen van de handlers.

- [ ] **Step 1: Voeg de gedeelde opzoekfunctie toe**

Onderaan `src/lib/api.ts`, ná `projectNameTakenError`:

```ts
/**
 * Zoekt een tag op naam, hoofdletterongevoelig en getrimd. Geeft de BESTAANDE
 * schrijfwijze terug, niet de ingetypte — aanroepers hebben die nodig om te
 * kunnen tonen waar iets mee botst, en om te koppelen aan de tag die er al is.
 *
 * De @unique op Tag.name is hoofdlettergevoelig; deze functie is de echte regel
 * en die unique blijft eronder liggen als vangnet.
 */
export async function findTagByName(name: string): Promise<{ id: string; name: string } | null> {
  return prisma.tag.findFirst({
    where: { name: { equals: name.trim(), mode: "insensitive" } },
    select: { id: true, name: true },
  });
}
```

`prisma` wordt bovenin dit bestand al geïmporteerd; voeg geen import toe.

- [ ] **Step 2: Voeg `POST` toe aan `src/app/api/tags/route.ts`**

Vervang de imports bovenaan door:

```ts
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { z } from "zod";
import { handleError, findTagByName } from "@/lib/api";
import { isAdmin } from "@/lib/roles";
```

Laat de bestaande `GET` volledig ongemoeid en voeg eronder toe:

```ts
const createSchema = z.object({ name: z.string().trim().min(1) });

export async function POST(req: Request) {
  try {
    const session = await auth();
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const role = (session.user as any)?.role ?? "EMPLOYEE";
    if (!isAdmin(role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const { name } = createSchema.parse(await req.json());
    if (await findTagByName(name)) {
      return NextResponse.json({ error: "Er bestaat al een tag met deze naam" }, { status: 400 });
    }

    const tag = await prisma.tag.create({ data: { name } });
    // projects: [] zodat de beheerpagina de nieuwe rij direct in zijn state kan
    // zetten zonder een tweede rondje naar de server.
    return NextResponse.json({ ...tag, projects: [] }, { status: 201 });
  } catch (e: any) {
    // Vangnet voor de @unique: alleen bereikbaar wanneer twee mensen tegelijk
    // dezelfde naam opslaan, want de controle hierboven is ruimer dan de index.
    if (e?.code === "P2002") {
      return NextResponse.json({ error: "Er bestaat al een tag met deze naam" }, { status: 400 });
    }
    return handleError(e);
  }
}
```

- [ ] **Step 3: Maak de hernoem- en samenvoegroute**

Create `src/app/api/tags/[id]/route.ts`:

```ts
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { z } from "zod";
import { handleError, findTagByName } from "@/lib/api";
import { isAdmin } from "@/lib/roles";
import { isReservedTagName } from "@/lib/tags";

const schema = z.object({
  name: z.string().trim().min(1),
  mergeInto: z.string().min(1).optional(),
});

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await auth();
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const role = (session.user as any)?.role ?? "EMPLOYEE";
    if (!isAdmin(role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    const { id } = await params;

    const { name, mergeInto } = schema.parse(await req.json());

    const tag = await prisma.tag.findUnique({ where: { id }, select: { id: true, name: true } });
    if (!tag) return NextResponse.json({ error: "Not found" }, { status: 404 });

    // De loonverwerking zoekt op deze naam. Hernoemen laat de WBSO-uren stil
    // naar nul gaan; samenvoegen wist de tag helemaal, met hetzelfde gevolg.
    // Deze guard dekt allebei, want beide lopen door deze route.
    if (isReservedTagName(tag.name)) {
      return NextResponse.json(
        { error: "Deze tag wordt gebruikt door de loonverwerking en kan niet hernoemd worden" },
        { status: 400 },
      );
    }

    if (mergeInto) {
      if (mergeInto === id) {
        return NextResponse.json({ error: "Een tag kan niet met zichzelf samengevoegd worden" }, { status: 400 });
      }
      const doel = await prisma.tag.findUnique({ where: { id: mergeInto }, select: { id: true } });
      if (!doel) return NextResponse.json({ error: "Onbekende tag om naar samen te voegen" }, { status: 400 });

      const bron = await prisma.tag.findUnique({
        where: { id },
        select: { projects: { select: { id: true } } },
      });

      // De relatie is een set: `connect` op een project dat de doeltag al heeft
      // is een no-op, dus een project dat aan beide tags hing komt er één keer
      // uit. Alles in één transactie, zodat de brontag nooit verdwijnt terwijl
      // zijn projecten nog niet verhuisd zijn.
      await prisma.$transaction([
        ...(bron?.projects ?? []).map((p) =>
          prisma.project.update({
            where: { id: p.id },
            data: { tags: { connect: { id: mergeInto } } },
          }),
        ),
        prisma.tag.delete({ where: { id } }),
      ]);

      return NextResponse.json({ merged: true, into: mergeInto });
    }

    const bestaand = await findTagByName(name);
    if (bestaand && bestaand.id !== id) {
      const projectCount = await prisma.project.count({ where: { tags: { some: { id: bestaand.id } } } });
      // Geen fout maar een vraag: dit is precies het geval waarin samenvoegen
      // het enige zinnige antwoord is. Er is nog niets gewijzigd.
      return NextResponse.json({ conflict: { id: bestaand.id, name: bestaand.name, projectCount } });
    }

    const updated = await prisma.tag.update({ where: { id }, data: { name } });
    return NextResponse.json(updated);
  } catch (e: any) {
    if (e?.code === "P2002") {
      return NextResponse.json({ error: "Er bestaat al een tag met deze naam" }, { status: 400 });
    }
    return handleError(e);
  }
}
```

- [ ] **Step 4: Controleer dat `GET /api/tags` niet is aangetast**

Run: `git diff src/app/api/tags/route.ts`

Stel vast dat binnen de `GET`-handler geen enkele regel gewijzigd is — geen `include`, geen `select`,
geen rolcontrole erbij. Die route is bereikbaar voor élke rol omdat de rapportfilters erop draaien,
en hij hoort kale tags te blijven geven.

- [ ] **Step 5: Controleer de typen en de tests**

Run: `source ~/.nvm/nvm.sh && nvm use 20 && npx tsc --noEmit`
Expected: 0 fouten.

Run: `source ~/.nvm/nvm.sh && nvm use 20 && npm test`
Expected: 19 bestanden, 173 tests, groen. Deze taak voegt geen tests toe en mag er geen breken.

- [ ] **Step 6: Commit**

```bash
git add src/lib/api.ts src/app/api/tags/route.ts "src/app/api/tags/[id]/route.ts"
git commit -m "feat: tags aanmaken, hernoemen en samenvoegen"
```

---

## Task 3: De beheerpagina

**Files:**
- Create: `src/app/(app)/tags/page.tsx`, `src/components/tags/tags-client.tsx`
- Modify: `src/components/layout/sidebar.tsx`

**Interfaces:**
- Consumes: `POST /api/tags`, `PUT /api/tags/[id]` uit Task 2; `isReservedTagName` uit Task 1.
- Produces: niets voor latere taken.

**Deze taak levert geen unittests op.** Het is een servercomponent met een query en een
clientcomponent met formuliertoestand; de repo heeft geen componenttests.

- [ ] **Step 1: Maak de servercomponent**

Create `src/app/(app)/tags/page.tsx`:

```tsx
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { isAdmin } from "@/lib/roles";
import { TagsClient } from "@/components/tags/tags-client";

export default async function TagsPage() {
  const session = await auth();
  if (!isAdmin((session?.user as any)?.role ?? "EMPLOYEE")) redirect("/");

  // Eigen query, bewust niet via GET /api/tags: die route is voor élke rol
  // bereikbaar vanwege de rapportfilters en mag geen projectlijsten prijsgeven.
  const tags = await prisma.tag.findMany({
    orderBy: { name: "asc" },
    select: {
      id: true,
      name: true,
      projects: {
        orderBy: { name: "asc" },
        select: { id: true, name: true, archivedAt: true, customer: { select: { name: true } } },
      },
    },
  });

  return (
    <TagsClient
      initialTags={tags.map((t) => ({
        id: t.id,
        name: t.name,
        // archivedAt is een Date; als boolean doorgeven scheelt serialisatie
        // en de client heeft niets aan het tijdstip.
        projects: t.projects.map((p) => ({
          id: p.id,
          name: p.name,
          archived: p.archivedAt !== null,
          customer: p.customer,
        })),
      }))}
    />
  );
}
```

- [ ] **Step 2: Maak de clientcomponent**

Create `src/components/tags/tags-client.tsx`:

```tsx
"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Plus, Pencil, Check, X, ChevronRight, ChevronDown } from "lucide-react";
import { isReservedTagName } from "@/lib/tags";

interface TagProject {
  id: string;
  name: string;
  archived: boolean;
  customer: { name: string } | null;
}
interface TagRow {
  id: string;
  name: string;
  projects: TagProject[];
}
interface Conflict {
  bronId: string;
  bronNaam: string;
  doelId: string;
  doelNaam: string;
  projectCount: number;
  aantalTeVerhuizen: number;
}

export function TagsClient({ initialTags }: { initialTags: TagRow[] }) {
  const router = useRouter();
  const [tags, setTags] = useState(initialTags);
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [open, setOpen] = useState<string[]>([]);
  const [serverError, setServerError] = useState("");
  const [conflict, setConflict] = useState<Conflict | null>(null);

  function toggle(id: string) {
    setOpen((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }

  async function create() {
    if (!newName.trim()) return;
    setServerError("");
    const res = await fetch("/api/tags", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: newName.trim() }),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      setServerError(body.error ?? `Fout ${res.status}`);
      return;
    }
    setTags((prev) => [...prev, { id: body.id, name: body.name, projects: [] }].sort((a, b) => a.name.localeCompare(b.name)));
    setNewName("");
    setAdding(false);
  }

  async function rename(id: string) {
    if (!editName.trim()) return;
    setServerError("");
    const res = await fetch(`/api/tags/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: editName.trim() }),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      setServerError(body.error ?? `Fout ${res.status}`);
      return;
    }
    if (body.conflict) {
      const bron = tags.find((t) => t.id === id);
      setConflict({
        bronId: id,
        bronNaam: bron?.name ?? "",
        doelId: body.conflict.id,
        doelNaam: body.conflict.name,
        projectCount: body.conflict.projectCount,
        aantalTeVerhuizen: bron?.projects.length ?? 0,
      });
      return;
    }
    setTags((prev) =>
      prev.map((t) => (t.id === id ? { ...t, name: body.name } : t)).sort((a, b) => a.name.localeCompare(b.name)),
    );
    setEditingId(null);
  }

  async function merge() {
    if (!conflict) return;
    setServerError("");
    const res = await fetch(`/api/tags/${conflict.bronId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: conflict.doelNaam, mergeInto: conflict.doelId }),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      setServerError(body.error ?? `Fout ${res.status}`);
      return;
    }
    setConflict(null);
    setEditingId(null);
    // De projectlijsten van twee tags samenvoegen in clienttoestand is precies
    // het soort handwerk dat stil misgaat. De servercomponent weet het exact.
    router.refresh();
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Tags</h1>
          <p className="text-muted-foreground">Beheer de tags waarmee u projecten groepeert</p>
        </div>
        <Button onClick={() => { setAdding(true); setNewName(""); setServerError(""); }}>
          <Plus className="h-4 w-4 mr-2" /> Tag toevoegen
        </Button>
      </div>

      {serverError && <p className="text-sm text-destructive">{serverError}</p>}

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-10"></TableHead>
                <TableHead>Tag</TableHead>
                <TableHead className="text-right">Projecten</TableHead>
                <TableHead className="text-right">Gearchiveerd</TableHead>
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {adding && (
                <TableRow>
                  <TableCell></TableCell>
                  <TableCell colSpan={3}>
                    <Input
                      autoFocus
                      value={newName}
                      onChange={(e) => setNewName(e.target.value)}
                      onKeyDown={(e) => { if (e.key === "Enter") create(); if (e.key === "Escape") setAdding(false); }}
                      placeholder="Naam van de tag"
                      className="h-7"
                    />
                  </TableCell>
                  <TableCell>
                    <div className="flex gap-1 justify-end">
                      <Button variant="ghost" size="icon" onClick={create}><Check className="h-3.5 w-3.5 text-primary" /></Button>
                      <Button variant="ghost" size="icon" onClick={() => setAdding(false)}><X className="h-3.5 w-3.5" /></Button>
                    </div>
                  </TableCell>
                </TableRow>
              )}
              {tags.length === 0 && !adding && (
                <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-8">Geen tags gevonden</TableCell></TableRow>
              )}
              {tags.map((t) => {
                const actief = t.projects.filter((p) => !p.archived);
                const gearchiveerd = t.projects.length - actief.length;
                const uitgeklapt = open.includes(t.id);
                const gereserveerd = isReservedTagName(t.name);
                return (
                  <>
                    <TableRow key={t.id}>
                      <TableCell>
                        {t.projects.length > 0 && (
                          <Button variant="ghost" size="icon" onClick={() => toggle(t.id)} title="Projecten tonen">
                            {uitgeklapt ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
                          </Button>
                        )}
                      </TableCell>
                      <TableCell className="font-medium">
                        {editingId === t.id ? (
                          <Input
                            autoFocus
                            value={editName}
                            onChange={(e) => setEditName(e.target.value)}
                            onKeyDown={(e) => { if (e.key === "Enter") rename(t.id); if (e.key === "Escape") setEditingId(null); }}
                            className="h-7"
                          />
                        ) : (
                          <span className="flex items-center gap-2">
                            {t.name}
                            {gereserveerd && (
                              <Badge variant="secondary" className="text-xs">gebruikt door de loonverwerking</Badge>
                            )}
                            {t.projects.length === 0 && (
                              <Badge variant="outline" className="text-xs">niet in gebruik</Badge>
                            )}
                          </span>
                        )}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">{actief.length}</TableCell>
                      <TableCell className="text-right tabular-nums">{gearchiveerd || "—"}</TableCell>
                      <TableCell>
                        <div className="flex gap-1 justify-end">
                          {editingId === t.id ? (
                            <>
                              <Button variant="ghost" size="icon" onClick={() => rename(t.id)}><Check className="h-3.5 w-3.5 text-primary" /></Button>
                              <Button variant="ghost" size="icon" onClick={() => setEditingId(null)}><X className="h-3.5 w-3.5" /></Button>
                            </>
                          ) : (
                            <Button
                              variant="ghost"
                              size="icon"
                              disabled={gereserveerd}
                              title={gereserveerd ? "Deze tag wordt gebruikt door de loonverwerking" : "Hernoemen"}
                              onClick={() => { setEditingId(t.id); setEditName(t.name); setServerError(""); }}
                            >
                              <Pencil className="h-3.5 w-3.5" />
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                    {uitgeklapt && (
                      <TableRow key={`${t.id}-projecten`}>
                        <TableCell></TableCell>
                        <TableCell colSpan={4} className="text-sm text-muted-foreground">
                          <div className="space-y-0.5 py-1">
                            {t.projects.map((p) => (
                              <div key={p.id}>
                                {p.customer?.name ?? "— geen klant —"} / {p.name}
                                {p.archived && <span className="ml-2 text-xs">(gearchiveerd)</span>}
                              </div>
                            ))}
                          </div>
                        </TableCell>
                      </TableRow>
                    )}
                  </>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Dialog open={conflict !== null} onOpenChange={(o) => { if (!o) setConflict(null); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Tags samenvoegen?</DialogTitle>
          </DialogHeader>
          {conflict && (
            <p className="text-sm">
              <span className="font-medium">{conflict.doelNaam}</span> bestaat al met {conflict.projectCount} project(en).
              De {conflict.aantalTeVerhuizen} project(en) van <span className="font-medium">{conflict.bronNaam}</span> worden
              aan <span className="font-medium">{conflict.doelNaam}</span> gekoppeld en{" "}
              <span className="font-medium">{conflict.bronNaam}</span> verdwijnt.
            </p>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setConflict(null)}>Annuleren</Button>
            <Button onClick={merge}>Samenvoegen</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
```

**Let op de `<>`-fragmenten in de tabel.** Elke rij levert twee `<TableRow>`s op wanneer hij
uitgeklapt is. React eist een `key` op het buitenste element van een lijst-item; die staat hier op de
twee `TableRow`s. Krijg je een key-waarschuwing in de console, zet het fragment dan om naar
`<Fragment key={t.id}>` met `import { Fragment } from "react"` — niet naar een `<div>`, want dat mag
niet binnen een `<tbody>`.

- [ ] **Step 3: Voeg het menu-item toe**

In `src/components/layout/sidebar.tsx` staat de groep **Beheer**:

```tsx
      { href: "/customers", label: "Klanten", icon: Users },
      { href: "/projects", label: "Projecten", icon: FolderOpen },
      { href: "/users", label: "Gebruikers", icon: UserCog },
      { href: "/payroll", label: "Loonverwerking", icon: Wallet },
```

Voeg direct ná de Projecten-regel toe:

```tsx
      { href: "/tags", label: "Tags", icon: Tag },
```

`Tag` wordt in dit bestand al geïmporteerd uit lucide-react — hij staat nu bij
Uitgavencategorieën. Voeg geen import toe. De groep Beheer heeft al `roles: ["ADMIN"]`, dus het item
is vanzelf adminonly.

- [ ] **Step 4: Controleer de typen en de tests**

Run: `source ~/.nvm/nvm.sh && nvm use 20 && npx tsc --noEmit`
Expected: 0 fouten.

Run: `source ~/.nvm/nvm.sh && nvm use 20 && npm test`
Expected: 19 bestanden, 173 tests, groen.

- [ ] **Step 5: Commit**

```bash
git add "src/app/(app)/tags/page.tsx" src/components/tags/tags-client.tsx src/components/layout/sidebar.tsx
git commit -m "feat: beheerpagina voor tags"
```

---

## Task 4: Het projectformulier maakt geen bijna-duplicaten meer

**Files:**
- Modify: `src/lib/tags.ts`, `src/lib/tags.test.ts`
- Modify: `src/lib/api.ts`
- Modify: `src/app/api/projects/route.ts`
- Modify: `src/app/api/projects/[id]/route.ts`

**Interfaces:**
- Consumes: `normalizeTagName` uit Task 1, `findTagByName` uit Task 2.
- Produces:
  - `canonicalizeTagNames(input: string[], existing: string[]): string[]` in `src/lib/tags.ts` — puur.
  - `resolveTagNames(names: string[]): Promise<string[]>` in `src/lib/api.ts` — haalt de bestaande namen op en roept de pure functie aan.

Het tagveld in het projectformulier is vrije tekst, en `connectOrCreate` matcht exact. Typ je
`Marketing` waar `marketing` bestaat, dan komt er stil een tweede tagrij bij. Dit is de plek waar
bijna-duplicaten daadwerkelijk ontstaan; de beheerpagina kan ze daarna alleen nog opruimen.

- [ ] **Step 1: Write the failing test**

Voeg onderaan `src/lib/tags.test.ts` toe:

```ts
import { canonicalizeTagNames } from "./tags";

describe("canonicalizeTagNames", () => {
  it("replaces a typed spelling with the existing one", () => {
    expect(canonicalizeTagNames(["Marketing"], ["marketing", "WBSO"])).toEqual(["marketing"]);
  });

  it("keeps a genuinely new name as typed", () => {
    expect(canonicalizeTagNames(["EFRO"], ["marketing"])).toEqual(["EFRO"]);
  });

  it("trims what the user typed", () => {
    expect(canonicalizeTagNames(["  EFRO  "], [])).toEqual(["EFRO"]);
  });

  it("drops blank entries", () => {
    expect(canonicalizeTagNames(["", "   ", "EFRO"], [])).toEqual(["EFRO"]);
  });

  it("collapses two spellings of one new name into a single tag", () => {
    // Anders maakt één opslagactie meteen twee bijna-gelijke tags aan.
    expect(canonicalizeTagNames(["EFRO", "efro"], [])).toEqual(["EFRO"]);
  });

  it("collapses onto the existing spelling when both are typed", () => {
    expect(canonicalizeTagNames(["Marketing", "marketing"], ["marketing"])).toEqual(["marketing"]);
  });

  it("preserves the order in which names were typed", () => {
    expect(canonicalizeTagNames(["b", "a"], [])).toEqual(["b", "a"]);
  });

  it("returns an empty array for no input", () => {
    expect(canonicalizeTagNames([], ["marketing"])).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `source ~/.nvm/nvm.sh && nvm use 20 && npx vitest run src/lib/tags.test.ts`
Expected: FAIL — `canonicalizeTagNames is not a function` of een importfout.

- [ ] **Step 3: Write the implementation**

Voeg onderaan `src/lib/tags.ts` toe:

```ts
/**
 * Zet ingetypte tagnamen om naar de namen die daadwerkelijk opgeslagen moeten
 * worden: bestaat er al een tag met dezelfde genormaliseerde naam, dan wint de
 * BESTAANDE schrijfwijze. Zo levert "Marketing" naast een bestaande "marketing"
 * een koppeling op in plaats van een tweede tag.
 *
 * Ontdubbelt op de genormaliseerde sleutel, niet op de letterlijke tekst — anders
 * maakt één opslagactie waarin iemand "EFRO" en "efro" typt alsnog twee tags.
 */
export function canonicalizeTagNames(input: string[], existing: string[]): string[] {
  const perSleutel = new Map<string, string>();
  for (const naam of existing) {
    perSleutel.set(normalizeTagName(naam), naam);
  }
  const uit = new Map<string, string>();
  for (const ruw of input) {
    const naam = ruw.trim();
    if (!naam) continue;
    const sleutel = normalizeTagName(naam);
    if (!uit.has(sleutel)) uit.set(sleutel, perSleutel.get(sleutel) ?? naam);
  }
  return [...uit.values()];
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `source ~/.nvm/nvm.sh && nvm use 20 && npx vitest run src/lib/tags.test.ts`
Expected: PASS, 15 tests.

- [ ] **Step 5: Voeg de databasekant toe aan `src/lib/api.ts`**

Onderaan `src/lib/api.ts`, ná `findTagByName`:

```ts
/**
 * Haalt de bestaande tagnamen op en laat `canonicalizeTagNames` bepalen welke
 * namen er opgeslagen moeten worden. Eén query voor de hele set — er zijn
 * hooguit enkele tientallen tags, dus per naam opzoeken zou verspilling zijn.
 */
export async function resolveTagNames(names: string[]): Promise<string[]> {
  if (names.length === 0) return [];
  const bestaande = await prisma.tag.findMany({ select: { name: true } });
  return canonicalizeTagNames(names, bestaande.map((t) => t.name));
}
```

En voeg bovenaan `src/lib/api.ts` toe bij de imports:

```ts
import { canonicalizeTagNames } from "./tags";
```

- [ ] **Step 6: Gebruik hem in `POST /api/projects`**

In `src/app/api/projects/route.ts`, wijzig de import op regel 5 naar:

```ts
import { handleError, projectNameTakenError, resolveTagNames } from "@/lib/api";
```

In `POST`, direct ná de regel met `const nameError = await projectNameTakenError(rest.name);` en zijn
`if`, voeg toe:

```ts
    // Het tagveld is vrije tekst en connectOrCreate matcht exact; zonder deze
    // stap levert "Marketing" naast een bestaande "marketing" een tweede tag op.
    const tagNamen = tags ? await resolveTagNames(tags) : undefined;
```

Vervang daarna in de `prisma.project.create` het hele tags-blok:

```ts
        ...(tags && tags.length > 0
          ? {
              tags: {
                connectOrCreate: tags.map((name) => ({ where: { name }, create: { name } })),
              },
            }
          : {}),
```

door:

```ts
        ...(tagNamen && tagNamen.length > 0
          ? {
              tags: {
                connectOrCreate: tagNamen.map((name) => ({ where: { name }, create: { name } })),
              },
            }
          : {}),
```

- [ ] **Step 7: Gebruik hem in `PUT /api/projects/[id]`**

In `src/app/api/projects/[id]/route.ts`, wijzig de import op regel 5 naar:

```ts
import { handleError, projectNameTakenError, resolveTagNames } from "@/lib/api";
```

In `PUT`, direct ná `const nameError = await projectNameTakenError(rest.name, id);` en zijn `if`,
voeg toe:

```ts
    const tagNamen = tags ? await resolveTagNames(tags) : undefined;
```

Vervang in de `prisma.project.update` het tags-blok:

```ts
        tags: {
          set: [],
          ...(tags && tags.length > 0
            ? {
                connectOrCreate: tags.map((name) => ({
                  where: { name },
                  create: { name },
                })),
              }
            : {}),
        },
```

door:

```ts
        tags: {
          set: [],
          ...(tagNamen && tagNamen.length > 0
            ? {
                connectOrCreate: tagNamen.map((name) => ({
                  where: { name },
                  create: { name },
                })),
              }
            : {}),
        },
```

Let op: `set: []` blijft staan. Dat is wat een weggehaalde tag daadwerkelijk loskoppelt.

- [ ] **Step 8: Controleer dat er geen `connectOrCreate` op ruwe tagnamen is blijven staan**

Run: `grep -rn "connectOrCreate" --include=*.ts src/app/api/`

Expected: precies twee treffers, beide op `tagNamen.map(...)`. Vind je er één die nog `tags.map(...)`
gebruikt, dan is die route de dedupe misgelopen.

- [ ] **Step 9: Controleer de typen en de volledige suite**

Run: `source ~/.nvm/nvm.sh && nvm use 20 && npx tsc --noEmit`
Expected: 0 fouten.

Run: `source ~/.nvm/nvm.sh && nvm use 20 && npm test`
Expected: 19 bestanden, 181 tests, groen.

- [ ] **Step 10: Commit**

```bash
git add src/lib/tags.ts src/lib/tags.test.ts src/lib/api.ts src/app/api/projects/route.ts "src/app/api/projects/[id]/route.ts"
git commit -m "feat: projectformulier hergebruikt bestaande tags ongeacht hoofdletters"
```

---

## Task 5: Tags in bulk toewijzen

**Files:**
- Create: `src/app/api/projects/bulk-tag/route.ts`
- Modify: `src/components/projects/projects-client.tsx`

**Interfaces:**
- Consumes: `isAdmin` uit `src/lib/roles.ts`, `handleError` uit `src/lib/api.ts`.
- Produces: `POST /api/projects/bulk-tag` met `{ ids: string[], tagId: string, action: "add" | "remove" }`, antwoord `{ count: number }`.

**Deze taak levert geen unittests op.** De route is querycode en de rest is formuliertoestand.

- [ ] **Step 1: Maak de route**

Create `src/app/api/projects/bulk-tag/route.ts`:

```ts
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { z } from "zod";
import { handleError } from "@/lib/api";
import { isAdmin } from "@/lib/roles";

const schema = z.object({
  ids: z.array(z.string().min(1)).min(1).max(500),
  tagId: z.string().min(1),
  action: z.enum(["add", "remove"]),
});

export async function POST(req: Request) {
  try {
    const session = await auth();
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const role = (session.user as any)?.role ?? "EMPLOYEE";
    if (!isAdmin(role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const { ids, tagId, action } = schema.parse(await req.json());

    const tag = await prisma.tag.findUnique({ where: { id: tagId }, select: { id: true } });
    if (!tag) return NextResponse.json({ error: "Onbekende tag" }, { status: 400 });

    // Alleen de projecten die daadwerkelijk veranderen: bij "add" die de tag nog
    // niet hebben, bij "remove" die hem wel hebben. Zo telt count wat er echt is
    // gewijzigd, en niet hoeveel ids er binnenkwamen.
    const teWijzigen = await prisma.project.findMany({
      where: {
        id: { in: ids },
        tags: action === "add" ? { none: { id: tagId } } : { some: { id: tagId } },
      },
      select: { id: true },
    });

    if (teWijzigen.length > 0) {
      // updateMany kan geen relaties wijzigen, dus per project een update —
      // wel in één transactie, zodat het alles of niets is.
      await prisma.$transaction(
        teWijzigen.map((p) =>
          prisma.project.update({
            where: { id: p.id },
            data: {
              tags: action === "add" ? { connect: { id: tagId } } : { disconnect: { id: tagId } },
            },
          }),
        ),
      );
    }

    return NextResponse.json({ count: teWijzigen.length });
  } catch (e) { return handleError(e); }
}
```

- [ ] **Step 2: Voeg de toestand voor het dialoogje toe**

In `src/components/projects/projects-client.tsx`, direct ná de regel
`const [selected, setSelected] = useState<string[]>([]);`:

```tsx
  const [tagActie, setTagActie] = useState<"add" | "remove" | null>(null);
  const [tagKeuze, setTagKeuze] = useState("");
```

- [ ] **Step 3: Voeg de bulkfunctie toe**

Direct ná de bestaande functie `archiveSelected`:

```tsx
  async function applyTag() {
    if (!tagActie || !tagKeuze) return;
    // selectedVisible, niet selected: wie eerst aanvinkt en daarna het filter
    // wijzigt, mag geen project taggen dat hij niet meer ziet staan.
    const ids = selectedVisible.map((p) => p.id);
    const res = await fetch("/api/projects/bulk-tag", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids, tagId: tagKeuze, action: tagActie }),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      alert(body.error ?? `Fout ${res.status}`);
      return;
    }
    if (body.count < ids.length) {
      // Een project dat de tag al had (of juist niet had) verandert niet. Zonder
      // deze melding leest "8 geselecteerd, 3 gewijzigd" als een fout.
      const woord = tagActie === "add" ? "had de tag al" : "had de tag niet";
      alert(`${body.count} van de ${ids.length} projecten bijgewerkt; de rest ${woord}.`);
    }
    setTagActie(null);
    setTagKeuze("");
    loadProjects(showArchived);
  }
```

De selectie blijft na afloop bewust staan, zodat je dezelfde reeks projecten meteen een tweede tag
kunt geven.

- [ ] **Step 4: Voeg de twee knoppen toe**

In de kopbalk staat de archiveerknop:

```tsx
          {selectedVisible.length > 0 && (
            <Button variant="destructive" onClick={archiveSelected}>
              Archiveer geselecteerde ({selectedVisible.length})
            </Button>
          )}
```

Voeg daar direct vóór toe:

```tsx
          {selectedVisible.length > 0 && (
            <>
              <Button variant="outline" onClick={() => { setTagActie("add"); setTagKeuze(""); }}>
                Tag toevoegen ({selectedVisible.length})
              </Button>
              <Button variant="outline" onClick={() => { setTagActie("remove"); setTagKeuze(""); }}>
                Tag verwijderen ({selectedVisible.length})
              </Button>
            </>
          )}
```

- [ ] **Step 5: Voeg het dialoogje toe**

Direct vóór het afsluitende `</div>` van de component, ná de bestaande `<Dialog>` van het
projectformulier:

```tsx
      <Dialog open={tagActie !== null} onOpenChange={(o) => { if (!o) setTagActie(null); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>
              {tagActie === "add" ? "Tag toevoegen" : "Tag verwijderen"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            <p className="text-sm text-muted-foreground">
              {selectedVisible.length} geselecteerde project(en).
              {tagActie === "add"
                ? " Bestaande tags van die projecten blijven staan."
                : " Alleen deze tag wordt verwijderd."}
            </p>
            <Select onValueChange={setTagKeuze} value={tagKeuze}>
              <SelectTrigger><SelectValue placeholder="Kies een tag" /></SelectTrigger>
              <SelectContent>
                {allTags.map((t) => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setTagActie(null)}>Annuleren</Button>
            <Button onClick={applyTag} disabled={!tagKeuze}>
              {tagActie === "add" ? "Toevoegen" : "Verwijderen"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
```

`allTags` is al een prop van deze component en bevat `{ id, name }` — de projectenpagina geeft hem
door voor het tagveld in het projectformulier. Voeg geen nieuwe prop toe.

- [ ] **Step 6: Controleer dat beide knoppen dezelfde lijst lezen als de archiveerknop**

Run: `grep -n "selectedVisible" src/components/projects/projects-client.tsx`

Expected: treffers in de definitie, in `allSelected`, in `archiveSelected`, in `applyTag`, in de
archiveerknop, in de twee tagknoppen en in het dialoogje. Vind je ergens een eigen `.filter()` op
`projects` of op `selected` in plaats van `selectedVisible`, dan kan die plek uit de pas lopen met
wat er op het scherm staat.

- [ ] **Step 7: Controleer de typen en de tests**

Run: `source ~/.nvm/nvm.sh && nvm use 20 && npx tsc --noEmit`
Expected: 0 fouten.

Run: `source ~/.nvm/nvm.sh && nvm use 20 && npm test`
Expected: 19 bestanden, 181 tests, groen.

- [ ] **Step 8: Commit**

```bash
git add src/app/api/projects/bulk-tag/route.ts src/components/projects/projects-client.tsx
git commit -m "feat: tags in bulk toevoegen en verwijderen op de projectenlijst"
```

---

## Uitrol

Geen schemawijziging, geen migratie, geen backfill. Deployen is genoeg.

Handmatig na te lopen na de deploy:

- [ ] `/tags` verschijnt in het menu onder Beheer en is voor een medewerker niet bereikbaar (`redirect` naar `/`).
- [ ] De pagina toont `WBSO` met de badge "gebruikt door de loonverwerking" en `EFRO - WP1 programmeerbare hardware` met de badge "niet in gebruik".
- [ ] Het potloodje bij `WBSO` is uitgeschakeld; via de API hernoemen geeft 400 met de reden.
- [ ] Een tag uitklappen toont zijn projecten als `Klant / Project`, gearchiveerde gemarkeerd.
- [ ] Een tag aanmaken die al bestaat, met andere hoofdletters → `Er bestaat al een tag met deze naam`.
- [ ] Een tag hernoemen naar een vrije naam → slaat op, de lijst blijft alfabetisch.
- [ ] Een tag hernoemen naar een bestaande naam → de samenvoegvraag, met het juiste aantal projecten aan beide kanten.
- [ ] Samenvoegen bevestigen → de projecten hangen aan de doeltag, de brontag is weg, een project dat aan beide hing komt één keer voor.
- [ ] Een andere tag samenvoegen naar `WBSO` → mag, en de loonverwerking telt de nieuwe projecten mee.
- [ ] In het projectformulier een bestaande tag met andere hoofdletters typen → koppelt aan de bestaande tag; `/tags` toont geen tweede rij.
- [ ] Vijf projecten aanvinken en een tag toevoegen → de andere tags van die projecten staan er nog.
- [ ] Dezelfde vijf nogmaals dezelfde tag geven → melding dat 0 van de 5 zijn bijgewerkt.
- [ ] Vijf projecten aanvinken en een tag verwijderen → alleen die tag verdwijnt.
- [ ] Aanvinken, dan het statusfilter wijzigen → de tagknoppen tellen alleen wat nog zichtbaar is.
- [ ] Als niet-admin `POST /api/tags`, `PUT /api/tags/[id]` en `POST /api/projects/bulk-tag` aanroepen → 403.
- [ ] `GET /api/tags` geeft nog steeds kale tags zonder projectlijsten, en de tagfilters op `/reports` werken onveranderd.
