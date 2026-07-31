# Admin Entry Management Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Admins kunnen uren, ritten en uitgaven invoeren namens een andere medewerker, en in het gefilterde `/reports`-overzicht regels los of in bulk aanpassen.

**Architecture:** De eigenaar-bepaling en de bulk-mutatie worden pure helpers in `src/lib/` (waar alle tests van deze repo staan), die de bestaande API-routes aanroepen. `/reports` wordt van een lees-only rapport uitgebreid met bewerken; `reports-client.tsx` (484 regels) wordt daarvoor opgesplitst in filterkaart, drie rijtabellen, één bewerk-dialoog en een bulkbalk. Eén nieuwe route `POST /api/entries/bulk` doet alle bulkmutaties met een vaste `invoiced: false`-guard.

**Tech Stack:** Next.js 16 (App Router), React 19, Prisma 6 + PostgreSQL, next-auth v5, zod 3, react-hook-form, Radix UI + Tailwind 4, vitest.

## Global Constraints

- **Lees eerst de docs.** Dit is niet de Next.js die je kent. Raadpleeg `node_modules/next/dist/docs/` voordat je routes of server components aanpast. Let op deprecation-notices.
- **Rolcontrole hoort op twee plekken:** in de API-route én in de UI. Zie `src/lib/roles.ts` — dat bestand is de canonieke bron; gebruik `isAdmin(role)`, niet een losse string-vergelijking.
- **Alle zichtbare tekst is Nederlands.** Labels, knoppen, foutmeldingen, bevestigingen.
- **Namens boeken en bulkacties zijn uitsluitend voor rol `ADMIN`.** `FINANCE` mag `/reports` lezen, niet muteren.
- **Gefactureerde regels (`invoiced: true`) zijn nooit muteerbaar,** niet via losse edit en niet via bulk.
- **Tests staan naast de code in `src/lib/*.test.ts`** en testen pure functies. Geen API- of componenttests; die zijn er in deze repo niet en die conventie blijft.
- **Route params zijn een Promise:** `{ params }: { params: Promise<{ id: string }> }`, dus `const { id } = await params`.
- Testcommando: `npm test`. Losse suite: `npx vitest run src/lib/<naam>.test.ts`.
- Lint: `npm run lint`.

---

## File Structure

**Nieuw:**

| Bestand | Verantwoordelijkheid |
|---|---|
| `src/lib/entry-owner.ts` | Bepaalt onder wiens naam een entry landt, en of een bestaande entry gemuteerd mag worden. |
| `src/lib/entry-owner.test.ts` | Tests daarvoor. |
| `src/lib/bulk-entries.ts` | Vertaalt een bulkactie naar een prisma-`where`/`data`-fragment, inclusief de invoiced-guard. |
| `src/lib/bulk-entries.test.ts` | Tests daarvoor. |
| `src/lib/report-totals.ts` | Tarief-, totaal- en per-medewerkerberekening voor het rapport. |
| `src/lib/report-totals.test.ts` | Tests daarvoor. |
| `src/app/api/entries/bulk/route.ts` | `POST` bulkmutatie, admin-only. |
| `src/components/reports/report-filters.tsx` | De filterkaart. |
| `src/components/reports/time-rows.tsx` | Urentabel. |
| `src/components/reports/km-rows.tsx` | Rittentabel. |
| `src/components/reports/expense-rows.tsx` | Uitgaventabel. |
| `src/components/reports/entry-edit-dialog.tsx` | Bewerk-dialoog voor alle drie de soorten. |
| `src/components/reports/bulk-bar.tsx` | Bulkbalk. |

**Gewijzigd:**

| Bestand | Wijziging |
|---|---|
| `src/app/api/time/route.ts` | `userId` in POST-schema, via helper. |
| `src/app/api/time/[id]/route.ts` | `userId` in PUT-schema; invoiced-guard op PUT en DELETE. |
| `src/app/api/km/route.ts` | `userId` in POST-schema, via helper. |
| `src/app/api/km/[id]/route.ts` | Eigenaarscheck op PUT en DELETE (ontbreekt nu); invoiced-guard; `userId` in PUT-schema. |
| `src/app/api/expenses/route.ts` | `userId` in POST-schema, via helper. |
| `src/app/api/expenses/[id]/route.ts` | `userId` in PUT-schema. |
| `src/app/(app)/time/page.tsx` | Ongewijzigd qua data (laadt `users` al). |
| `src/components/time/time-entries-client.tsx` | Medewerker-select in het formulier. |
| `src/app/(app)/km/page.tsx` | Laadt `users` voor admins; admin ziet alle ritten. |
| `src/components/km/km-entries-client.tsx` | Medewerker-select + medewerkersfilter. |
| `src/app/(app)/expenses/page.tsx` | Laadt `users` voor admins. |
| `src/components/expenses/expenses-client.tsx` | Medewerker-select; dode `isReadOnly` weg. |
| `src/app/(app)/reports/page.tsx` | Laadt activiteiten, uitgavencategorieën en klantnaam bij projecten; geeft `role` door. |
| `src/components/reports/reports-client.tsx` | Opgesplitst; bewerken en bulk erbij. |

---

## Task 1: Helper voor eigenaar en muteerbaarheid

**Files:**
- Create: `src/lib/entry-owner.ts`
- Test: `src/lib/entry-owner.test.ts`

**Interfaces:**
- Consumes: `isAdmin` uit `src/lib/roles.ts`.
- Produces:
  - `resolveEntryUserId(role: string, sessionUserId: string, requestedUserId?: string | null): string`
  - `type EntryMutationVerdict = "ok" | "not-found" | "forbidden" | "invoiced"`
  - `checkEntryMutation(role: string, sessionUserId: string, entry: { userId: string; invoiced: boolean } | null): EntryMutationVerdict`

- [ ] **Step 1: Write the failing test**

Create `src/lib/entry-owner.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { resolveEntryUserId, checkEntryMutation } from "./entry-owner";

describe("resolveEntryUserId", () => {
  it("uses the requested user when an admin asks for it", () => {
    expect(resolveEntryUserId("ADMIN", "admin-1", "piet-2")).toBe("piet-2");
  });

  it("falls back to the session user when an admin sends nothing", () => {
    expect(resolveEntryUserId("ADMIN", "admin-1", undefined)).toBe("admin-1");
    expect(resolveEntryUserId("ADMIN", "admin-1", null)).toBe("admin-1");
    expect(resolveEntryUserId("ADMIN", "admin-1", "")).toBe("admin-1");
  });

  it("ignores a requested user from a non-admin", () => {
    expect(resolveEntryUserId("EMPLOYEE", "piet-2", "admin-1")).toBe("piet-2");
    expect(resolveEntryUserId("FINANCE", "fin-3", "admin-1")).toBe("fin-3");
  });
});

describe("checkEntryMutation", () => {
  it("reports a missing entry", () => {
    expect(checkEntryMutation("ADMIN", "admin-1", null)).toBe("not-found");
  });

  it("lets an owner mutate their own entry", () => {
    expect(checkEntryMutation("EMPLOYEE", "piet-2", { userId: "piet-2", invoiced: false })).toBe("ok");
  });

  it("blocks a non-admin from another user's entry", () => {
    expect(checkEntryMutation("EMPLOYEE", "piet-2", { userId: "jan-4", invoiced: false })).toBe("forbidden");
    expect(checkEntryMutation("FINANCE", "fin-3", { userId: "jan-4", invoiced: false })).toBe("forbidden");
  });

  it("lets an admin mutate another user's entry", () => {
    expect(checkEntryMutation("ADMIN", "admin-1", { userId: "jan-4", invoiced: false })).toBe("ok");
  });

  it("blocks invoiced entries for everyone, admins included", () => {
    expect(checkEntryMutation("ADMIN", "admin-1", { userId: "jan-4", invoiced: true })).toBe("invoiced");
    expect(checkEntryMutation("EMPLOYEE", "piet-2", { userId: "piet-2", invoiced: true })).toBe("invoiced");
  });

  it("reports forbidden before invoiced so a stranger learns nothing about the entry", () => {
    expect(checkEntryMutation("EMPLOYEE", "piet-2", { userId: "jan-4", invoiced: true })).toBe("forbidden");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/entry-owner.test.ts`
Expected: FAIL — `Failed to resolve import "./entry-owner"`.

- [ ] **Step 3: Write minimal implementation**

Create `src/lib/entry-owner.ts`:

