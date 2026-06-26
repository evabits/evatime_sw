# Performance Reviews Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A quarterly performance-review system: an in-app-editable questionnaire template, employee self-evaluation + admin manager-evaluation with agreements, and an optional salary change that creates a new contract.

**Architecture:** A singleton `ReviewTemplate` holds the questionnaire as data; each `PerformanceReview` snapshots it at creation so old reviews are immutable. Answers are JSON keyed by stable question keys, split into self/manager. Admins manage reviews from `/personeel/[id]`; employees fill self-evals on `/beoordelingen` (+ a dashboard card). Finalizing can create a linked `Contract` via the existing contract helpers.

**Tech Stack:** Next.js App Router, Prisma (Neon, `prisma db push`), Zod, react-hook-form, nodemailer/Mailtrap, vitest. **Node 22:** prefix commands with `export NVM_DIR="$HOME/.nvm" && source "$NVM_DIR/nvm.sh" && nvm use 22 &&`.

**Spec:** `docs/superpowers/specs/2026-06-26-performance-reviews-design.md`

**Branch:** Work on `feat/performance-reviews`, based on `feat/contracts-history` (this builds on the `Contract` model + `src/lib/contracts.ts` + `/personeel/[id]`). PR base = `feat/contracts-history`.

**DB sync is controller-handled:** Implementers run `npx prisma generate` (offline) but NOT `npx prisma db push` (the controller pushes the additive tables to Neon). No destructive ops in this sub-project.

**Repo conventions (must follow):** wrap API handlers in `try { … } catch (e) { return handleError(e); }`; serialize Decimal→Number / Date→string in server pages and API responses; forms send `""` not `null`; no zod `.default()` with `zodResolver` (use `defaultValues`); tests are vitest suites run with `npm test`.

---

### Task 1: Schema — ReviewTemplate + PerformanceReview

**Files:**
- Modify: `prisma/schema.prisma`

- [ ] **Step 1: Add enum, models, relations**

Add the relation fields to existing models. In `model User` (alongside other relations):
```prisma
  reviews           PerformanceReview[] @relation("ReviewSubject")
  reviewsGiven      PerformanceReview[] @relation("ReviewReviewer")
```
In `model Contract` (alongside `attachments`):
```prisma
  reviewResult         PerformanceReview?   @relation("ReviewResult")
```
Append at the end of the file:
```prisma
enum ReviewStatus {
  PLANNED
  SELF_COMPLETED
  COMPLETED
}

model ReviewTemplate {
  id         String   @id @default(cuid())
  definition Json
  updatedAt  DateTime @updatedAt
}

model PerformanceReview {
  id                  String       @id @default(cuid())
  userId              String
  user                User         @relation("ReviewSubject", fields: [userId], references: [id], onDelete: Cascade)
  reviewedBy          String?
  reviewer            User?        @relation("ReviewReviewer", fields: [reviewedBy], references: [id])
  period              String
  plannedDate         DateTime?    @db.Date
  status              ReviewStatus @default(PLANNED)
  formSnapshot        Json
  selfAnswers         Json?
  managerAnswers      Json?
  agreements          Json?
  resultingContractId String?      @unique
  resultingContract   Contract?    @relation("ReviewResult", fields: [resultingContractId], references: [id])
  selfCompletedAt     DateTime?
  completedAt         DateTime?
  plannedEmailSentAt  DateTime?
  createdAt           DateTime     @default(now())
  updatedAt           DateTime     @updatedAt

  @@index([userId])
}
```

- [ ] **Step 2: Generate client + typecheck**
```bash
export NVM_DIR="$HOME/.nvm" && source "$NVM_DIR/nvm.sh" && nvm use 22 && npx prisma generate && npx tsc --noEmit
```
Expected: generate succeeds; tsc exit 0. (`prisma.reviewTemplate` / `prisma.performanceReview` now exist.)

- [ ] **Step 3: Commit**
```bash
git add prisma/schema.prisma
git commit -m "feat: add ReviewTemplate and PerformanceReview models"
```

---

### Task 2: Pure helpers + template seed (TDD)

**Files:**
- Create: `src/lib/reviews.ts`
- Test: `src/lib/reviews.test.ts`

