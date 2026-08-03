# Project Members Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Laat per project instellen wie erop mag boeken, en dwing dat af op elke route die een registratie met een project aanmaakt of wijzigt.

**Architecture:** Eén koppeltabel `ProjectMember` en twee pure functies bepalen de regel: de **eigenaar** van een registratie moet deelnemer zijn, en bij bewerken wordt alleen getoetst wanneer het project of de eigenaar wijzigt. De handhaving zit server-side in acht routes plus de bulkroute; de projectkeuzelijsten worden op de server gefilterd zodat een medewerker de projecten waarop hij niet mag boeken niet eens binnenkrijgt. Niets wordt verwijderd, dus de uitrol is drie stappen zonder afbraak.

**Tech Stack:** Next.js 16 (App Router), React 19, TypeScript, Prisma 6 + PostgreSQL, zod 3, react-hook-form, Radix UI, Tailwind 4, vitest.

## Global Constraints

- **Node 20 is vereist.** De standaard-node in deze shell is v16 en npm weigert daarop te draaien. Prefix élk npm- of npx-commando met `source ~/.nvm/nvm.sh && nvm use 20 &&`.
- **Er is een live PRODUCTIEDATABASE bereikbaar via `.env.local`,** met echte uren en verstuurde facturen. Draai NOOIT `npm run db:push`, `npm run db:migrate`, of een script met `--write`. Lezen en droog draaien mag. Een mens voert de migratie uit tijdens een gefaseerde uitrol.
- Prisma leest `.env.local` niet vanzelf: `prisma.config.ts` doet `import "dotenv/config"`, wat alleen `.env` laadt. Laad hem expliciet met `set -a; . ./.env.local; set +a` vóór een leescommando.
- Na een wijziging aan `prisma/schema.prisma`: `DATABASE_URL="postgresql://x:x@localhost:5432/x" npx prisma generate`. De dummy-URL garandeert dat je niet bij productie komt; genereren raakt geen database aan.
- Dit project heeft geen `prisma/migrations`-map en gebruikt `db:push`. Wijzig alleen `prisma/schema.prisma`; schrijf geen migratiebestanden.
- **Dit is niet de Next.js die je kent.** Lees `node_modules/next/dist/docs/` voordat je aannames doet. Clientcomponenten hebben `"use client"` nodig; route-params zijn een Promise (`const { id } = await params`).
- `src/lib/roles.ts` is canoniek voor rolcontroles. `(session.user as any)?.role ?? "EMPLOYEE"` is de vaste manier waarop deze codebase de rol van de sessie leest.
- **De eis slaat op de eigenaar van de regel, nooit op de invoerder.** Een admin die namens Piet boekt, heeft Piets deelname nodig, niet die van zichzelf. Er zijn geen uitzonderingen voor admins, ook niet voor hun eigen regels.
- **Alle zichtbare tekst is Nederlands.** De weigering luidt exact `Deze medewerker is geen deelnemer van dit project`, met status 400.
- Testcommando: `npm test`. Baseline: 17 bestanden, 151 tests groen.
- Lint: `npm run lint`. **De baseline is niet schoon:** 291 errors en 20 warnings, vrijwel allemaal `@typescript-eslint/no-explicit-any`, want deze codebase gebruikt `any` overal. De gate is *geen nieuwe soorten lint-fouten*.
- **`npx tsc --noEmit` meldt 0 fouten over de hele repo en moet dat blijven doen.** Dat is een echt signaal en je belangrijkste gereedschap.
- `npm run build` kan niet draaien zonder `.env`; gebruik `tsc` als vangnet.

---

## File Structure

**Nieuw:**

| Bestand | Verantwoordelijkheid |
|---|---|
| `src/lib/project-members.ts` | `isProjectMember` en `membershipCheckNeeded` — de regel, puur en testbaar. |
| `src/lib/project-members.test.ts` | Tests daarvoor. |
| `prisma/backfill-members.ts` | Eenmalig script dat deelnemers uit de historie afleidt. Draait standaard droog. |