```ts
import { isAdmin } from "./roles";

/**
 * Bepaalt onder wiens naam een nieuwe of bijgewerkte registratie komt te staan.
 * Alleen een admin mag een andere medewerker opgeven; bij iedereen anders wordt
 * het meegestuurde userId genegeerd (zelfde patroon als rateOverride).
 */
export function resolveEntryUserId(
  role: string,
  sessionUserId: string,
  requestedUserId?: string | null,
): string {
  if (isAdmin(role) && requestedUserId) return requestedUserId;
  return sessionUserId;
}

export type EntryMutationVerdict = "ok" | "not-found" | "forbidden" | "invoiced";

/** Mag deze gebruiker een bestaande registratie wijzigen of verwijderen? */
export function checkEntryMutation(
  role: string,
  sessionUserId: string,
  entry: { userId: string; invoiced: boolean } | null,
): EntryMutationVerdict {
  if (!entry) return "not-found";
  if (!isAdmin(role) && entry.userId !== sessionUserId) return "forbidden";
  if (entry.invoiced) return "invoiced";
  return "ok";
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/entry-owner.test.ts`
Expected: PASS, 9 tests.

- [ ] **Step 5: Commit**

```bash
git add src/lib/entry-owner.ts src/lib/entry-owner.test.ts
git commit -m "feat: entry-owner helpers for on-behalf booking and mutation checks"
```

---

## Task 2: Beveiligingsgaten dichten in de uren- en ritten-routes

`PUT /api/km/[id]` heeft nu geen enkele eigenaarscheck en `DELETE /api/km/[id]` helemaal geen check — elke ingelogde gebruiker kan een rit van een collega wijzigen of weggooien. En geen van de uren-/ritten-routes controleert `invoiced`, terwijl de UI die knoppen wel op disabled zet.

**Files:**
- Modify: `src/app/api/km/[id]/route.ts` (hele bestand)
- Modify: `src/app/api/time/[id]/route.ts:18-75`

**Interfaces:**
- Consumes: `checkEntryMutation` uit Task 1.
- Produces: geen nieuwe exports. Beide routes geven voortaan 404 / 403 / 400 volgens het verdict.

- [ ] **Step 1: Schrijf de gedeelde verdict-afhandeling in `src/lib/api.ts`**

Voeg onderaan `src/lib/api.ts` toe:

```ts
import type { EntryMutationVerdict } from "./entry-owner";

/** Vertaalt een verdict naar een response, of null als de mutatie door mag. */
export function entryMutationError(verdict: EntryMutationVerdict): NextResponse | null {
  if (verdict === "not-found") return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (verdict === "forbidden") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  if (verdict === "invoiced") {
    return NextResponse.json(
      { error: "Gefactureerde registraties kunnen niet worden gewijzigd of verwijderd" },
      { status: 400 },
    );
  }
  return null;
}
```

- [ ] **Step 2: Vervang de checks in `src/app/api/km/[id]/route.ts`**

Vervang de `PUT`-body tot en met de zod-parse, en de hele `DELETE`. Het bestand wordt:

```ts
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { z } from "zod";
import { handleError, entryMutationError } from "@/lib/api";
import { isAdmin } from "@/lib/roles";
import { checkEntryMutation } from "@/lib/entry-owner";

const schema = z.object({
  projectId: z.string().min(1),
  activityTypeId: z.string().optional().nullable(),
  date: z.string(),
  km: z.number().positive(),
  description: z.string().optional(),
  rateOverride: z.number().positive().optional().nullable(),
  billable: z.boolean().optional(),
});

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await auth();
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const role = (session.user as any)?.role ?? "EMPLOYEE";
    const sessionUserId = session.user?.id!;
    const { id } = await params;

    const existing = await prisma.kmEntry.findUnique({ where: { id }, select: { userId: true, invoiced: true } });
    const error = entryMutationError(checkEntryMutation(role, sessionUserId, existing));
    if (error) return error;

    const data = schema.parse(await req.json());
    let { rateOverride, billable, activityTypeId } = data;

    if (!isAdmin(role)) {
      rateOverride = null;
      if (activityTypeId) {
        const act = await prisma.activityType.findUnique({ where: { id: activityTypeId }, select: { billable: true } });
        billable = act?.billable ?? true;
      } else {
        billable = true;
      }
    }

    const entry = await prisma.kmEntry.update({
      where: { id },
      data: { ...data, rateOverride, billable: billable ?? true, date: new Date(data.date) },
      include: {
        project: { select: { name: true, customer: { select: { id: true, name: true } } } },
        activityType: { select: { name: true } },
      },
    });
    return NextResponse.json(entry);
  } catch (e) { return handleError(e); }
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await auth();
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const role = (session.user as any)?.role ?? "EMPLOYEE";
    const sessionUserId = session.user?.id!;
    const { id } = await params;

    const existing = await prisma.kmEntry.findUnique({ where: { id }, select: { userId: true, invoiced: true } });
    const error = entryMutationError(checkEntryMutation(role, sessionUserId, existing));
    if (error) return error;

    await prisma.kmEntry.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (e) { return handleError(e); }
}
```

- [ ] **Step 3: Doe hetzelfde in `src/app/api/time/[id]/route.ts`**

Vervang in `PUT` het blok op regels 27-32:

```ts
    if (!isAdmin(role)) {
      const existing = await prisma.timeEntry.findUnique({ where: { id }, select: { userId: true } });
      if (!existing || existing.userId !== session.user?.id) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }
    }
```

door:

```ts
    const existing = await prisma.timeEntry.findUnique({ where: { id }, select: { userId: true, invoiced: true } });
    const error = entryMutationError(checkEntryMutation(role, session.user?.id!, existing));
    if (error) return error;
```

Verplaats die drie regels naar bóven de `schema.parse(...)` op regel 25, zodat een verboden verzoek niet eerst gevalideerd wordt. Doe dezelfde vervanging in `DELETE` (regels 65-70). Voeg de imports toe:

```ts
import { handleError, entryMutationError } from "@/lib/api";
import { checkEntryMutation } from "@/lib/entry-owner";
```

- [ ] **Step 4: Controleer dat alles compileert en de bestaande tests groen blijven**

Run: `npm run lint && npm test`
Expected: geen lint-fouten, alle bestaande suites PASS.

- [ ] **Step 5: Handmatige controle**

Start `npm run dev`. Log in als medewerker, open `/km`, maak een rit aan. Zoek het id in de netwerk-tab. Log uit, log in als een ándere medewerker, en doe in de console:

```js
await fetch("/api/km/<id>", { method: "DELETE" }).then(r => r.status)
```

Expected: `403`. Vóór deze taak was dat `200` en was de rit weg.

- [ ] **Step 6: Commit**

```bash
git add src/lib/api.ts src/app/api/km/\[id\]/route.ts src/app/api/time/\[id\]/route.ts
git commit -m "fix: enforce ownership and invoiced guard on time and km mutations"
```

---

## Task 3: `userId` accepteren in de POST- en PUT-routes

**Files:**
- Modify: `src/app/api/time/route.ts:8-16,51-81`
- Modify: `src/app/api/time/[id]/route.ts:8-16,46-53`
- Modify: `src/app/api/km/route.ts:8-16,49-79`
- Modify: `src/app/api/km/[id]/route.ts` (schema + update-call)
- Modify: `src/app/api/expenses/route.ts:8-17,65-82`
- Modify: `src/app/api/expenses/[id]/route.ts:8-17,32-41`

**Interfaces:**
- Consumes: `resolveEntryUserId` uit Task 1.
- Produces: alle zes routes accepteren een optioneel `userId: string` in de body. Onbekend id → 400 met `{ error: "Onbekende medewerker" }`.

- [ ] **Step 1: Voeg het veld toe aan alle zes zod-schema's**

In elk van de zes bestanden, voeg als laatste regel van het `z.object({...})` toe:

```ts
  userId: z.string().optional().nullable(),
```

- [ ] **Step 2: Bepaal de eigenaar in `POST /api/time`**

In `src/app/api/time/route.ts`, vervang de `prisma.timeEntry.create`-aanroep (regels 72-78) door:

```ts
    const { userId: requestedUserId, ...entryData } = data;
    const ownerId = resolveEntryUserId(role, userId, requestedUserId);
    if (ownerId !== userId) {
      const target = await prisma.user.findUnique({ where: { id: ownerId }, select: { id: true } });
      if (!target) return NextResponse.json({ error: "Onbekende medewerker" }, { status: 400 });
    }

    const entry = await prisma.timeEntry.create({
      data: { ...entryData, rateOverride, billable: billable ?? true, date: new Date(data.date), userId: ownerId },
      include: {
        project: { select: { name: true, customer: { select: { id: true, name: true } } } },
        activityType: { select: { name: true } },
        user: { select: { id: true, name: true } },
      },
    });
```

Let op twee dingen: `userId` moet uit `data` gehaald worden vóór de spread, anders overschrijft het `userId: ownerId`. En de `include` krijgt `user` erbij, zodat de client de naam van de medewerker kan tonen zonder een tweede ophaalronde.

Voeg de import toe:

```ts
import { resolveEntryUserId } from "@/lib/entry-owner";
```

- [ ] **Step 3: Herhaal voor de vijf andere routes**

Exact hetzelfde patroon, met de juiste modelnaam:

- `src/app/api/km/route.ts` → `prisma.kmEntry.create`, include `user: { select: { id: true, name: true } }` erbij.
- `src/app/api/expenses/route.ts` → `prisma.expense.create`; hier heet de sessievariabele al `userId`, dus:
  ```ts
  const role = (session.user as any)?.role ?? "EMPLOYEE";
  const { userId: requestedUserId, ...entryData } = data;
  const ownerId = resolveEntryUserId(role, userId, requestedUserId);
  ```
  De `role`-regel bestaat daar nog niet in `POST` — voeg hem toe. `include` heeft `user` al.
- `src/app/api/time/[id]/route.ts`, `src/app/api/km/[id]/route.ts`, `src/app/api/expenses/[id]/route.ts` → in de `update`-aanroep, met `data: { ...entryData, ..., userId: ownerId }`. Ook hier `user` aan de `include` toevoegen waar die ontbreekt (time en km).

- [ ] **Step 4: Controleer dat het compileert**

Run: `npm run lint && npm test`
Expected: schoon.

- [ ] **Step 5: Handmatige controle**

Start `npm run dev`, log in als admin, en doe in de console:

```js
await fetch("/api/time", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ projectId: "<een project id>", date: "2026-07-31", hours: 1, userId: "<id van een collega>" }),
}).then(r => r.json())
```

Expected: de response bevat `user.name` van de collega, niet die van jezelf. Herhaal met een onzin-`userId`: verwacht `400` met `"Onbekende medewerker"`. Log daarna in als medewerker en stuur hetzelfde verzoek met een `userId` van iemand anders: de entry moet op jouw eigen naam staan.

- [ ] **Step 6: Commit**

```bash
git add src/app/api
git commit -m "feat: accept optional userId on time, km and expense mutations"
```

---

## Task 4: Medewerker-select op `/time`

**Files:**
- Modify: `src/components/time/time-entries-client.tsx:22-32,141-144,280-346,364-378`

**Interfaces:**
- Consumes: `POST`/`PUT /api/time` met `userId` (Task 3). De prop `users: any[]` bestaat al en wordt al door `src/app/(app)/time/page.tsx` gevuld voor admins.
- Produces: geen exports.

- [ ] **Step 1: Voeg `userId` toe aan het formulierschema**

In het `schema` bovenaan (regel 22-30), voeg toe:

```ts
  userId: z.string().optional(),
```

- [ ] **Step 2: Zet de standaardwaarde op de ingelogde gebruiker**

Vervang de `useForm`-aanroep (regel 141-144):

```ts
  const form = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: { date: today, billable: true, userId },
  });
```

- [ ] **Step 3: Voeg de select toe aan het formulier**

Direct ná het `<div className="space-y-2">`-blok met het Klant-veld (regels 365-375), voeg toe:

```tsx
            {isAdmin && users.length > 0 && (
              <div className="space-y-2">
                <Label>Medewerker</Label>
                <Select onValueChange={(v) => form.setValue("userId", v)} value={form.watch("userId") ?? userId}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {users.map((u) => (
                      <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
```

- [ ] **Step 4: Vul de select bij het bewerken van een bestaande regel**

In `startEdit` (regel 334-346), voeg aan het `form.reset({...})`-object toe:

```ts
      userId: entry.userId,
```

- [ ] **Step 5: Zet het filter mee na het opslaan**

In `onSubmit`, in de `else`-tak (nieuwe entry, regels 303-322), direct ná `if (res.ok) {`:

```ts
          const targetUser = data.userId ?? userId;
          if (isAdmin && targetUser !== userId && filterUser !== "all" && filterUser !== targetUser) {
            setFilterUser(targetUser);
          }
```

En vervang de twee `form.reset(...)`-aanroepen in `onSubmit` en in de Annuleren-knop zodat `userId` behouden blijft in plaats van terug te springen naar jezelf — dat scheelt klikken als je een reeks uren voor dezelfde collega invoert:

```ts
form.reset({ date: data.date, billable: true, userId: data.userId ?? userId });
```

Voor de Annuleren-knop (regel 472-476) en de edit-tak: `form.reset({ date: selectedDay ?? today, billable: true, userId });` — dus dáár wél terug naar jezelf, want je stopt met bewerken.

- [ ] **Step 6: Zorg dat het filter de lijst herlaadt**

`setFilterUser` alleen zet de state maar haalt niets op. Vervang in Step 5 `setFilterUser(targetUser)` door `handleUserChange(targetUser)`, die bestaat al op regel 212 en doet allebei.

- [ ] **Step 7: Handmatige controle**

Run: `npm run dev`, log in als admin, ga naar `/time`. Kies een collega in de Medewerker-select, boek een uur, en controleer dat de regel in de lijst onder diens naam verschijnt. Log in als medewerker en bevestig dat de select er niet staat.

- [ ] **Step 8: Commit**

```bash
git add src/components/time/time-entries-client.tsx
git commit -m "feat: admins can book time entries on behalf of another employee"
```

---

## Task 5: `/km` gelijktrekken met `/time`

`/km` toont nu hard de eigen ritten en heeft geen medewerkersfilter, dus een rit die je voor een collega boekt verdwijnt uit beeld.

**Files:**
- Modify: `src/app/(app)/km/page.tsx:6-66`
- Modify: `src/components/km/km-entries-client.tsx`

**Interfaces:**
- Consumes: `POST`/`PUT /api/km` met `userId` (Task 3); `GET /api/km?userId=` bestaat nog niet en wordt in Step 1 toegevoegd.
- Produces: geen exports.

- [ ] **Step 1: Laat `GET /api/km` op medewerker filteren**

In `src/app/api/km/route.ts`, voeg in `GET` na regel 23 toe:

```ts
    const filterUserId = searchParams.get("userId");
```

en in de `where` van `prisma.kmEntry.findMany`, ná de `ownerId`-regel:

```ts
        ...(filterUserId && canViewAllEntries(role) ? { userId: filterUserId } : {}),
```

Dit is exact het patroon uit `src/app/api/time/route.ts:36`.

- [ ] **Step 2: Laat de pagina alle ritten en de gebruikerslijst laden**

In `src/app/(app)/km/page.tsx`, voeg na regel 9 toe:

```ts
  const admin = isAdmin(role);
```

met `import { isAdmin } from "@/lib/roles";` erbij. Vervang in de `kmEntry.findMany` de `where`-regel `userId,` door:

```ts
        ...(admin ? {} : { userId }),
```

Voeg `user: { select: { id: true, name: true } }` toe aan de `include` van die query. Voeg een zesde promise toe aan de `Promise.all`:

```ts
    admin
      ? prisma.user.findMany({ where: { archivedAt: null }, orderBy: { name: "asc" }, select: { id: true, name: true } })
      : Promise.resolve([]),
```

en geef hem door: `users={serialize(users)}` plus `userId={userId}`.

De `kmTemplate`-query blijft op `userId` staan — sjablonen zijn persoonlijk en veranderen niet.

- [ ] **Step 3: Neem de select, het filter en de kolom over uit `time-entries-client.tsx`**

In `src/components/km/km-entries-client.tsx`:

- Voeg `users: any[]` en `userId: string` toe aan `interface Props` en aan de destructurering.
- Voeg `userId: z.string().optional()` toe aan het formulierschema en `userId` aan de `defaultValues`.
- Voeg de Medewerker-select toe als eerste veld van het formulier:

```tsx
            {isAdmin && users.length > 0 && (
              <div className="space-y-2">
                <Label>Medewerker</Label>
                <Select onValueChange={(v) => form.setValue("userId", v)} value={form.watch("userId") ?? userId}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {users.map((u) => (
                      <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
```
- Voeg `const [filterUser, setFilterUser] = useState("all");` toe en een `handleUserChange` die de lijst opnieuw ophaalt met `userId=` in de querystring, naar het model van `time-entries-client.tsx:212-216`.
- Zet de filter-Select in de kaartkop, identiek aan `time-entries-client.tsx:518-528`.
- Toon een Medewerker-kolom in de tabel wanneer `isAdmin && filterUser === "all"`, naar het model van `time-entries-client.tsx:677,699-701`. Let op de `colSpan` van de lege-staat-rij.
- Neem `userId: entry.userId` mee in `startEdit`, en de filter-verschuiving na opslaan uit Task 4 Step 5-6.

- [ ] **Step 4: Handmatige controle**

Run: `npm run dev`. Als admin op `/km`: je ziet nu ook ritten van collega's, het filter werkt, en een rit boeken voor een collega laat die regel onder diens naam zien. Als medewerker: geen select, geen filter, alleen je eigen ritten.

- [ ] **Step 5: Commit**

```bash
git add src/app/api/km/route.ts src/app/\(app\)/km/page.tsx src/components/km/km-entries-client.tsx
git commit -m "feat: km page matches time page for admins (all entries, user filter, on-behalf booking)"
```

---

## Task 6: Medewerker-select op `/expenses`