- [ ] **Step 1: Write the failing test** — create `src/lib/reviews.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { currentQuarter, questionKeys, sanitizeAnswers, REVIEW_TEMPLATE_SEED } from "./reviews";

const def = {
  sections: [
    { title: "S", questions: [
      { key: "a", label: "A", respondent: "SELF" as const },
      { key: "b", label: "B", respondent: "MANAGER" as const },
    ] },
  ],
};

describe("currentQuarter", () => {
  it("maps months to quarters", () => {
    expect(currentQuarter(new Date(Date.UTC(2026, 0, 15)))).toBe("2026-Q1");
    expect(currentQuarter(new Date(Date.UTC(2026, 3, 15)))).toBe("2026-Q2");
    expect(currentQuarter(new Date(Date.UTC(2026, 11, 31)))).toBe("2026-Q4");
  });
});

describe("questionKeys", () => {
  it("filters by respondent", () => {
    expect(questionKeys(def, "SELF")).toEqual(["a"]);
    expect(questionKeys(def, "MANAGER")).toEqual(["b"]);
  });
});

describe("sanitizeAnswers", () => {
  it("keeps only allowed string keys for the respondent", () => {
    expect(sanitizeAnswers(def, "SELF", { a: "x", b: "y", z: "q" })).toEqual({ a: "x" });
  });
  it("drops non-string values", () => {
    expect(sanitizeAnswers(def, "SELF", { a: 5 as any })).toEqual({});
  });
});

describe("REVIEW_TEMPLATE_SEED", () => {
  it("has self and manager questions with unique keys", () => {
    const keys = REVIEW_TEMPLATE_SEED.sections.flatMap((s) => s.questions.map((q) => q.key));
    expect(new Set(keys).size).toBe(keys.length);
    expect(questionKeys(REVIEW_TEMPLATE_SEED, "SELF").length).toBeGreaterThan(0);
    expect(questionKeys(REVIEW_TEMPLATE_SEED, "MANAGER").length).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: Run it, confirm FAIL**
```bash
export NVM_DIR="$HOME/.nvm" && source "$NVM_DIR/nvm.sh" && nvm use 22 && npm test
```
Expected: the `reviews` suite fails (cannot import `./reviews`).

- [ ] **Step 3: Implement** — create `src/lib/reviews.ts`:
```ts
export type Respondent = "SELF" | "MANAGER";
export interface ReviewQuestion { key: string; label: string; hint?: string; respondent: Respondent; }
export interface ReviewSection { title: string; questions: ReviewQuestion[]; }
export interface ReviewDefinition { sections: ReviewSection[]; }

export function currentQuarter(date: Date = new Date()): string {
  const q = Math.floor(date.getUTCMonth() / 3) + 1;
  return `${date.getUTCFullYear()}-Q${q}`;
}

export function questionKeys(def: ReviewDefinition, respondent: Respondent): string[] {
  return def.sections.flatMap((s) => s.questions).filter((q) => q.respondent === respondent).map((q) => q.key);
}

export function sanitizeAnswers(
  def: ReviewDefinition, respondent: Respondent, answers: Record<string, unknown> | null | undefined,
): Record<string, string> {
  const allowed = new Set(questionKeys(def, respondent));
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(answers ?? {})) {
    if (allowed.has(k) && typeof v === "string") out[k] = v;
  }
  return out;
}

export const REVIEW_TEMPLATE_SEED: ReviewDefinition = {
  sections: [
    { title: "Zelfbeoordeling medewerker", questions: [
      { key: "satisfied", label: "Waar ben je tevreden over?", hint: "Behaalde resultaten, afgeronde opdrachten, opgeloste problemen of positieve samenwerking.", respondent: "SELF" },
      { key: "learned", label: "Wat ging minder goed en wat heb je daarvan geleerd?", hint: "Werk niet op tijd af, eerder hulp kunnen vragen, andere aanpak kunnen kiezen.", respondent: "SELF" },
      { key: "techDevelopment", label: "Hoe heb je jezelf technisch ontwikkeld?", hint: "Nieuwe kennis, vaardigheden, werkzaamheden of verantwoordelijkheden.", respondent: "SELF" },
      { key: "personalDevelopment", label: "Hoe heb je jezelf persoonlijk ontwikkeld?", hint: "Initiatief, communiceren, samenwerken, feedback ontvangen, verantwoordelijkheid nemen.", respondent: "SELF" },
      { key: "atmosphere", label: "Wat vind je van de werksfeer?", hint: "Plezier in je werk, gezelligheid, sociale veiligheid en activiteiten naast het werk.", respondent: "SELF" },
      { key: "futureDevelopment", label: "Waar wil je je de komende periode verder in ontwikkelen?", respondent: "SELF" },
    ] },
    { title: "Technisch functioneren", questions: [
      { key: "quality", label: "Kwaliteit van het werk", hint: "Controleert eigen werk; fouten tijdig herkend/opgelost; resultaat volledig en bruikbaar; leert van fouten.", respondent: "MANAGER" },
      { key: "execution", label: "Uitvoering en afronding van opdrachten", hint: "Opdrachten zelfstandig opgepakt; voortgang bewaakt; werk afgerond; problemen tijdig gemeld.", respondent: "MANAGER" },
      { key: "knowledge", label: "Technische kennis en probleemoplossing", hint: "Onderzoekt eerst zelf; verzamelt informatie logisch; passende oplossingen; tijdig hulp inschakelen.", respondent: "MANAGER" },
      { key: "techGrowth", label: "Technische ontwikkeling", hint: "Open voor nieuwe werkzaamheden; doet nieuwe kennis op; past feedback toe; deelt kennis.", respondent: "MANAGER" },
    ] },
    { title: "Persoonlijk functioneren", questions: [
      { key: "responsibility", label: "Verantwoordelijkheid en initiatief", hint: "Komt afspraken na; onderneemt actie; benoemt en pakt problemen op; denkt vooruit.", respondent: "MANAGER" },
      { key: "askingHelp", label: "Hulp vragen en omgaan met knelpunten", hint: "Geeft tijdig aan; vraagt gericht om hulp; legt uit wat geprobeerd is; voorkomt stilstand.", respondent: "MANAGER" },
      { key: "communication", label: "Communicatie en samenwerking", hint: "Communiceert duidelijk; informeert collega's tijdig; denkt mee; deelt informatie.", respondent: "MANAGER" },
      { key: "feedbackHandling", label: "Feedback en persoonlijke ontwikkeling", hint: "Open voor feedback; past het toe; reflecteert; neemt verantwoordelijkheid voor ontwikkeling.", respondent: "MANAGER" },
    ] },
    { title: "Samenvatting", questions: [
      { key: "strengths", label: "Sterke punten", hint: "Wat laat de medewerker consequent goed zien?", respondent: "MANAGER" },
      { key: "developmentPoints", label: "Ontwikkelpunten", hint: "Welk gedrag, kennis of werkwijze vraagt verdere ontwikkeling?", respondent: "MANAGER" },
      { key: "conclusion", label: "Algemene conclusie", hint: "Korte beschrijving van het functioneren over de gehele periode.", respondent: "MANAGER" },
    ] },
  ],
};
```

- [ ] **Step 4: Run it, confirm PASS**
```bash
export NVM_DIR="$HOME/.nvm" && source "$NVM_DIR/nvm.sh" && nvm use 22 && npm test
```
Expected: all suites pass.

- [ ] **Step 5: Commit**
```bash
git add src/lib/reviews.ts src/lib/reviews.test.ts
git commit -m "feat: review helpers and template seed"
```

---

### Task 3: Template API (seed-on-read)

**Files:**
- Create: `src/app/api/review-template/route.ts`

- [ ] **Step 1: Write the route**
```ts
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { z } from "zod";
import { handleError } from "@/lib/api";
import { REVIEW_TEMPLATE_SEED } from "@/lib/reviews";