**Gewijzigd:** `prisma/schema.prisma`, `src/lib/api.ts`, `src/app/api/projects/route.ts`, `src/app/api/projects/[id]/route.ts`, `src/components/projects/projects-client.tsx`, `src/app/api/time/route.ts`, `src/app/api/time/[id]/route.ts`, `src/app/api/km/route.ts`, `src/app/api/km/[id]/route.ts`, `src/app/api/expenses/route.ts`, `src/app/api/expenses/[id]/route.ts`, `src/app/api/km/templates/route.ts`, `src/app/api/km/templates/[id]/route.ts`, `src/app/api/entries/bulk/route.ts`, `src/app/(app)/time/page.tsx`, `src/app/(app)/km/page.tsx`, `src/app/(app)/expenses/page.tsx`, `src/app/(app)/personeel/[id]/page.tsx`, `src/components/time/time-entries-client.tsx`.

---

## Task 1: De tabel en de regel

**Files:**
- Create: `src/lib/project-members.ts`, `src/lib/project-members.test.ts`
- Modify: `prisma/schema.prisma`

**Interfaces:**
- Produces:
  - `isProjectMember(memberUserIds: string[], userId: string | null | undefined): boolean`
  - `membershipCheckNeeded(existing: { projectId: string | null; userId: string } | null, next: { projectId: string | null; userId: string }): boolean`
  - Prisma: `model ProjectMember`, met `Project.members` en `User.projectMemberships`.

Deze taak is puur additief. Er wordt niets verwijderd en niets dwingt de regel nog af.

- [ ] **Step 1: Write the failing test**

Create `src/lib/project-members.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { isProjectMember, membershipCheckNeeded } from "./project-members";

describe("isProjectMember", () => {
  it("is false for an empty member list", () => {
    expect(isProjectMember([], "u1")).toBe(false);
  });

  it("is false for someone who is not on the list", () => {
    expect(isProjectMember(["u1", "u2"], "u3")).toBe(false);
  });

  it("is true for someone who is", () => {
    expect(isProjectMember(["u1", "u2"], "u2")).toBe(true);
  });

  it("is false for a missing owner, even when the list is not empty", () => {
    // Een ontbrekende eigenaar mag nooit per ongeluk toegang geven.
    expect(isProjectMember(["u1"], null)).toBe(false);
    expect(isProjectMember(["u1"], undefined)).toBe(false);
    expect(isProjectMember(["u1"], "")).toBe(false);
  });
});

describe("membershipCheckNeeded", () => {
  const next = { projectId: "p1", userId: "u1" };

  it("always checks on create", () => {
    expect(membershipCheckNeeded(null, next)).toBe(true);
  });

  it("does not check when neither project nor owner changed", () => {
    // Anders wordt historie onbewerkbaar: een oude regel van iemand die nooit
    // deelnemer was, zou je niet eens van omschrijving kunnen wijzigen.
    expect(membershipCheckNeeded({ projectId: "p1", userId: "u1" }, next)).toBe(false);
  });

  it("checks when the entry moves to another project", () => {
    expect(membershipCheckNeeded({ projectId: "p2", userId: "u1" }, next)).toBe(true);
  });

  it("checks when the entry is reassigned to another employee", () => {
    expect(membershipCheckNeeded({ projectId: "p1", userId: "u2" }, next)).toBe(true);
  });

  it("checks when both changed", () => {
    expect(membershipCheckNeeded({ projectId: "p2", userId: "u2" }, next)).toBe(true);
  });

  it("checks when an expense gains a project it did not have", () => {
    expect(membershipCheckNeeded({ projectId: null, userId: "u1" }, next)).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `source ~/.nvm/nvm.sh && nvm use 20 && npx vitest run src/lib/project-members.test.ts`
Expected: FAIL — `Failed to resolve import "./project-members"`.

- [ ] **Step 3: Write the module**

Create `src/lib/project-members.ts`:

```ts
/**
 * Wie mag er op een project boeken.
 *
 * De eis slaat altijd op de EIGENAAR van de registratie, nooit op degene die
 * hem invoert: een admin die namens Piet boekt heeft Piets deelname nodig.
 */
export function isProjectMember(
  memberUserIds: string[],
  userId: string | null | undefined,
): boolean {
  if (!userId) return false;
  return memberUserIds.includes(userId);
}

/**
 * Of de deelnamecontrole voor deze opslag nodig is.
 *
 * Bij aanmaken altijd. Bij bewerken alleen wanneer het project of de eigenaar
 * verandert — anders zou een oude regel van iemand die nooit deelnemer was
 * onbewerkbaar worden, tot en met zijn omschrijving.
 */