**Files:**
- Modify: `src/app/(app)/expenses/page.tsx:7-46`
- Modify: `src/components/expenses/expenses-client.tsx:18-61,129-141,159,173-195`

**Interfaces:**
- Consumes: `POST`/`PUT /api/expenses` met `userId` (Task 3).
- Produces: geen exports.

`/expenses` krijgt géén medewerkersfilter: een admin ziet daar via `canViewAllEntries` al de uitgaven van iedereen, dus een uitgave voor een collega komt vanzelf in beeld.

- [ ] **Step 1: Laad de gebruikerslijst en geef rol-info door**

In `src/app/(app)/expenses/page.tsx`, voeg `isAdmin` toe aan de import uit `@/lib/roles`, en een vierde promise aan de `Promise.all`:

```ts
    isAdmin(role)
      ? prisma.user.findMany({ where: { archivedAt: null }, orderBy: { name: "asc" }, select: { id: true, name: true } })
      : Promise.resolve([]),
```

Geef door aan de client: `users={serialize(users)}` en `userId={userId}`.

- [ ] **Step 2: Breid het formulier uit**

In `src/components/expenses/expenses-client.tsx`:

- `interface Props` krijgt `users: any[]` en `userId: string`; destructureer beide.
- Voeg `const isAdmin = role === "ADMIN";` toe bovenaan de component (die bestaat hier nog niet).
- Schema krijgt `userId: z.string().optional()`.
- Alle vier de `form.reset({...})`- en `defaultValues`-objecten krijgen `userId` erbij. De drie die na een succesvolle actie resetten gebruiken `userId: data.userId ?? userId`; die in de Annuleren-knop gebruikt `userId`.
- Voeg de Medewerker-select toe als eerste veld van het formulier, vóór Categorie:

```tsx
              {isAdmin && users.length > 0 && (
                <div className="space-y-2">
                  <Label>Medewerker</Label>
                  <Select onValueChange={(v) => form.setValue("userId", v)} value={form.watch("userId") ?? userId}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {users.map((u) => (
                        <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
```

- `startEdit` krijgt `userId: expense.userId` in het reset-object.

- [ ] **Step 3: Verwijder de dode `isReadOnly`-regel**

Regel 159 declareert `isReadOnly` maar niemand roept hem aan — de tabel gebruikt `const readOnly = showReimbursements` op regel 306. Verwijder regel 159 volledig. Er verandert niets aan het gedrag.

- [ ] **Step 4: Toon de medewerker in de tabel voor admins**

De Medewerker-kolom staat er nu alleen bij `showReimbursements`. Vervang die conditie op regels 293 en 310 door `(showReimbursements || isAdmin)` zodat een admin ook op het tabblad Project uitgaven ziet van wie een regel is. Pas de twee `colSpan={8}` op regels 303-304 aan naar `colSpan={showReimbursements || isAdmin ? 8 : 7}`.

- [ ] **Step 5: Controleer**

Run: `npm run lint && npm test`, daarna `npm run dev`. Als admin op `/expenses`: de select staat er, een uitgave voor een collega verschijnt onder diens naam in de lijst. Als medewerker: geen select, geen Medewerker-kolom.

- [ ] **Step 6: Commit**

```bash
git add src/app/\(app\)/expenses/page.tsx src/components/expenses/expenses-client.tsx
git commit -m "feat: admins can book expenses on behalf of another employee"
```

---

## Task 7: Helper voor bulkmutaties

**Files:**
- Create: `src/lib/bulk-entries.ts`
- Test: `src/lib/bulk-entries.test.ts`

**Interfaces:**
- Produces:
  - `type BulkKind = "time" | "km" | "expense"`
  - `type BulkAction = { type: "project"; projectId: string } | { type: "billable"; billable: boolean } | { type: "user"; userId: string } | { type: "delete" }`
  - `buildBulkWhere(ids: string[]): { id: { in: string[] }; invoiced: false }`
  - `buildBulkData(action: BulkAction): Record<string, string | boolean>` — gooit bij `{ type: "delete" }`.
  - `ENTRY_ENDPOINT: Record<BulkKind, string>` — `/api/time`, `/api/km`, `/api/expenses`.

- [ ] **Step 1: Write the failing test**

Create `src/lib/bulk-entries.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { buildBulkWhere, buildBulkData } from "./bulk-entries";

describe("buildBulkWhere", () => {
  it("scopes to the given ids", () => {
    expect(buildBulkWhere(["a", "b"]).id).toEqual({ in: ["a", "b"] });
  });

  it("always excludes invoiced rows", () => {
    expect(buildBulkWhere(["a"]).invoiced).toBe(false);
    expect(buildBulkWhere([]).invoiced).toBe(false);
  });
});

describe("buildBulkData", () => {
  it("moves rows to another project", () => {
    expect(buildBulkData({ type: "project", projectId: "p-1" })).toEqual({ projectId: "p-1" });
  });

  it("flips the billable flag both ways", () => {
    expect(buildBulkData({ type: "billable", billable: false })).toEqual({ billable: false });
    expect(buildBulkData({ type: "billable", billable: true })).toEqual({ billable: true });
  });

  it("reassigns rows to another employee", () => {
    expect(buildBulkData({ type: "user", userId: "u-9" })).toEqual({ userId: "u-9" });
  });

  it("refuses to build update data for a delete", () => {
    expect(() => buildBulkData({ type: "delete" })).toThrow();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/bulk-entries.test.ts`
Expected: FAIL — `Failed to resolve import "./bulk-entries"`.

- [ ] **Step 3: Write minimal implementation**

Create `src/lib/bulk-entries.ts`:

```ts
export type BulkKind = "time" | "km" | "expense";

export type BulkAction =
  | { type: "project"; projectId: string }
  | { type: "billable"; billable: boolean }
  | { type: "user"; userId: string }
  | { type: "delete" };

/** De losse-regel-endpoints per soort, gedeeld door de dialoog en de bulkbalk. */
export const ENTRY_ENDPOINT: Record<BulkKind, string> = {
  time: "/api/time",
  km: "/api/km",
  expense: "/api/expenses",
};

/**
 * De where-clausule voor elke bulkmutatie. De invoiced-guard zit hier vast in,
 * zodat geen enkele aanroeper hem kan vergeten.
 */
export function buildBulkWhere(ids: string[]): { id: { in: string[] }; invoiced: false } {
  return { id: { in: ids }, invoiced: false };
}

export function buildBulkData(action: BulkAction): Record<string, string | boolean> {
  switch (action.type) {
    case "project": return { projectId: action.projectId };
    case "billable": return { billable: action.billable };
    case "user": return { userId: action.userId };
    case "delete": throw new Error("buildBulkData is niet bedoeld voor verwijderen");
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/bulk-entries.test.ts`
Expected: PASS, 6 tests.

- [ ] **Step 5: Commit**

```bash
git add src/lib/bulk-entries.ts src/lib/bulk-entries.test.ts
git commit -m "feat: bulk-entries helpers with a built-in invoiced guard"
```

---

## Task 8: `POST /api/entries/bulk`

**Files:**
- Create: `src/app/api/entries/bulk/route.ts`

**Interfaces:**
- Consumes: `buildBulkWhere`, `buildBulkData`, `BulkKind`, `BulkAction` uit Task 7; `isAdmin` uit `src/lib/roles.ts`.
- Produces: `POST /api/entries/bulk` met body `{ kind, ids, action }` en response `{ count: number }`.

- [ ] **Step 1: Schrijf de route**

Create `src/app/api/entries/bulk/route.ts`:

```ts
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { z } from "zod";
import { handleError } from "@/lib/api";
import { isAdmin } from "@/lib/roles";
import { buildBulkWhere, buildBulkData } from "@/lib/bulk-entries";

const schema = z.object({
  kind: z.enum(["time", "km", "expense"]),
  ids: z.array(z.string().min(1)).min(1).max(500),
  action: z.discriminatedUnion("type", [
    z.object({ type: z.literal("project"), projectId: z.string().min(1) }),
    z.object({ type: z.literal("billable"), billable: z.boolean() }),
    z.object({ type: z.literal("user"), userId: z.string().min(1) }),
    z.object({ type: z.literal("delete") }),
  ]),
});

export async function POST(req: Request) {
  try {
    const session = await auth();
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const role = (session.user as any)?.role ?? "EMPLOYEE";
    if (!isAdmin(role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const { kind, ids, action } = schema.parse(await req.json());

    if (action.type === "project") {
      const project = await prisma.project.findUnique({ where: { id: action.projectId }, select: { id: true } });
      if (!project) return NextResponse.json({ error: "Onbekend project" }, { status: 400 });
    }
    if (action.type === "user") {
      const user = await prisma.user.findUnique({ where: { id: action.userId }, select: { id: true } });
      if (!user) return NextResponse.json({ error: "Onbekende medewerker" }, { status: 400 });
    }

    const model =
      kind === "time" ? prisma.timeEntry : kind === "km" ? prisma.kmEntry : prisma.expense;
    const where = buildBulkWhere(ids);

    const { count } =
      action.type === "delete"
        ? await (model as any).deleteMany({ where })
        : await (model as any).updateMany({ where, data: buildBulkData(action) });

    return NextResponse.json({ count });
  } catch (e) { return handleError(e); }
}
```