const questionSchema = z.object({
  key: z.string().min(1),
  label: z.string().min(1),
  hint: z.string().optional(),
  respondent: z.enum(["SELF", "MANAGER"]),
});
const definitionSchema = z.object({
  sections: z.array(z.object({ title: z.string().min(1), questions: z.array(questionSchema) })),
});

async function getOrSeed() {
  const existing = await prisma.reviewTemplate.findFirst();
  if (existing) return existing;
  return prisma.reviewTemplate.create({ data: { definition: REVIEW_TEMPLATE_SEED as object } });
}

export async function GET() {
  try {
    const session = await auth();
    if ((session?.user as any)?.role !== "ADMIN")
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    const tpl = await getOrSeed();
    return NextResponse.json({ definition: tpl.definition });
  } catch (e) { return handleError(e); }
}

export async function PUT(req: Request) {
  try {
    const session = await auth();
    if ((session?.user as any)?.role !== "ADMIN")
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    const definition = definitionSchema.parse(await req.json());
    const existing = await prisma.reviewTemplate.findFirst();
    const tpl = existing
      ? await prisma.reviewTemplate.update({ where: { id: existing.id }, data: { definition } })
      : await prisma.reviewTemplate.create({ data: { definition } });
    return NextResponse.json({ definition: tpl.definition });
  } catch (e) { return handleError(e); }
}
```

- [ ] **Step 2: Typecheck**
```bash
export NVM_DIR="$HOME/.nvm" && source "$NVM_DIR/nvm.sh" && nvm use 22 && npx tsc --noEmit
```
Expected: exit 0.

- [ ] **Step 3: Commit**
```bash
git add src/app/api/review-template
git commit -m "feat: review template API with seed-on-read"
```

---

### Task 4: Reviews API — create/list/get + planned email

**Files:**
- Modify: `src/lib/email.ts` (add `sendReviewPlannedEmail`)
- Create: `src/app/api/reviews/route.ts` (POST create, GET list)
- Create: `src/app/api/reviews/mine/route.ts` (GET own)
- Create: `src/app/api/reviews/[id]/route.ts` (GET detail; PUT/DELETE added in Task 5)

- [ ] **Step 1: Add the email function** to `src/lib/email.ts` (append; reuse the module `transport`, match the `from` used by `sendHoursReminderEmail`):
```ts
export async function sendReviewPlannedEmail(
  employee: { name: string; email: string },
  review: { period: string; plannedDate: string | null },
  settings: any,
): Promise<void> {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  const from = `"${settings?.name ?? "EVAbits"}" <no-reply@time.evabits.dev>`;
  const when = review.plannedDate ? new Date(review.plannedDate).toLocaleDateString("nl-NL") : "nader te bepalen";
  const html = `<!DOCTYPE html><html><body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;font-size:14px;color:#111;background:#fff;margin:0;padding:0;">
  <div style="max-width:640px;margin:0 auto;padding:40px 24px;">
    <p style="font-size:20px;font-weight:700;margin:0 0 32px;">${settings?.name ?? ""}</p>
    <p style="margin:0 0 8px;">Hallo ${employee.name},</p>
    <p style="margin:0 0 16px;">Er is een beoordelingsgesprek voor je gepland (${review.period}, datum: <strong>${when}</strong>).</p>
    <p style="margin:0 0 24px;">Vul alvast je zelfbeoordeling in zodat we het gesprek goed kunnen voorbereiden.</p>
    <a href="${appUrl}/beoordelingen" style="display:inline-block;padding:10px 20px;background:#397d3a;color:#fff;border-radius:6px;text-decoration:none;font-weight:500;">Mijn beoordelingen</a>
    <p style="margin-top:40px;color:#888;font-size:12px;">${settings?.name ?? ""} &nbsp;·&nbsp; ${settings?.email ?? ""}</p>
  </div></body></html>`;
  await transport.sendMail({ from, to: employee.email, subject: `Beoordelingsgesprek gepland (${review.period})`, html });
}
```

- [ ] **Step 2: Create `src/app/api/reviews/route.ts`** (POST + GET list; exports the shared select/serializer used by later files):
```ts
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { z } from "zod";
import { handleError } from "@/lib/api";
import { currentQuarter, REVIEW_TEMPLATE_SEED } from "@/lib/reviews";
import { sendReviewPlannedEmail } from "@/lib/email";