export function membershipCheckNeeded(
  existing: { projectId: string | null; userId: string } | null,
  next: { projectId: string | null; userId: string },
): boolean {
  if (existing === null) return true;
  return existing.projectId !== next.projectId || existing.userId !== next.userId;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `source ~/.nvm/nvm.sh && nvm use 20 && npx vitest run src/lib/project-members.test.ts`
Expected: PASS, 10 tests.

- [ ] **Step 5: Voeg de tabel toe aan het schema**

In `prisma/schema.prisma`, een nieuw model direct onder `model ProjectLevelRate`:

```prisma
model ProjectMember {
  projectId String
  project   Project  @relation(fields: [projectId], references: [id], onDelete: Cascade)
  userId    String
  user      User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  createdAt DateTime @default(now())

  @@id([projectId, userId])
}
```

Voeg toe aan `model Project`, bij de relaties: `members ProjectMember[]`
Voeg toe aan `model User`, bij de relaties: `projectMemberships ProjectMember[]`

Run: `source ~/.nvm/nvm.sh && nvm use 20 && DATABASE_URL="postgresql://x:x@localhost:5432/x" npx prisma generate`

- [ ] **Step 6: Controleer**

Run: `source ~/.nvm/nvm.sh && nvm use 20 && npm test && npm run lint && npx tsc --noEmit`
Expected: 18 bestanden / 161 tests groen; lint niet boven 291 errors; tsc 0.

- [ ] **Step 7: Commit**

```bash
git add src/lib/project-members.ts src/lib/project-members.test.ts prisma/schema.prisma
git commit -m "feat: ProjectMember table and the membership rule"
```

---

## Task 2: Het backfill-script

**Files:**
- Create: `prisma/backfill-members.ts`
- Modify: `package.json`

**Interfaces:**
- Produces: `npm run backfill:members` (droog) en `npm run backfill:members -- --write`.

Zonder dit script kan op de dag van uitrol niemand meer op enig project boeken.

- [ ] **Step 1: Schrijf het script**

Create `prisma/backfill-members.ts`:

```ts
import { PrismaClient } from "@prisma/client";

const db = new PrismaClient();

async function main() {
  const write = process.argv.includes("--write");

  const projects = await db.project.findMany({
    select: {
      id: true,
      name: true,
      archivedAt: true,
      customer: { select: { name: true } },
      timeEntries: { select: { userId: true } },
      kmEntries: { select: { userId: true } },
      expenses: { select: { userId: true } },
      members: { select: { userId: true } },
    },
    orderBy: { name: "asc" },
  });

  const plan: { projectId: string; label: string; userIds: string[]; alHad: number }[] = [];
  const leeg: string[] = [];

  for (const p of projects) {
    const label = `${p.customer?.name ?? "— geen klant —"} / ${p.name}${p.archivedAt ? " (gearchiveerd)" : ""}`;
    const boekers = new Set<string>([
      ...p.timeEntries.map((e) => e.userId),
      ...p.kmEntries.map((e) => e.userId),
      ...p.expenses.map((e) => e.userId),
    ]);
    if (boekers.size === 0) { leeg.push(label); continue; }
    plan.push({ projectId: p.id, label, userIds: [...boekers], alHad: p.members.length });
  }

  console.log(`${write ? "SCHRIJVEN" : "DROOG (geen wijzigingen)"} — ${plan.length} projecten\n`);
  for (const r of plan) {
    console.log(`  ${String(r.userIds.length).padStart(2)} deelnemer(s)  ${r.label}${r.alHad ? `   [had er al ${r.alHad}]` : ""}`);
  }

  if (leeg.length > 0) {
    console.log(`\nZONDER BOEKINGEN — deze krijgen geen deelnemers en moeten handmatig ingevuld worden (${leeg.length}):`);
    leeg.forEach((l) => console.log("  " + l));
  }

  if (!write) {
    console.log("\nDroge run. Draai met --write om dit toe te passen.");
    return;
  }

  await db.$transaction([
    ...plan.map((r) => db.projectMember.deleteMany({ where: { projectId: r.projectId } })),
    ...plan.flatMap((r) =>
      r.userIds.map((userId) =>
        db.projectMember.create({ data: { projectId: r.projectId, userId } }),
      ),
    ),
  ]);
  console.log(`\n${plan.length} projecten bijgewerkt.`);
}

main().catch(console.error).finally(() => db.$disconnect());
```

Let op drie eigenschappen die er niet toevallig in zitten. Het script schrijft alleen met een exacte `--write`; het draait alle wijzigingen in één `$transaction`, zodat een halve toepassing onmogelijk is; en projecten zonder enige boeking worden expliciet gemeld in plaats van stil overgeslagen, want dat zijn precies de projecten waarop daarna niemand kan boeken.

- [ ] **Step 2: Voeg het npm-script toe**

In `package.json`, bij `scripts`:

```json
    "backfill:members": "tsx prisma/backfill-members.ts",
```

- [ ] **Step 3: Draai de droge run tegen productie**

Dit is een leesactie en veilig.

Run: `source ~/.nvm/nvm.sh && nvm use 20 && set -a && . ./.env.local && set +a && npm run backfill:members`

Expected: een lijst van ongeveer 23 projecten met hun aantal deelnemers, en onder "ZONDER BOEKINGEN" ten minste `EVAjig / ProductionTool`. Zet de volledige uitvoer in je rapport.

- [ ] **Step 4: Controleer**

Run: `source ~/.nvm/nvm.sh && nvm use 20 && npm test && npm run lint && npx tsc --noEmit`
Expected: tests groen; lint niet boven 291; tsc 0.

- [ ] **Step 5: Commit**

```bash
git add prisma/backfill-members.ts package.json
git commit -m "feat: dry-run backfill script for project members"
```

---

## Task 3: Deelnemers instelbaar op het project

**Files:**
- Modify: `src/app/api/projects/route.ts`, `src/app/api/projects/[id]/route.ts`, `src/components/projects/projects-client.tsx`, `src/app/(app)/projects/page.tsx`

**Interfaces:**
- Consumes: `ProjectMember` uit Task 1.
- Produces: beide projectroutes accepteren `memberIds: string[]` (optioneel).

- [ ] **Step 1: Neem het veld op in de API**

Voeg in beide routebestanden toe aan het zod-schema:

```ts
  memberIds: z.array(z.string().min(1)).optional(),
```

Schrijf ze weg met hetzelfde patroon als `levelRates`, ná het aanmaken of bijwerken van het project:

```ts
    if (data.memberIds) {
      await prisma.$transaction([
        prisma.projectMember.deleteMany({ where: { projectId: project.id } }),
        ...data.memberIds.map((userId) =>
          prisma.projectMember.create({ data: { projectId: project.id, userId } }),
        ),
      ]);
    }
```

`memberIds` weglaten laat de bestaande deelnemers ongemoeid; een lege array wist ze. Voeg
`members: { select: { userId: true } }` toe aan de `include` van de GET-routes.

- [ ] **Step 2: De aanmaker van een conceptproject wordt deelnemer**

`POST /api/projects` staat een niet-admin toe een bare conceptproject aan te maken via het
urenformulier. Zonder deelname kan hij daarna niet boeken op wat hij zojuist maakte.

Voeg direct na het aanmaken toe, vóór het `memberIds`-blok:

```ts
    // De aanmaker moet erop kunnen boeken; anders levert het knopje in het
    // urenformulier een project op dat voor hem onbruikbaar is.
    await prisma.projectMember.create({
      data: { projectId: project.id, userId: session.user!.id! },
    });
```

Let op de volgorde: als de aanroeper óók `memberIds` meestuurt, moet de aanmaker daarin zitten
of alsnog worden toegevoegd. Kies zelf hoe je dat oplost — een `deleteMany` gevolgd door een
`createMany` van de unie van beide is het eenvoudigst — en beschrijf je keuze in je rapport.

- [ ] **Step 3: Voeg de aanvinklijst toe aan het projectformulier**

`src/components/projects/projects-client.tsx` draagt al `levelRates` in een aparte state met een
`levelRatesKnown`-guard. Doe hetzelfde voor deelnemers:

```tsx
  const [memberIds, setMemberIds] = useState<string[]>([]);
  const [memberIdsKnown, setMemberIdsKnown] = useState(true);
```

Vullen bij het openen van het bewerkformulier:

```tsx
    setMemberIdsKnown(Array.isArray(project.members));
    setMemberIds((project.members ?? []).map((m: any) => m.userId));
```

Leeg (`[]`, `known = true`) bij aanmaken en na een geslaagde opslag. Meesturen alleen wanneer
bekend, zoals bij `levelRates`:

```ts
      ...(memberIdsKnown ? { memberIds } : {}),
```

En het veld zelf, met een lijst van actieve medewerkers die de pagina moet aanleveren:

```tsx
              <div className="space-y-2">
                <Label>Deelnemers</Label>
                <p className="text-xs text-muted-foreground">
                  Alleen deze medewerkers kunnen uren, ritten en uitgaven op dit project boeken.
                </p>
                <div className="space-y-1 max-h-48 overflow-y-auto">
                  {users.map((u: any) => (
                    <label key={u.id} className="flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        className="h-4 w-4 rounded border-input accent-primary"
                        checked={memberIds.includes(u.id)}
                        onChange={(e) =>
                          setMemberIds((prev) =>
                            e.target.checked ? [...prev, u.id] : prev.filter((id) => id !== u.id),
                          )
                        }
                      />
                      {u.name}
                    </label>
                  ))}
                </div>
              </div>
```

Voeg `users: any[]` toe aan de props en laad ze in `src/app/(app)/projects/page.tsx`:

```ts
    prisma.user.findMany({ where: { archivedAt: null }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
```

Voeg ook `members: { select: { userId: true } }` toe aan de `include` van de projectquery op die
pagina — vergeet je dat, dan opent het bewerkformulier zonder deelnemers en wist de eerste
opslag ze. Diezelfde val kostte traject 1 een fix-ronde.

- [ ] **Step 4: Voeg een kolom toe aan de projectenlijst**

```tsx
                  <TableCell className="text-right tabular-nums">
                    {p.members?.length ?? 0}
                  </TableCell>
```

Met `<TableHead className="text-right">Deelnemers</TableHead>` erbij, en elke `colSpan` in dat
bestand één omhoog.

- [ ] **Step 5: Controleer**

Run: `source ~/.nvm/nvm.sh && nvm use 20 && npm test && npm run lint && npx tsc --noEmit`
Expected: tests groen; lint niet boven 291; tsc 0.

- [ ] **Step 6: Commit**

```bash
git add src/app/api/projects src/components/projects "src/app/(app)/projects/page.tsx"
git commit -m "feat: set project members on the project form"
```

---

## Task 4: De gedeelde controle en de uren- en rittenroutes

**Files:**
- Modify: `src/lib/api.ts`, `src/app/api/time/route.ts`, `src/app/api/time/[id]/route.ts`, `src/app/api/km/route.ts`, `src/app/api/km/[id]/route.ts`

**Interfaces:**
- Consumes: `isProjectMember`, `membershipCheckNeeded` uit Task 1.
- Produces: `projectMembershipError(projectId: string | null, ownerId: string): Promise<NextResponse | null>` uit `src/lib/api.ts`.

- [ ] **Step 1: Voeg de gedeelde controle toe**

`src/lib/api.ts` bevat al `entryMutationError`, dat volgens hetzelfde patroon een `NextResponse`
of `null` teruggeeft. Voeg daaronder toe.

Dit bestand krijgt daarmee een Prisma-import. Dat is veilig: `@/lib/api` wordt uitsluitend door
route-handlers geïmporteerd, nooit door een clientcomponent — geverifieerd over de hele repo. Zou
dat ooit veranderen, dan haalt de bundler Prisma de clientbundel in.

```ts
import { prisma } from "./prisma";
import { isProjectMember } from "./project-members";

/**
 * Geeft een 400-response als de eigenaar geen deelnemer is van het project,
 * en null als de opslag door mag. Een projectloze registratie (een uitgave
 * zonder project) valt buiten de regel.
 */
export async function projectMembershipError(
  projectId: string | null,
  ownerId: string,
): Promise<NextResponse | null> {
  if (!projectId) return null;
  const members = await prisma.projectMember.findMany({
    where: { projectId },
    select: { userId: true },
  });
  if (isProjectMember(members.map((m) => m.userId), ownerId)) return null;
  return NextResponse.json(
    { error: "Deze medewerker is geen deelnemer van dit project" },
    { status: 400 },
  );
}
```

- [ ] **Step 2: Bedraad `POST /api/time` en `POST /api/km`**

In beide routes wordt de eigenaar al bepaald met `resolveEntryUserId` en opgezocht om te
controleren dat hij bestaat. Voeg direct daarna toe, vóór de `create`:

```ts
    const memberError = await projectMembershipError(data.projectId, ownerId);
    if (memberError) return memberError;
```

Bij aanmaken is de controle altijd nodig, dus `membershipCheckNeeded` komt hier niet aan te pas.

- [ ] **Step 3: Bedraad `PUT /api/time/[id]` en `PUT /api/km/[id]`**

Beide PUT-routes halen al `existing` op voor `checkEntryMutation`. Breid die `select` uit met
`projectId: true` en gebruik `membershipCheckNeeded` zodat een bewerking die het project noch de
eigenaar wijzigt niet afketst:

```ts
    if (membershipCheckNeeded(
      { projectId: existing.projectId, userId: existing.userId },
      { projectId: data.projectId, userId: ownerId },
    )) {
      const memberError = await projectMembershipError(data.projectId, ownerId);
      if (memberError) return memberError;
    }
```

Plaats dit ná het bepalen van `ownerId` en vóór de `update`.

- [ ] **Step 4: Controleer**

Run: `source ~/.nvm/nvm.sh && nvm use 20 && npm test && npm run lint && npx tsc --noEmit`
Expected: tests groen; lint niet boven 291; tsc 0.

- [ ] **Step 5: Commit**

```bash
git add src/lib/api.ts src/app/api/time src/app/api/km
git commit -m "feat: enforce project membership on time and km entries"
```

---

## Task 5: Uitgaven en de km-sjablonen

**Files:**
- Modify: `src/app/api/expenses/route.ts`, `src/app/api/expenses/[id]/route.ts`, `src/app/api/km/templates/route.ts`, `src/app/api/km/templates/[id]/route.ts`

**Interfaces:**
- Consumes: `projectMembershipError` uit Task 4, `membershipCheckNeeded` uit Task 1.

- [ ] **Step 1: Uitgaven**

Zelfde patroon als de uren-routes. Let op één verschil: `Expense.projectId` is optioneel. Een
uitgave zonder project valt buiten de regel, en `projectMembershipError` geeft daarvoor al `null`
terug — je hoeft dus niets extra's te doen, maar controleer wel dat `data.projectId` daar `null`
is en niet `undefined`, zodat de vergelijking in `membershipCheckNeeded` klopt.

In `POST /api/expenses`, ná het bepalen van `ownerId`:

```ts
    const memberError = await projectMembershipError(data.projectId ?? null, ownerId);
    if (memberError) return memberError;
```

In `PUT /api/expenses/[id]`: breid de bestaande `existing`-select uit met `projectId: true` en
gebruik dezelfde `membershipCheckNeeded`-vorm als in Task 4, met `data.projectId ?? null`.

- [ ] **Step 2: De km-sjablonen**

`src/app/api/km/templates/route.ts` en `[id]/route.ts` slaan een sjabloon op met een `projectId`.
De eis slaat op de **eigenaar van het sjabloon** — dat is `userId` op de `KmTemplate`, niet
noodzakelijk de ingelogde gebruiker: een admin mag sjablonen beheren voor anderen
(zie `canManageTemplate` in `src/lib/km-template.ts`).

Bepaal in beide routes de eigenaar zoals die route dat al doet, en voeg toe vóór het opslaan:

```ts
    const memberError = await projectMembershipError(data.projectId, ownerId);
    if (memberError) return memberError;
```

Gebruik in de PUT-route `membershipCheckNeeded` op dezelfde manier als in Task 4, zodat een
sjabloon waarvan alleen de naam of het aantal kilometers wijzigt niet afketst.

- [ ] **Step 3: Controleer**

Run: `source ~/.nvm/nvm.sh && nvm use 20 && npm test && npm run lint && npx tsc --noEmit`
Expected: tests groen; lint niet boven 291; tsc 0.

- [ ] **Step 4: Commit**

```bash
git add src/app/api/expenses src/app/api/km/templates
git commit -m "feat: enforce project membership on expenses and km templates"
```

---

## Task 6: De bulkroute

De gevaarlijkste route van dit traject. Twee van haar vier acties wijzigen precies de velden die
de toets triggeren, en zonder controle kan een admin in één klik twintig regels op een project
zetten waar de eigenaren niet op staan.

**Files:**
- Modify: `src/app/api/entries/bulk/route.ts`

**Interfaces:**
- Consumes: `isProjectMember` uit Task 1.

- [ ] **Step 1: Controleer een verplaatsing naar een ander project**

De route valideert al dat het doelproject bestaat. Voeg daarna toe:

```ts
    if (action.type === "project") {
      const members = await prisma.projectMember.findMany({
        where: { projectId: action.projectId },
        select: { userId: true },
      });
      const memberIds = members.map((m) => m.userId);
      const rows = await (model as any).findMany({
        where: { id: { in: ids } },
        select: { userId: true },
      });
      const buiten = rows.filter((r: any) => !isProjectMember(memberIds, r.userId)).length;
      if (buiten > 0) {
        return NextResponse.json(
          { error: `${buiten} van de ${ids.length} regels heeft een eigenaar die geen deelnemer is van dit project` },
          { status: 400 },
        );
      }
    }
```

Let op dat `model` pas verderop in de route wordt bepaald; verplaats die bepaling naar boven, of
herhaal de ternary. Kies zelf en zeg in je rapport wat je deed.

- [ ] **Step 2: Controleer een toewijzing aan een andere medewerker**

```ts
    if (action.type === "user") {
      const rows = await (model as any).findMany({
        where: { id: { in: ids } },
        select: { projectId: true },
      });
      const projectIds = [...new Set(rows.map((r: any) => r.projectId).filter(Boolean))] as string[];
      const memberships = await prisma.projectMember.findMany({
        where: { userId: action.userId, projectId: { in: projectIds } },
        select: { projectId: true },
      });
      const heeft = new Set(memberships.map((m) => m.projectId));
      const buiten = projectIds.filter((p) => !heeft.has(p)).length;
      if (buiten > 0) {
        return NextResponse.json(
          { error: `De gekozen medewerker is geen deelnemer van ${buiten} van de betrokken projecten` },
          { status: 400 },
        );
      }
    }
```

Beide controles staan vóór elke schrijfactie, zodat een weigering niets achterlaat. Dit is
hetzelfde alles-of-niets-principe als het backfill-script: gedeeltelijk toepassen zou hier
misleiden, want de bestaande "X van de Y regels bijgewerkt"-melding wijt het overslaan aan
gefactureerde regels en die reden zou dan niet kloppen.

De acties `billable` en `delete` bestaan hier niet meer respectievelijk raken geen van beide
velden, dus die blijven ongemoeid.

- [ ] **Step 3: Controleer**

Run: `source ~/.nvm/nvm.sh && nvm use 20 && npm test && npm run lint && npx tsc --noEmit`
Expected: tests groen; lint niet boven 291; tsc 0.

- [ ] **Step 4: Commit**

```bash
git add src/app/api/entries/bulk/route.ts
git commit -m "feat: enforce project membership on bulk moves and reassignments"
```

---

## Task 7: De projectkeuzelijsten filteren

**Files:**
- Modify: `src/app/(app)/time/page.tsx`, `src/app/(app)/km/page.tsx`, `src/app/(app)/expenses/page.tsx`, `src/app/(app)/personeel/[id]/page.tsx`, `src/components/time/time-entries-client.tsx`

- [ ] **Step 1: Filter op de server voor niet-admins**

Alle vier de pagina's halen projecten op met `prisma.project.findMany`. Voeg aan de `where` toe,
alleen wanneer de gebruiker geen admin is:

```ts
      ...(admin ? {} : { members: { some: { userId } } }),
```

Voor `src/app/(app)/personeel/[id]/page.tsx` geldt een afwijking: dat scherm is van een admin die
een sjabloon beheert vóór een medewerker, dus filter daar op de **medewerker van wie de pagina
is**, niet op de ingelogde gebruiker:

```ts
      members: { some: { userId: employeeId } },
```

Een medewerker krijgt zo alleen zijn eigen projecten binnen; er is geen client-side filter om te
omzeilen, want wat er niet is kun je niet kiezen. De servercontrole uit Task 4 tot en met 6 staat
daar los van en blijft in alle gevallen gelden.

- [ ] **Step 2: Laat de admin-lijst meebewegen met de gekozen medewerker**

Een admin krijgt alle projecten. In het urenformulier kiest hij eerst een medewerker; de
projectlijst moet dan naar die medewerker narrowen. Voeg `members: { select: { userId: true } }`
toe aan de projectselectie in `src/app/(app)/time/page.tsx`, maar **alleen in de admin-tak** —
een medewerker heeft de deelnemerslijsten niet nodig en hoeft ze niet te krijgen.

In `src/components/time/time-entries-client.tsx` staat al een `partitionProjectsByCustomer`-aanroep
die de lijst opdeelt. Filter de invoer daarvan voor admins op de gekozen medewerker:

```ts
  const targetUserId = form.watch("userId") || userId;
  const bookableProjects = isAdmin
    ? projects.filter((p: any) => (p.members ?? []).some((m: any) => m.userId === targetUserId))
    : projects;

  const { matched: matchedProjects, customerless: customerlessProjects } =
    partitionProjectsByCustomer(bookableProjects, selectedCustomerId);
```

Let op: `projects` wordt in dit bestand ook gebruikt voor het **filter** boven de lijst met
registraties, en dat filter moet alle projecten blijven tonen — een admin wil kunnen filteren op
een project waarop hij zelf niet boekt. Gebruik `bookableProjects` uitsluitend voor het
invoerformulier.

- [ ] **Step 3: Controleer**

Run: `source ~/.nvm/nvm.sh && nvm use 20 && npm test && npm run lint && npx tsc --noEmit`
Expected: tests groen; lint niet boven 291; tsc 0.

- [ ] **Step 4: Commit**

```bash
git add "src/app/(app)/time/page.tsx" "src/app/(app)/km/page.tsx" "src/app/(app)/expenses/page.tsx" "src/app/(app)/personeel" src/components/time/time-entries-client.tsx
git commit -m "feat: filter project pickers to the projects you may book on"
```

---

## Verificatie na afloop

- [ ] `npm test` — alle suites groen, inclusief `project-members`.
- [ ] `npm run lint` — niet meer errors dan de 291 van de baseline.
- [ ] `npx tsc --noEmit` — 0 fouten.

**Door een mens, met de database.** Niets hiervan kon tijdens de bouw tegen productie gedraaid worden.

De uitrol is drie stappen; dit traject verwijdert niets, dus er is geen afbraakstap:

1. **Toevoegen.** `npm run db:push` met het schema van Task 1. Draai vooraf `prisma migrate diff` en lees de volledige lijst — er hoort alleen een tabel bij te komen. Bij de vorige batch verdween er onverwacht een kolom die niemand had gecontroleerd.
2. **Vullen.** `npm run backfill:members` droog draaien, de uitvoer controleren — let vooral op de lijst "ZONDER BOEKINGEN" — en dan met `--write`.
3. **Deployen.** De volledige branch, kort na stap 2.

**Draai `--write` precies één keer, en daarna nooit meer.** Het script doet per project een
`deleteMany` gevolgd door verse regels: opnieuw draaien is technisch veilig, maar zet elk project
met boekingen terug naar de historie en wist daarmee elke deelnemer die je daarna in de UI hebt
toegevoegd of weggehaald.

Stap 2 en 3 horen dicht op elkaar. Deploy je vóór het vullen, dan kan niemand meer boeken: de
nieuwe code weigert elke schrijfactie omdat nog geen enkel project deelnemers heeft.

Daarna in de app: op `/projects` de projecten uit die "zonder boekingen"-lijst aanvullen met
deelnemers, anders kan er niemand op boeken.

Handmatig na te lopen:

- [ ] Als medewerker inloggen: de projectkeuze toont alleen eigen projecten, in `/time`, `/km` en `/expenses`.
- [ ] Als admin een collega kiezen in het urenformulier en zien dat de projectlijst meebeweegt.
- [ ] Als admin controleren dat het projectfilter boven de registratielijst nog alle projecten toont.
- [ ] Een oude urenregel van een niet-deelnemer bewerken (alleen de omschrijving) en zien dat hij gewoon opslaat.
- [ ] Diezelfde regel naar een ander project verplaatsen en de weigering krijgen.
- [ ] Via een km-sjabloon proberen te boeken op een project waar je niet op staat.
- [ ] Een conceptproject aanmaken via het urenformulier en er meteen op kunnen boeken.
- [ ] Op `/reports` een reeks regels bulksgewijs verplaatsen naar een project waar niet elke eigenaar op staat, en de weigering krijgen zonder dat er iets is gewijzigd.
- [ ] Diezelfde reeks bulksgewijs toewijzen aan iemand die niet op al die projecten staat, met hetzelfde resultaat.