De `as any` op `model` is nodig omdat de drie prisma-delegates verschillende generieke typen hebben; de `where` en `data` zijn voor alle drie geldig. Zet er een korte comment bij zodat het geen mysterie wordt:

```ts
    // De drie delegates delen deze where/data-vorm maar niet hun generieke type.
```

- [ ] **Step 2: Controleer dat het compileert**

Run: `npm run lint && npm test`
Expected: schoon.

- [ ] **Step 3: Handmatige controle**

Start `npm run dev`, log in als admin. Pak twee uren-ids uit `/reports` of de netwerk-tab en doe in de console:

```js
await fetch("/api/entries/bulk", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ kind: "time", ids: ["<id1>", "<id2>"], action: { type: "billable", billable: false } }),
}).then(r => r.json())
```

Expected: `{ count: 2 }`, en beide regels staan op niet-factureerbaar. Herhaal met een id van een gefactureerde regel erbij: `count` is dan lager dan het aantal ids en de gefactureerde regel is ongemoeid. Log in als medewerker en herhaal: `403`.

- [ ] **Step 4: Commit**

```bash
git add src/app/api/entries/bulk/route.ts
git commit -m "feat: admin-only bulk mutation endpoint for time, km and expense entries"
```

---

## Task 9: Rekenlogica uit `reports-client.tsx` naar `src/lib/`

Puur verplaatsen plus één bewust gedragsverschil: de urentabel toont het tarief nu als `rateOverride ?? activityType.defaultRate ?? 0`, zónder de project-fallback, terwijl de samenvattingskaart én de tabelvoet wél `?? project.defaultHourlyRate` meenemen. Daardoor staat er in een rij "—" terwijl het bedrag eronder wel meetelt. Na deze taak gebruikt alles dezelfde functie mét project-fallback.

**Files:**
- Create: `src/lib/report-totals.ts`
- Test: `src/lib/report-totals.test.ts`
- Modify: `src/components/reports/reports-client.tsx:70-121,331-334,390-397`

**Interfaces:**
- Produces:
  - `timeRate(entry: any): number`
  - `kmRate(entry: any): number`
  - `reportTotals(data: { timeEntries: any[]; kmEntries: any[]; expenses: any[] }): { hours: number; km: number; expenses: number; revenue: number }`
  - `type EmployeeSummary = { userId: string; name: string; hours: number; km: number; expenses: number; revenue: number; weeklyHours: number | null }`
  - `groupByEmployee(data: { timeEntries: any[]; kmEntries: any[]; expenses: any[] }, users: { id: string; weeklyHours: number | null }[]): EmployeeSummary[]`

- [ ] **Step 1: Write the failing test**

Create `src/lib/report-totals.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { timeRate, kmRate, reportTotals, groupByEmployee } from "./report-totals";

const data = {
  timeEntries: [
    { hours: 2, rateOverride: null, activityType: { defaultRate: 100 }, project: { defaultHourlyRate: 80 }, user: { id: "u1", name: "Anne" } },
    { hours: 3, rateOverride: 50, activityType: { defaultRate: 100 }, project: { defaultHourlyRate: 80 }, user: { id: "u2", name: "Bram" } },
  ],
  kmEntries: [
    { km: 10, rateOverride: null, project: { defaultKmRate: 0.23 }, user: { id: "u1", name: "Anne" } },
  ],
  expenses: [
    { amount: 40, billable: true, user: { id: "u1", name: "Anne" } },
    { amount: 60, billable: false, user: { id: "u2", name: "Bram" } },
  ],
};

describe("timeRate", () => {
  it("prefers the override", () => {
    expect(timeRate({ rateOverride: 50, activityType: { defaultRate: 100 }, project: { defaultHourlyRate: 80 } })).toBe(50);
  });

  it("falls back to the activity rate, then the project rate", () => {
    expect(timeRate({ rateOverride: null, activityType: { defaultRate: 100 }, project: { defaultHourlyRate: 80 } })).toBe(100);
    expect(timeRate({ rateOverride: null, activityType: null, project: { defaultHourlyRate: 80 } })).toBe(80);
    expect(timeRate({ rateOverride: null, activityType: null, project: null })).toBe(0);
  });
});

describe("kmRate", () => {
  it("prefers the override, then the project rate", () => {
    expect(kmRate({ rateOverride: 0.5, project: { defaultKmRate: 0.23 } })).toBe(0.5);
    expect(kmRate({ rateOverride: null, project: { defaultKmRate: 0.23 } })).toBe(0.23);
    expect(kmRate({ rateOverride: null, project: null })).toBe(0);
  });
});

describe("reportTotals", () => {
  it("sums hours, km and expense amounts", () => {
    const t = reportTotals(data);
    expect(t.hours).toBe(5);
    expect(t.km).toBe(10);
    expect(t.expenses).toBe(100);
  });

  it("counts only billable expenses towards revenue", () => {
    // 2*100 + 3*50 + 10*0.23 + 40 = 392.3
    expect(reportTotals(data).revenue).toBeCloseTo(392.3, 2);
  });
});

describe("groupByEmployee", () => {
  const users = [{ id: "u1", weeklyHours: 40 }, { id: "u2", weeklyHours: null }];

  it("groups every kind under its employee", () => {
    const rows = groupByEmployee(data, users);
    expect(rows.map((r) => r.name)).toEqual(["Anne", "Bram"]);
    expect(rows[0]).toMatchObject({ hours: 2, km: 10, expenses: 40, weeklyHours: 40 });
    expect(rows[1]).toMatchObject({ hours: 3, km: 0, expenses: 60, weeklyHours: null });
  });

  it("sorts by name", () => {
    const reversed = { ...data, timeEntries: [...data.timeEntries].reverse() };
    expect(groupByEmployee(reversed, users).map((r) => r.name)).toEqual(["Anne", "Bram"]);
  });

  it("buckets entries without a user under Onbekend", () => {
    const orphan = { timeEntries: [{ hours: 1, rateOverride: null, activityType: null, project: null, user: null }], kmEntries: [], expenses: [] };
    expect(groupByEmployee(orphan, users)[0]).toMatchObject({ userId: "unknown", name: "Onbekend" });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/report-totals.test.ts`
Expected: FAIL — `Failed to resolve import "./report-totals"`.

- [ ] **Step 3: Write minimal implementation**

Create `src/lib/report-totals.ts`:

```ts
export type ReportData = {
  timeEntries: any[];
  kmEntries: any[];
  expenses: any[];
};

export type EmployeeSummary = {
  userId: string;
  name: string;
  hours: number;
  km: number;
  expenses: number;
  revenue: number;
  weeklyHours: number | null;
};

/** Uurtarief: override, anders het activiteitstarief, anders het projecttarief. */
export function timeRate(entry: any): number {
  return Number(entry.rateOverride ?? entry.activityType?.defaultRate ?? entry.project?.defaultHourlyRate ?? 0);
}

/** Kilometertarief: override, anders het projecttarief. */
export function kmRate(entry: any): number {
  return Number(entry.rateOverride ?? entry.project?.defaultKmRate ?? 0);
}

export function reportTotals(data: ReportData) {
  const hours = data.timeEntries.reduce((s, e) => s + Number(e.hours), 0);
  const km = data.kmEntries.reduce((s, e) => s + Number(e.km), 0);
  const expenses = data.expenses.reduce((s, e) => s + Number(e.amount), 0);
  const revenue =
    data.timeEntries.reduce((s, e) => s + Number(e.hours) * timeRate(e), 0) +
    data.kmEntries.reduce((s, e) => s + Number(e.km) * kmRate(e), 0) +
    data.expenses.filter((e) => e.billable).reduce((s, e) => s + Number(e.amount), 0);
  return { hours, km, expenses, revenue };
}

export function groupByEmployee(
  data: ReportData,
  users: { id: string; weeklyHours: number | null }[],
): EmployeeSummary[] {
  const weekly = new Map(users.map((u) => [u.id, u.weeklyHours]));
  const map = new Map<string, EmployeeSummary>();

  function bucket(user: any): EmployeeSummary {
    const id = user?.id ?? "unknown";
    if (!map.has(id)) {
      map.set(id, {
        userId: id,
        name: user?.name ?? "Onbekend",
        hours: 0, km: 0, expenses: 0, revenue: 0,
        weeklyHours: weekly.get(id) ?? null,
      });
    }
    return map.get(id)!;
  }

  for (const e of data.timeEntries) {
    const row = bucket(e.user);
    row.hours += Number(e.hours);
    row.revenue += Number(e.hours) * timeRate(e);
  }
  for (const e of data.kmEntries) {
    const row = bucket(e.user);
    row.km += Number(e.km);
    row.revenue += Number(e.km) * kmRate(e);
  }
  for (const e of data.expenses) {
    const row = bucket(e.user);
    row.expenses += Number(e.amount);
    if (e.billable) row.revenue += Number(e.amount);
  }

  return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name));
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/report-totals.test.ts`
Expected: PASS, 9 tests.