export const reviewSelect = {
  id: true, userId: true, reviewedBy: true, period: true, plannedDate: true, status: true,
  formSnapshot: true, selfAnswers: true, managerAnswers: true, agreements: true,
  resultingContractId: true, selfCompletedAt: true, completedAt: true, plannedEmailSentAt: true,
  createdAt: true,
  user: { select: { id: true, name: true, email: true } },
  reviewer: { select: { id: true, name: true } },
} as const;

export function serializeReview(r: any) {
  const dDate = (v: Date | null) => (v ? v.toISOString().slice(0, 10) : null);
  const dTime = (v: Date | null) => (v ? v.toISOString() : null);
  return {
    ...r,
    plannedDate: dDate(r.plannedDate),
    selfCompletedAt: dTime(r.selfCompletedAt),
    completedAt: dTime(r.completedAt),
    plannedEmailSentAt: dTime(r.plannedEmailSentAt),
    createdAt: r.createdAt.toISOString(),
  };
}

const createSchema = z.object({
  userId: z.string().min(1),
  period: z.string().optional().or(z.literal("")),
  plannedDate: z.string().optional().or(z.literal("")),
});

export async function GET(req: Request) {
  try {
    const session = await auth();
    if ((session?.user as any)?.role !== "ADMIN")
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    const { searchParams } = new URL(req.url);
    const userId = searchParams.get("userId") ?? undefined;
    const reviews = await prisma.performanceReview.findMany({
      where: userId ? { userId } : undefined,
      orderBy: { createdAt: "desc" },
      select: reviewSelect,
    });
    return NextResponse.json(reviews.map(serializeReview));
  } catch (e) { return handleError(e); }
}

export async function POST(req: Request) {
  try {
    const session = await auth();
    if ((session?.user as any)?.role !== "ADMIN")
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    const adminId = (session!.user as any).id as string;
    const { userId, period, plannedDate } = createSchema.parse(await req.json());

    const tpl = await prisma.reviewTemplate.findFirst();
    const definition = (tpl?.definition ?? REVIEW_TEMPLATE_SEED) as object;

    const review = await prisma.performanceReview.create({
      data: {
        userId,
        reviewedBy: adminId,
        period: period || currentQuarter(),
        plannedDate: plannedDate ? new Date(plannedDate) : null,
        formSnapshot: definition,
      },
      select: reviewSelect,
    });

    // notify the employee
    const employee = review.user;
    const settings = await prisma.companySettings.findFirst();
    if (employee.email) {
      try {
        await sendReviewPlannedEmail(
          { name: employee.name, email: employee.email },
          { period: review.period, plannedDate: review.plannedDate ? review.plannedDate.toISOString().slice(0, 10) : null },
          settings,
        );
        await prisma.performanceReview.update({ where: { id: review.id }, data: { plannedEmailSentAt: new Date() } });
      } catch (e) {
        console.error("review planned email failed", review.id, e);
      }
    }

    const fresh = await prisma.performanceReview.findUnique({ where: { id: review.id }, select: reviewSelect });
    return NextResponse.json(serializeReview(fresh), { status: 201 });
  } catch (e) { return handleError(e); }
}
```

- [ ] **Step 3: Create `src/app/api/reviews/mine/route.ts`**:
```ts
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { handleError } from "@/lib/api";
import { reviewSelect, serializeReview } from "../route";

export async function GET() {
  try {
    const session = await auth();
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const userId = (session.user as any).id as string;
    const reviews = await prisma.performanceReview.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      select: reviewSelect,
    });
    return NextResponse.json(reviews.map(serializeReview));
  } catch (e) { return handleError(e); }
}
```

- [ ] **Step 4: Create `src/app/api/reviews/[id]/route.ts` with GET only** (PUT/DELETE come in Task 5):
```ts
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { handleError } from "@/lib/api";
import { reviewSelect, serializeReview } from "../route";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await auth();
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const { id } = await params;
    const review = await prisma.performanceReview.findUnique({ where: { id }, select: reviewSelect });
    if (!review) return NextResponse.json({ error: "Not found" }, { status: 404 });
    const me = session.user as any;
    if (me.role !== "ADMIN" && review.userId !== me.id)
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    return NextResponse.json(serializeReview(review));
  } catch (e) { return handleError(e); }
}
```

- [ ] **Step 5: Typecheck**
```bash
export NVM_DIR="$HOME/.nvm" && source "$NVM_DIR/nvm.sh" && nvm use 22 && npx tsc --noEmit
```
Expected: exit 0.

- [ ] **Step 6: Commit**
```bash
git add src/lib/email.ts src/app/api/reviews
git commit -m "feat: reviews create/list/get API + planned email"
```

---

### Task 5: Reviews API — gated update, finalize, salary outcome, delete

**Files:**
- Modify: `src/app/api/reviews/[id]/route.ts` (add PUT + DELETE)

- [ ] **Step 1: Add PUT and DELETE** to `src/app/api/reviews/[id]/route.ts`. Add these imports at the top:
```ts
import { z } from "zod";
import { sanitizeAnswers, type ReviewDefinition } from "@/lib/reviews";
import { getEffectiveContract, fillSalary } from "@/lib/contracts";
import { contractSelect, serializeContract } from "@/app/api/contracts/route";
```
Then append:
```ts
const agreementSchema = z.object({ action: z.string(), result: z.string() });
const putSchema = z.object({
  // employee
  selfAnswers: z.record(z.string(), z.string()).optional(),
  submit: z.boolean().optional(),
  // admin
  managerAnswers: z.record(z.string(), z.string()).optional(),
  agreements: z.array(agreementSchema).max(3).optional(),
  period: z.string().optional(),
  plannedDate: z.string().optional().or(z.literal("")),
  finalize: z.boolean().optional(),
  salaryMonthly: z.coerce.number().positive().optional().nullable(),
  effectiveDate: z.string().optional().or(z.literal("")),
});

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await auth();
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const { id } = await params;
    const me = session.user as any;
    const body = putSchema.parse(await req.json());

    const review = await prisma.performanceReview.findUnique({
      where: { id },
      select: { id: true, userId: true, status: true, formSnapshot: true },
    });
    if (!review) return NextResponse.json({ error: "Not found" }, { status: 404 });
    const def = review.formSnapshot as unknown as ReviewDefinition;
    const isAdmin = me.role === "ADMIN";
    const isSubject = review.userId === me.id;

    const data: any = {};

    if (isSubject && !isAdmin) {
      // employee may only edit their self answers, and only before completion
      if (review.status === "COMPLETED")
        return NextResponse.json({ error: "Beoordeling is afgerond" }, { status: 403 });
      if (body.selfAnswers !== undefined) data.selfAnswers = sanitizeAnswers(def, "SELF", body.selfAnswers);
      if (body.submit && review.status === "PLANNED") {
        data.status = "SELF_COMPLETED";
        data.selfCompletedAt = new Date();
      }
    } else if (isAdmin) {
      if (body.managerAnswers !== undefined) data.managerAnswers = sanitizeAnswers(def, "MANAGER", body.managerAnswers);
      if (body.agreements !== undefined) data.agreements = body.agreements;
      if (body.period !== undefined && body.period !== "") data.period = body.period;
      if (body.plannedDate !== undefined) data.plannedDate = body.plannedDate ? new Date(body.plannedDate) : null;

      if (body.finalize) {
        data.status = "COMPLETED";
        data.completedAt = new Date();
        // optional salary outcome -> new contract
        if (body.salaryMonthly != null && body.effectiveDate) {
          const contracts = await prisma.contract.findMany({ where: { userId: review.userId }, select: contractSelect });
          const current = getEffectiveContract(contracts.map(serializeContract), body.effectiveDate);
          const { salaryMonthly, salaryHourly } = fillSalary({
            salaryMonthly: body.salaryMonthly,
            salaryHourly: null,
            contractHours: current?.contractHours ?? null,
          });
          const newContract = await prisma.contract.create({
            data: {
              userId: review.userId,
              contractType: (current?.contractType ?? "PERMANENT") as any,
              contractHours: current?.contractHours ?? null,
              jobTitle: current?.jobTitle ?? null,
              ftePercentage: current?.ftePercentage ?? null,
              startDate: new Date(body.effectiveDate),
              endDate: null,
              salaryMonthly,
              salaryHourly,
              notes: `Salarisaanpassing n.a.v. beoordeling`,
            },
            select: { id: true },
          });
          data.resultingContractId = newContract.id;
        }
      }
    } else {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const updated = await prisma.performanceReview.update({ where: { id }, data, select: reviewSelect });
    return NextResponse.json(serializeReview(updated));
  } catch (e) { return handleError(e); }
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await auth();
    if ((session?.user as any)?.role !== "ADMIN")
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    const { id } = await params;
    await prisma.performanceReview.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (e) { return handleError(e); }
}
```

- [ ] **Step 2: Typecheck**
```bash
export NVM_DIR="$HOME/.nvm" && source "$NVM_DIR/nvm.sh" && nvm use 22 && npx tsc --noEmit
```
Expected: exit 0.

- [ ] **Step 3: Commit**
```bash
git add "src/app/api/reviews/[id]/route.ts"
git commit -m "feat: review update/finalize with salary-outcome contract + delete"
```

---

### Task 6: Template editor page + sidebar entry

**Files:**
- Create: `src/app/(app)/settings/beoordelingen/page.tsx` (server, ADMIN)
- Create: `src/components/reviews/template-editor-client.tsx` (client)
- Modify: `src/components/layout/sidebar.tsx` (add item under Instellingen)

- [ ] **Step 1: Server page** `src/app/(app)/settings/beoordelingen/page.tsx`:
```tsx
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";
import { REVIEW_TEMPLATE_SEED } from "@/lib/reviews";
import { TemplateEditorClient } from "@/components/reviews/template-editor-client";