- [ ] **Step 5: Laat `reports-client.tsx` de helpers gebruiken**

Vervang in `src/components/reports/reports-client.tsx`:

- Regels 70-84 (`totalHours` t/m `totalRevenue`) door:
  ```ts
  const totals = data ? reportTotals(data) : { hours: 0, km: 0, expenses: 0, revenue: 0 };
  const { hours: totalHours, km: totalKm, expenses: totalExpenses, revenue: totalRevenue } = totals;
  ```
- Regels 86-121 (het hele `employeeGroups`-`useMemo`) door:
  ```ts
  const employeeGroups = useMemo(() => (data ? groupByEmployee(data, users) : []), [data, users]);
  ```
- In de urentabel, regel 331-332: `const rate = timeRate(e);`
- In de rittentabel, regel 390-391: `const rate = kmRate(e);`
- In de tabelvoet van de urentabel (regels 362-367), de inline reduce door `formatCurrency(data.timeEntries.reduce((s, e) => s + Number(e.hours) * timeRate(e), 0))`.

Verwijder de nu ongebruikte import van `useMemo`? Nee — die blijft in gebruik. Voeg toe:

```ts
import { reportTotals, groupByEmployee, timeRate, kmRate } from "@/lib/report-totals";
```

De lokale `EmployeeSummary`-type-definitie (regels 27-35) kan weg; importeer hem als je hem nodig hebt.

- [ ] **Step 6: Controleer**

Run: `npm run lint && npm test`, daarna `npm run dev` en open `/reports`. Haal een rapport op over een maand met uren. De totalen moeten identiek zijn aan vóór deze taak; het enige verschil is dat de tarief-kolom in de urenlijst nu een projecttarief toont waar eerst "—" stond.

- [ ] **Step 7: Commit**

```bash
git add src/lib/report-totals.ts src/lib/report-totals.test.ts src/components/reports/reports-client.tsx
git commit -m "refactor: extract report totals and grouping into a tested lib module"
```

---

## Task 10: `reports-client.tsx` opsplitsen

Puur verplaatsen, geen gedragsverandering. Dit maakt de volgende twee taken behapbaar.

**Files:**
- Create: `src/components/reports/report-filters.tsx`
- Create: `src/components/reports/time-rows.tsx`
- Create: `src/components/reports/km-rows.tsx`
- Create: `src/components/reports/expense-rows.tsx`
- Modify: `src/components/reports/reports-client.tsx`

**Interfaces:**
- Produces:
  - `ReportFilters(props: { customers: any[]; projects: any[]; users: any[]; tags: any[]; value: FilterState; onChange: (next: FilterState) => void; onSubmit: () => void; loading: boolean })`
  - `type FilterState = { from: string; to: string; customerId: string; projectId: string; userId: string; billable: string; tagIds: string[]; groupByEmployee: boolean }` — geëxporteerd uit `report-filters.tsx`.
  - `TimeRows(props: { entries: any[]; total: number })`
  - `KmRows(props: { entries: any[] })`
  - `ExpenseRows(props: { entries: any[]; total: number })`

- [ ] **Step 1: Verhuis de filterkaart**

Knip regels 129-217 van `reports-client.tsx` (de hele `<Card>` met `<CardTitle>Filters</CardTitle>` tot en met de "Rapport ophalen"-knop) naar `report-filters.tsx`. Bundel de acht losse `useState`-waarden in één `FilterState`-object dat als prop in en uit gaat:

```tsx
"use client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Search } from "lucide-react";

export type FilterState = {
  from: string;
  to: string;
  customerId: string;
  projectId: string;
  userId: string;
  billable: string;
  tagIds: string[];
  groupByEmployee: boolean;
};

interface Props {
  customers: any[];
  projects: any[];
  users: any[];
  tags: any[];
  value: FilterState;
  onChange: (next: FilterState) => void;
  onSubmit: () => void;
  loading: boolean;
}

export function ReportFilters({ customers, projects, users, tags, value, onChange, onSubmit, loading }: Props) {
  const set = <K extends keyof FilterState>(key: K, v: FilterState[K]) => onChange({ ...value, [key]: v });
  const filteredProjects = value.customerId ? projects.filter((p) => p.customerId === value.customerId) : projects;
  // ...de bestaande JSX, met value.from / set("from", ...) enzovoort.
}
```

Bij het kiezen van een klant moet `projectId` leeglopen, net als nu op regel 143: `onChange({ ...value, customerId: v === "_all" ? "" : v, projectId: "" })`.

- [ ] **Step 2: Verhuis de drie tabellen**

Knip de urenkaart (regels 313-374), de rittenkaart (regels 376-417) en de uitgavenkaart (regels 419-460) naar respectievelijk `time-rows.tsx`, `km-rows.tsx` en `expense-rows.tsx`. Elk bestand exporteert één component met de props uit het Interfaces-blok hierboven en gebruikt `timeRate` / `kmRate` uit `@/lib/report-totals`. De `total`-props zijn de al berekende `totalHours` en `totalExpenses` voor de tabelvoet.

- [ ] **Step 3: Laat `reports-client.tsx` de vier componenten aanroepen**

Wat overblijft in `reports-client.tsx`: de `FilterState`, `data`, `loading`, `loadReport()`, de vier samenvattingskaarten, de per-medewerker-tabel, en de "geen registraties gevonden"-kaart.

- [ ] **Step 4: Controleer dat er niets veranderd is**

Run: `npm run lint && npm test`, daarna `npm run dev`. Open `/reports`, haal hetzelfde rapport op als in Task 9 Step 6 en vergelijk: filters, totalen en de drie tabellen moeten er identiek uitzien.

- [ ] **Step 5: Commit**

```bash
git add src/components/reports
git commit -m "refactor: split reports-client into filters and per-kind row tables"
```

---

## Task 11: Regels bewerken en verwijderen in `/reports`

**Files:**
- Create: `src/components/reports/entry-edit-dialog.tsx`
- Modify: `src/app/(app)/reports/page.tsx`
- Modify: `src/components/reports/reports-client.tsx`
- Modify: `src/components/reports/time-rows.tsx`, `km-rows.tsx`, `expense-rows.tsx`

**Interfaces:**
- Consumes: `PUT /api/time/[id]`, `PUT /api/km/[id]`, `PUT /api/expenses/[id]` met `userId` (Task 3); de bijbehorende `DELETE`-routes met invoiced-guard (Task 2); `BulkKind` uit Task 7 als soort-aanduiding.
- Produces:
  - `EntryEditDialog(props: { kind: BulkKind | null; entry: any | null; projects: any[]; activityTypes: any[]; categories: any[]; users: any[]; onClose: () => void; onSaved: () => void })`
  - `time-rows.tsx` / `km-rows.tsx` / `expense-rows.tsx` krijgen elk twee extra props: `canEdit: boolean` en `onEdit: (entry: any) => void`, `onDelete: (entry: any) => void`.

- [ ] **Step 1: Laad de ontbrekende referentiedata op de pagina**

In `src/app/(app)/reports/page.tsx`:

- Voeg `customer: { select: { name: true } }` toe aan de `select` van de projects-query, zodat de dialoog klantnamen kan tonen.
- Voeg twee promises toe aan de `Promise.all`:
  ```ts
    prisma.activityType.findMany({
      where: { archivedAt: null },
      orderBy: { name: "asc" },
      include: { projects: { select: { projectId: true } } },
    }),
    prisma.expenseCategory.findMany({ orderBy: { name: "asc" } }),
  ```
- Geef door aan de client: `activityTypes={serialize(activityTypes)}`, `categories={serialize(categories)}` en `role={(session?.user as any)?.role ?? "EMPLOYEE"}`. Importeer `serialize` uit `@/lib/utils`.

Breid in `reports-client.tsx` de `interface Props` uit met de drie nieuwe props en destructureer ze:

```ts
interface Props {
  customers: any[];
  projects: any[];
  users: { id: string; name: string; weeklyHours: number | null }[];
  currentUserId: string;
  tags: { id: string; name: string }[];
  activityTypes: any[];
  categories: any[];
  role: string;
}
```

Let op: `currentUserId` staat al in `Props` maar wordt niet gedestructureerd — laat dat zo, of haal hem weg als lint erover klaagt.

- [ ] **Step 2: Schrijf de dialoog**

Create `src/components/reports/entry-edit-dialog.tsx`. Eén component, drie veldensets, één `PUT`. De endpoint volgt uit `kind`:

```tsx
"use client";
import { useEffect, useState } from "react";
import { format } from "date-fns";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ENTRY_ENDPOINT, type BulkKind } from "@/lib/bulk-entries";

const TITLE: Record<BulkKind, string> = { time: "Uren aanpassen", km: "Rit aanpassen", expense: "Uitgave aanpassen" };

interface Props {
  kind: BulkKind | null;
  entry: any | null;
  projects: any[];
  activityTypes: any[];
  categories: any[];
  users: any[];
  onClose: () => void;
  onSaved: () => void;
}

export function EntryEditDialog({ kind, entry, projects, activityTypes, categories, users, onClose, onSaved }: Props) {
  const [form, setForm] = useState<any>({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!entry || !kind) return;
    setError(null);
    setForm({
      projectId: entry.projectId ?? "",
      activityTypeId: entry.activityTypeId ?? "",
      categoryId: entry.categoryId ?? "",
      userId: entry.userId ?? "",
      date: format(new Date(entry.date), "yyyy-MM-dd"),
      hours: entry.hours != null ? String(entry.hours) : "",
      km: entry.km != null ? String(entry.km) : "",
      amount: entry.amount != null ? String(entry.amount) : "",
      vatRate: entry.vatRate != null ? String(entry.vatRate) : "21",
      description: entry.description ?? "",
      rateOverride: entry.rateOverride != null ? String(entry.rateOverride) : "",
      billable: entry.billable ?? true,
      reimbursable: entry.reimbursable ?? false,
    });
  }, [entry, kind]);

  if (!kind || !entry) return null;

  const set = (key: string, value: any) => setForm((f: any) => ({ ...f, [key]: value }));
  const num = (v: string) => (v === "" ? null : Number(v));

  const availableActivities = activityTypes.filter(
    (a) => a.showInAllProjects || a.projects.some((p: any) => p.projectId === form.projectId),
  );

  async function save() {
    setSaving(true);
    setError(null);
    const body =
      kind === "time"
        ? { projectId: form.projectId, activityTypeId: form.activityTypeId || null, date: form.date, hours: Number(form.hours), description: form.description, rateOverride: num(form.rateOverride), billable: form.billable, userId: form.userId }
        : kind === "km"
        ? { projectId: form.projectId, activityTypeId: form.activityTypeId || null, date: form.date, km: Number(form.km), description: form.description, rateOverride: num(form.rateOverride), billable: form.billable, userId: form.userId }
        : { categoryId: form.categoryId, projectId: form.projectId || null, date: form.date, description: form.description, amount: Number(form.amount), vatRate: Number(form.vatRate), billable: form.billable, reimbursable: form.reimbursable, userId: form.userId };

    const res = await fetch(`${ENTRY_ENDPOINT[kind]}/${entry.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    setSaving(false);
    if (!res.ok) {
      const payload = await res.json().catch(() => ({}));
      setError(payload.error ?? "Opslaan mislukt");
      return;
    }
    onSaved();
  }

  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent>
        <DialogHeader><DialogTitle>{TITLE[kind]}</DialogTitle></DialogHeader>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label>Medewerker</Label>
            <Select value={form.userId} onValueChange={(v) => set("userId", v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {users.map((u) => <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          {kind === "expense" && (
            <div className="space-y-2">
              <Label>Categorie</Label>
              <Select value={form.categoryId} onValueChange={(v) => set("categoryId", v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {categories.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          )}

          <div className="space-y-2">
            <Label>Project</Label>
            <Select value={form.projectId} onValueChange={(v) => set("projectId", v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {projects.map((p) => (
                  <SelectItem key={p.id} value={p.id}>{p.customer ? `${p.customer.name} — ` : ""}{p.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {kind !== "expense" && (
            <div className="space-y-2">
              <Label>Activiteit</Label>
              <Select value={form.activityTypeId} onValueChange={(v) => set("activityTypeId", v)}>
                <SelectTrigger><SelectValue placeholder="Geen" /></SelectTrigger>
                <SelectContent>
                  {availableActivities.map((a) => <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          )}

          <div className="space-y-2">
            <Label>Datum</Label>
            <Input type="date" value={form.date} onChange={(e) => set("date", e.target.value)} />
          </div>

          {kind === "time" && (
            <div className="space-y-2">
              <Label>Uren</Label>
              <Input type="number" step="0.25" min="0.25" value={form.hours} onChange={(e) => set("hours", e.target.value)} />
            </div>
          )}
          {kind === "km" && (
            <div className="space-y-2">
              <Label>Kilometers</Label>
              <Input type="number" step="0.1" min="0.1" value={form.km} onChange={(e) => set("km", e.target.value)} />
            </div>
          )}
          {kind === "expense" && (
            <>
              <div className="space-y-2">
                <Label>Bedrag (€)</Label>
                <Input type="number" step="0.01" min="0.01" value={form.amount} onChange={(e) => set("amount", e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>BTW %</Label>
                <Input type="number" step="1" min="0" max="100" value={form.vatRate} onChange={(e) => set("vatRate", e.target.value)} />
              </div>
            </>
          )}

          {kind !== "expense" && (
            <div className="space-y-2">
              <Label>Tarief override</Label>
              <Input type="number" step="0.01" min="0" placeholder="Optioneel" value={form.rateOverride} onChange={(e) => set("rateOverride", e.target.value)} />
            </div>
          )}

          <div className="space-y-2">
            <Label>Factureerbaar</Label>
            <Select value={form.billable ? "true" : "false"} onValueChange={(v) => set("billable", v === "true")}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="true">Ja</SelectItem>
                <SelectItem value="false">Nee</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {kind === "expense" && (
            <div className="space-y-2">
              <Label>Declaratie (terugbetaling)</Label>
              <Select value={form.reimbursable ? "true" : "false"} onValueChange={(v) => set("reimbursable", v === "true")}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="false">Nee</SelectItem>
                  <SelectItem value="true">Ja</SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}

          <div className="space-y-2 sm:col-span-2">
            <Label>Omschrijving</Label>
            <Textarea rows={2} value={form.description} onChange={(e) => set("description", e.target.value)} />
          </div>

          {error && <p className="sm:col-span-2 text-sm text-destructive">{error}</p>}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Annuleren</Button>
          <Button onClick={save} disabled={saving}>{saving ? "Opslaan..." : "Opslaan"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 3: Voeg de knoppen toe aan de drie rijtabellen**

In elk van `time-rows.tsx`, `km-rows.tsx` en `expense-rows.tsx`: voeg `canEdit`, `onEdit` en `onDelete` toe aan de props, een lege `<TableHead></TableHead>` aan de kop wanneer `canEdit`, en per rij een cel:

```tsx
{canEdit && (
  <TableCell>
    <div className="flex gap-1 justify-end">
      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => onEdit(e)} disabled={e.invoiced}>
        <Pencil className="h-3.5 w-3.5" />
      </Button>
      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => onDelete(e)} disabled={e.invoiced}>
        <Trash2 className="h-3.5 w-3.5 text-destructive" />
      </Button>
    </div>
  </TableCell>
)}
```

Met `import { Pencil, Trash2 } from "lucide-react";`. Let op de `colSpan` in de tabelvoeten: die moeten met één omhoog wanneer `canEdit`.

- [ ] **Step 4: Bedraad het in `reports-client.tsx`**

Voeg de imports toe:

```ts
import { ENTRY_ENDPOINT, type BulkKind } from "@/lib/bulk-entries";
import { EntryEditDialog } from "./entry-edit-dialog";
```

Voeg toe:

```tsx
  const canEdit = role === "ADMIN";
  const [editing, setEditing] = useState<{ kind: BulkKind; entry: any } | null>(null);

  async function deleteEntry(kind: BulkKind, entry: any) {
    if (!confirm("Weet u zeker dat u deze registratie wilt verwijderen?")) return;
    const res = await fetch(`${ENTRY_ENDPOINT[kind]}/${entry.id}`, { method: "DELETE" });
    if (!res.ok) {
      const payload = await res.json().catch(() => ({}));
      alert(payload.error ?? "Verwijderen mislukt");
      return;
    }
    await loadReport();
  }
```

Geef `canEdit`, `onEdit={(e) => setEditing({ kind: "time", entry: e })}` en `onDelete={(e) => deleteEntry("time", e)}` door aan `TimeRows`, en de km- en expense-varianten aan de andere twee. Render onderaan:

```tsx
      <EntryEditDialog
        kind={editing?.kind ?? null}
        entry={editing?.entry ?? null}
        projects={projects}
        activityTypes={activityTypes}
        categories={categories}
        users={users}
        onClose={() => setEditing(null)}
        onSaved={async () => { setEditing(null); await loadReport(); }}
      />
```

`loadReport` haalt met de actieve filters opnieuw op, dus rijen die na een wijziging buiten het filter vallen verdwijnen vanzelf.

- [ ] **Step 5: Handmatige controle**

Run: `npm run dev`. Als admin op `/reports`: haal een rapport op, wijzig een uur-regel naar een ander project en zie de lijst herladen. Wijzig een regel naar een andere medewerker en controleer dat de Medewerker-kolom meeverandert. Probeer een gefactureerde regel: de knoppen staan op disabled. Log in als finance: geen knoppen, en `PUT /api/time/<id>` uit de console geeft 403.

- [ ] **Step 6: Commit**

```bash
git add src/app/\(app\)/reports/page.tsx src/components/reports
git commit -m "feat: edit and delete entries from the reports overview"
```

---

## Task 12: Selectie en bulkbalk

**Files:**
- Create: `src/components/reports/bulk-bar.tsx`
- Modify: `src/components/reports/reports-client.tsx`
- Modify: `src/components/reports/time-rows.tsx`, `km-rows.tsx`, `expense-rows.tsx`

**Interfaces:**
- Consumes: `POST /api/entries/bulk` (Task 8); `BulkKind`, `BulkAction` uit Task 7.
- Produces:
  - `BulkBar(props: { kind: BulkKind; count: number; projects: any[]; users: any[]; onApply: (action: BulkAction) => void; busy: boolean })`
  - De drie rijtabellen krijgen `selected: Set<string>`, `selectableIds: string[]`, `onToggle: (id: string) => void` en `onToggleAll: () => void`.

- [ ] **Step 1: Voeg selectievakjes toe aan de drie tabellen**

In elk van de drie bestanden, wanneer `canEdit`: een extra kolom vóór Datum met in de kop

```tsx
<TableHead className="w-8">
  <input
    type="checkbox"
    className="h-4 w-4 rounded border-input accent-primary"
    checked={selectableIds.length > 0 && selectableIds.every((id) => selected.has(id))}
    onChange={onToggleAll}
  />
</TableHead>
```

waarbij `selectableIds` als prop binnenkomt (`selectableIds: string[]`, doorgegeven vanuit `reports-client.tsx`, zie Step 3). Per rij:

```tsx
<TableCell>
  {!e.invoiced && (
    <input
      type="checkbox"
      className="h-4 w-4 rounded border-input accent-primary"
      checked={selected.has(e.id)}
      onChange={() => onToggle(e.id)}
    />
  )}
</TableCell>
```

Gefactureerde regels krijgen dus geen vakje en kunnen niet in een selectie belanden. Verhoog de `colSpan` in de tabelvoeten opnieuw met één.

- [ ] **Step 2: Schrijf de bulkbalk**

Create `src/components/reports/bulk-bar.tsx`:

```tsx
"use client";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { BulkKind, BulkAction } from "@/lib/bulk-entries";

interface Props {
  kind: BulkKind;
  count: number;
  projects: any[];
  users: any[];
  onApply: (action: BulkAction) => void;
  busy: boolean;
}

const NOUN: Record<BulkKind, string> = { time: "uurregels", km: "ritten", expense: "uitgaven" };

export function BulkBar({ kind, count, projects, users, onApply, busy }: Props) {
  const [projectId, setProjectId] = useState("");
  const [userId, setUserId] = useState("");

  return (
    <div className="flex flex-wrap items-center gap-2 border-b bg-muted/50 px-4 py-2 text-sm">
      <span className="font-medium">{count} {NOUN[kind]} geselecteerd</span>

      <Select value={projectId} onValueChange={(v) => { setProjectId(v); onApply({ type: "project", projectId: v }); setProjectId(""); }}>
        <SelectTrigger className="h-8 w-56"><SelectValue placeholder="Verplaats naar project" /></SelectTrigger>
        <SelectContent>
          {projects.map((p) => (
            <SelectItem key={p.id} value={p.id}>{p.customer ? `${p.customer.name} — ` : ""}{p.name}</SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select value={userId} onValueChange={(v) => { setUserId(v); onApply({ type: "user", userId: v }); setUserId(""); }}>
        <SelectTrigger className="h-8 w-48"><SelectValue placeholder="Toewijzen aan" /></SelectTrigger>
        <SelectContent>
          {users.map((u) => <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>)}
        </SelectContent>
      </Select>

      <Button variant="outline" size="sm" className="h-8" disabled={busy} onClick={() => onApply({ type: "billable", billable: true })}>
        Factureerbaar
      </Button>
      <Button variant="outline" size="sm" className="h-8" disabled={busy} onClick={() => onApply({ type: "billable", billable: false })}>
        Niet factureerbaar
      </Button>
      <Button variant="destructive" size="sm" className="h-8" disabled={busy} onClick={() => onApply({ type: "delete" })}>
        Verwijderen
      </Button>
    </div>
  );
}
```

- [ ] **Step 3: Bedraad de selectie en de mutatie in `reports-client.tsx`**

```tsx
  const [selected, setSelected] = useState<Record<BulkKind, Set<string>>>({
    time: new Set(), km: new Set(), expense: new Set(),
  });
  const [bulkBusy, setBulkBusy] = useState(false);

  function toggle(kind: BulkKind, id: string) {
    setSelected((prev) => {
      const next = new Set(prev[kind]);
      if (next.has(id)) next.delete(id); else next.add(id);
      return { ...prev, [kind]: next };
    });
  }

  function toggleAll(kind: BulkKind, ids: string[]) {
    setSelected((prev) => {
      const allSelected = ids.length > 0 && ids.every((id) => prev[kind].has(id));
      return { ...prev, [kind]: allSelected ? new Set<string>() : new Set(ids) };
    });
  }

  async function applyBulk(kind: BulkKind, action: BulkAction) {
    const ids = Array.from(selected[kind]);
    if (ids.length === 0) return;
    if (action.type === "delete" && !confirm(`Weet u zeker dat u ${ids.length} registratie(s) wilt verwijderen?`)) return;

    setBulkBusy(true);
    const res = await fetch("/api/entries/bulk", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ kind, ids, action }),
    });
    setBulkBusy(false);

    if (!res.ok) {
      const payload = await res.json().catch(() => ({}));
      alert(payload.error ?? "Bulkactie mislukt");
      return;
    }
    const { count } = await res.json();
    if (count < ids.length) {
      alert(`${count} van de ${ids.length} regels bijgewerkt, gefactureerde regels overgeslagen`);
    }
    setSelected((prev) => ({ ...prev, [kind]: new Set<string>() }));
    await loadReport();
  }
```

De lijst van selecteerbare ids per soort heb je op twee plekken nodig — voor `toggleAll` hier en voor het kop-vakje in de rijtabel. Bereken hem één keer in `reports-client.tsx`:

```ts
  const selectableIds = {
    time: data?.timeEntries.filter((e) => !e.invoiced).map((e) => e.id) ?? [],
    km: data?.kmEntries.filter((e) => !e.invoiced).map((e) => e.id) ?? [],
    expense: data?.expenses.filter((e) => !e.invoiced).map((e) => e.id) ?? [],
  };
```

Geef aan elke rijtabel `selected={selected.time}`, `selectableIds={selectableIds.time}`, `onToggle={(id) => toggle("time", id)}` en `onToggleAll={() => toggleAll("time", selectableIds.time)}` mee (en zo voor km en expense), en render de bulkbalk boven de tabel wanneer er iets geselecteerd is:

```tsx
{canEdit && selected.time.size > 0 && (
  <BulkBar kind="time" count={selected.time.size} projects={projects} users={users} busy={bulkBusy} onApply={(a) => applyBulk("time", a)} />
)}
```

Wis de selectie ook bij een nieuwe `loadReport()`: zet aan het begin van die functie `setSelected({ time: new Set(), km: new Set(), expense: new Set() })`.

- [ ] **Step 4: Handmatige controle**

Run: `npm run dev`. Als admin op `/reports`:

1. Selecteer twee uurregels, zet ze op niet-factureerbaar, en zie de badges verschijnen na het herladen.
2. Selecteer een reeks en verplaats ze naar een ander project.
3. Selecteer een reeks en wijs ze toe aan een andere medewerker; controleer de Medewerker-kolom.
4. Selecteer een reeks en verwijder ze; bevestig dat de bevestigingsvraag het juiste aantal noemt.
5. Klik "alles selecteren" in een tabel waarin een gefactureerde regel staat: die regel heeft geen vakje en blijft na elke actie ongemoeid.

Log in als finance: geen vakjes, geen bulkbalk.

- [ ] **Step 5: Commit**

```bash
git add src/components/reports
git commit -m "feat: bulk actions on selected entries in the reports overview"
```

---

## Verificatie na afloop

- [ ] `npm test` — alle suites groen, inclusief de drie nieuwe.
- [ ] `npm run lint` — schoon.
- [ ] `npm run build` — compileert.
- [ ] De handmatige lijst uit de spec, sectie "Testen": boeken namens een collega voor alle drie de soorten, een regel naar een ander project verplaatsen, een bulkselectie met een gefactureerde regel ertussen, en de rolcontrole als medewerker en als finance.