export default async function ReviewTemplatePage() {
  const session = await auth();
  if ((session?.user as any)?.role !== "ADMIN") redirect("/");
  const tpl = await prisma.reviewTemplate.findFirst();
  const definition = (tpl?.definition ?? REVIEW_TEMPLATE_SEED) as any;
  return <TemplateEditorClient initialDefinition={definition} />;
}
```

- [ ] **Step 2: Editor client** `src/components/reviews/template-editor-client.tsx` — `"use client"`. A structural editor (no zod form needed; manage local state). Props:
```ts
import type { ReviewDefinition } from "@/lib/reviews";
export function TemplateEditorClient({ initialDefinition }: { initialDefinition: ReviewDefinition }) { ... }
```
Requirements (mirror the styling of `src/components/settings/settings-client.tsx` — read it first):
- Local `useState<ReviewDefinition>(initialDefinition)`.
- Render each section as a Card: editable `title` (Input); a list of questions each with: `label` (Input), `hint` (Input, optional), `respondent` (Select SELF/MANAGER), `key` (Input — small, monospace), and a remove (Trash2) button. Buttons to "Vraag toevoegen" (push `{ key: "", label: "", respondent: "MANAGER" }`) and to move a question up/down (optional). A "Sectie toevoegen" button and per-section remove.
- A "Opslaan" button → `PUT /api/review-template` with `{ sections }`; show a saved/error message. Before saving, validate every question has a non-empty `key` and `label` and keys are unique (show an inline error and block save if not — this is the one client-side guard that matters).
- Page header "Beoordelingssjabloon" + short description that editing does not change already-created reviews (they keep their snapshot).

- [ ] **Step 3: Sidebar entry** — in `src/components/layout/sidebar.tsx`, add to the **Instellingen** group's `items` (ADMIN-only), using an existing imported icon (e.g. `ClipboardList`):
```tsx
      { href: "/settings/beoordelingen", label: "Beoordelingssjabloon", icon: ClipboardList, roles: ["ADMIN"] },
```
Confirm `ClipboardList` is imported (it is — used by Offertes).

- [ ] **Step 4: Typecheck**
```bash
export NVM_DIR="$HOME/.nvm" && source "$NVM_DIR/nvm.sh" && nvm use 22 && npx tsc --noEmit
```
Expected: exit 0.

- [ ] **Step 5: Commit**
```bash
git add "src/app/(app)/settings/beoordelingen" src/components/reviews/template-editor-client.tsx src/components/layout/sidebar.tsx
git commit -m "feat: review template editor"
```

---

### Task 7: Employee page "Mijn beoordelingen" + sidebar entry

**Files:**
- Create: `src/app/(app)/beoordelingen/page.tsx` (server, all roles)
- Create: `src/components/reviews/my-reviews-client.tsx` (client)
- Modify: `src/components/layout/sidebar.tsx` (add top-group item, all roles)

- [ ] **Step 1: Server page** `src/app/(app)/beoordelingen/page.tsx`:
```tsx
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { reviewSelect, serializeReview } from "@/app/api/reviews/route";
import { MyReviewsClient } from "@/components/reviews/my-reviews-client";

export default async function MyReviewsPage() {
  const session = await auth();
  const userId = (session?.user as any)?.id ?? "";
  const reviews = await prisma.performanceReview.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    select: reviewSelect,
  });
  return <MyReviewsClient initialReviews={reviews.map(serializeReview)} />;
}
```

- [ ] **Step 2: Client** `src/components/reviews/my-reviews-client.tsx` — `"use client"`. Props: `{ initialReviews: SerializedReview[] }` (define a local `Review` type matching `serializeReview` output: `id, period, status, plannedDate, formSnapshot, selfAnswers, managerAnswers, agreements, completedAt`, etc.). Requirements:
- List reviews with period, status badge (PLANNED "Te doen" / SELF_COMPLETED "Zelfbeoordeling ingediend" / COMPLETED "Afgerond"), planned date.
- For a review that is PLANNED or SELF_COMPLETED: a self-eval form rendering ONLY the SELF questions from `formSnapshot` (filter `q.respondent === "SELF"`), one Textarea per question (prefilled from `selfAnswers[key]`), with its `hint` shown as helper text. Buttons "Opslaan" (PUT `{ selfAnswers }`) and "Indienen" (PUT `{ selfAnswers, submit: true }`). After success, `router.refresh()`. Disable editing once COMPLETED.
- For a COMPLETED review: read-only view showing the MANAGER answers, the agreements (action → result), and, if `resultingContractId` is set, a note "Salaris aangepast n.a.v. deze beoordeling". (The employee already has access to their own data.)
- Build the answer object from form state keyed by question key. Send `""` for blank answers (do not omit — let the API sanitize).
- Mirror `contracts-client.tsx` for fetch/`useRouter`/error handling patterns.

- [ ] **Step 3: Sidebar entry** — in `src/components/layout/sidebar.tsx`, add to the FIRST group (the one with Dashboard, no `roles`, all users) OR the Registratie group, an item:
```tsx
      { href: "/beoordelingen", label: "Mijn beoordelingen", icon: ClipboardCheck },
```
Add `ClipboardCheck` to the `lucide-react` import at the top of the file if not present.

- [ ] **Step 4: Typecheck**
```bash
export NVM_DIR="$HOME/.nvm" && source "$NVM_DIR/nvm.sh" && nvm use 22 && npx tsc --noEmit
```
Expected: exit 0.

- [ ] **Step 5: Commit**
```bash
git add "src/app/(app)/beoordelingen" src/components/reviews/my-reviews-client.tsx src/components/layout/sidebar.tsx
git commit -m "feat: employee Mijn beoordelingen page"
```

---

### Task 8: Admin review management on /personeel/[id]

**Files:**
- Modify: `src/app/(app)/personeel/[id]/page.tsx` (also load reviews + render admin reviews client)
- Create: `src/components/personeel/reviews-admin-client.tsx` (client)

- [ ] **Step 1: Extend the employee detail server page** — in `src/app/(app)/personeel/[id]/page.tsx`, also fetch the employee's reviews and pass them down. Add the import:
```ts
import { reviewSelect, serializeReview } from "@/app/api/reviews/route";
import { ReviewsAdminClient } from "@/components/personeel/reviews-admin-client";
```
Extend the `prisma.user.findUnique` select to also include:
```ts
      reviews: { orderBy: { createdAt: "desc" }, select: reviewSelect },
```
And render the reviews client beneath the existing `<ContractsClient .../>`:
```tsx
      <ReviewsAdminClient userId={user.id} initialReviews={user.reviews.map(serializeReview)} />
```
(Keep the existing ContractsClient render; wrap both in a fragment or the existing container.)

- [ ] **Step 2: Admin reviews client** `src/components/personeel/reviews-admin-client.tsx` — `"use client"`. Props: `{ userId: string; initialReviews: Review[] }`. Requirements (mirror `contracts-client.tsx`):
- Section header "Beoordelingen" + a "Nieuwe beoordeling plannen" button opening a small dialog with `period` (text, placeholder e.g. "2026-Q3") and `plannedDate` (`<input type=date>`). Submit → `POST /api/reviews` with `{ userId, period, plannedDate }` → `router.refresh()`. (Leaving period blank lets the API default to the current quarter.)
- A table/list of the employee's reviews: period, status badge, planned date, reviewer. Each opens an editor.
- Review editor (dialog or expandable): renders the MANAGER questions from `formSnapshot` (filter `respondent === "MANAGER"`) as Textareas (prefilled from `managerAnswers`), plus an agreements block: up to 3 rows of `action` + `result` inputs (add/remove). Buttons:
  - "Opslaan" → PUT `{ managerAnswers, agreements }` (draft).
  - "Afronden" → opens/reveals optional salary-outcome fields (`salaryMonthly` number, `effectiveDate` date) then PUT `{ managerAnswers, agreements, finalize: true, salaryMonthly, effectiveDate }`. Confirm() before finalizing. After success `router.refresh()`.
  - Also show the employee's submitted SELF answers read-only above the manager form (from `selfAnswers` + the SELF questions of the snapshot), so the admin sees the self-eval during the gesprek.
- Delete button per review → confirm() → DELETE `/api/reviews/${id}` → `router.refresh()`.
- Send `""` for blank fields; keep numbers optional.

- [ ] **Step 3: Typecheck**
```bash
export NVM_DIR="$HOME/.nvm" && source "$NVM_DIR/nvm.sh" && nvm use 22 && npx tsc --noEmit
```
Expected: exit 0.

- [ ] **Step 4: Commit**
```bash
git add "src/app/(app)/personeel/[id]/page.tsx" src/components/personeel/reviews-admin-client.tsx
git commit -m "feat: admin review management on employee page"
```

---

### Task 9: Dashboard card for pending self-eval

**Files:**
- Modify: `src/app/(app)/page.tsx` (query the user's pending review, render a card)

- [ ] **Step 1: Query + render** — in `src/app/(app)/page.tsx`, after the existing data fetches, add a query for the current user's pending self-eval and render a card near the top of the dashboard JSX:
```ts
  const pendingReview = userId
    ? await prisma.performanceReview.findFirst({
        where: { userId, status: { in: ["PLANNED", "SELF_COMPLETED"] } },
        orderBy: { createdAt: "desc" },
        select: { id: true, period: true, status: true },
      })
    : null;
```
Then in the JSX (top of the returned content), conditionally render:
```tsx
{pendingReview && pendingReview.status === "PLANNED" && (
  <Link href="/beoordelingen" className="block">
    <Card className="border-primary/40 bg-primary/5">
      <CardContent className="p-4 flex items-center gap-3">
        <ClipboardCheck className="h-5 w-5 text-primary" />
        <div>
          <p className="font-medium">Zelfbeoordeling openstaand ({pendingReview.period})</p>
          <p className="text-sm text-muted-foreground">Vul je zelfbeoordeling in vóór het gesprek.</p>
        </div>
      </CardContent>
    </Card>
  </Link>
)}
```
Add `ClipboardCheck` to the existing `lucide-react` import in this file. `Link` and `Card`/`CardContent` are already imported.

- [ ] **Step 2: Typecheck**
```bash
export NVM_DIR="$HOME/.nvm" && source "$NVM_DIR/nvm.sh" && nvm use 22 && npx tsc --noEmit
```
Expected: exit 0.

- [ ] **Step 3: Commit**
```bash
git add "src/app/(app)/page.tsx"
git commit -m "feat: dashboard card for pending self-evaluation"
```

---

### Task 10: Final verification

- [ ] **Step 1: Full test + typecheck + build**
```bash
export NVM_DIR="$HOME/.nvm" && source "$NVM_DIR/nvm.sh" && nvm use 22 && npm test && npx tsc --noEmit && npm run build
```
Expected: vitest green (incl. `reviews` suite), tsc exit 0, build succeeds (routes `/beoordelingen`, `/settings/beoordelingen`, `/api/reviews*`, `/api/review-template` listed).

- [ ] **Step 2: Commit any build-driven fixes** (only if needed)
```bash
git add -A && git commit -m "fix: build issues in performance reviews" || echo "nothing to commit"
```

---

## Self-Review

**Spec coverage:**
- §1 data model → Task 1. Template seed → Task 2 (`REVIEW_TEMPLATE_SEED`). ✅
- §2 helpers (currentQuarter/questionKeys/sanitizeAnswers, tested) → Task 2. ✅
- §3 API: template GET/PUT → Task 3; POST/GET list/mine/detail + email → Task 4; PUT gated update/finalize/salary + DELETE → Task 5. ✅
- §4 UI: template editor → Task 6; employee page + sidebar → Task 7; admin section on /personeel/[id] → Task 8; dashboard card → Task 9; sidebar entries → Tasks 6/7. ✅
- §5 out of scope respected (no auto-schedule/recurring reminders, no PDF, no acknowledgement, no scores). ✅
- Verification → Task 10. ✅

**Placeholder scan:** Logic-heavy code (helpers, all API routes, email) is given in full. The four React clients (Tasks 6–8) are specified by exact props, API calls, snapshot-filtering rules, and a "mirror contracts-client/settings-client" instruction rather than full JSX — consistent with the established big-client-component pattern. No "TBD"/"add validation"-style gaps.

**Type consistency:** `reviewSelect`/`serializeReview` defined once in `src/app/api/reviews/route.ts` (Task 4), imported by Tasks 4/5/7/8. `ReviewDefinition`/`Respondent`/`questionKeys`/`sanitizeAnswers`/`currentQuarter`/`REVIEW_TEMPLATE_SEED` defined in Task 2, used in Tasks 3/4/5/6/7. Contract helpers (`getEffectiveContract`, `fillSalary`, `contractSelect`, `serializeContract`) reused unchanged in Task 5. Status strings `PLANNED`/`SELF_COMPLETED`/`COMPLETED` consistent across schema, API, and UI. ✅
