# Quarterly Review Reminders Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A quarterly cron that emails admins the list of employees who still need a performance review this quarter.

**Architecture:** A tiny tested helper computes who lacks a current-quarter review; a new CRON_SECRET-guarded cron route queries reviews for the current quarter and emails admins via a new email function. Mirrors the existing `contract-expiry` cron.

**Tech Stack:** Next.js App Router, Prisma, nodemailer/Mailtrap, vitest. **Node 22:** prefix commands with `export NVM_DIR="$HOME/.nvm" && source "$NVM_DIR/nvm.sh" && nvm use 22 &&`.

**Spec:** `docs/superpowers/specs/2026-06-26-review-reminders-design.md`

**Branch:** `feat/review-reminders`, based on `feat/performance-reviews` (uses `currentQuarter` + `PerformanceReview`). PR base = `feat/performance-reviews`.

**Conventions:** CRON routes guard with `process.env.CRON_SECRET` via the `x-vercel-cron-secret` header (see `src/app/api/cron/contract-expiry/route.ts`). Tests are vitest (`npm test`).

---

### Task 1: `usersMissingReview` helper (TDD)

**Files:**
- Modify: `src/lib/reviews.ts` (add the function)
- Modify: `src/lib/reviews.test.ts` (add a case)

- [ ] **Step 1: Add the failing test** — append to `src/lib/reviews.test.ts`:
```ts
import { usersMissingReview } from "./reviews";

describe("usersMissingReview", () => {
  it("returns only users without a review", () => {
    const users = [{ id: "1", name: "A" }, { id: "2", name: "B" }, { id: "3", name: "C" }];
    const result = usersMissingReview(users, new Set(["2"]));
    expect(result.map((u) => u.id)).toEqual(["1", "3"]);
  });
  it("accepts an array of ids too", () => {
    const users = [{ id: "1", name: "A" }, { id: "2", name: "B" }];
    expect(usersMissingReview(users, ["1"]).map((u) => u.id)).toEqual(["2"]);
  });
});
```
(Place the `import { usersMissingReview }` line next to the existing import from `./reviews` — or add a second import line; either is fine.)

- [ ] **Step 2: Run `npm test`, confirm the new case FAILS** (`usersMissingReview` is not exported).
```bash
export NVM_DIR="$HOME/.nvm" && source "$NVM_DIR/nvm.sh" && nvm use 22 && npm test
```

- [ ] **Step 3: Implement** — append to `src/lib/reviews.ts`:
```ts
export function usersMissingReview<T extends { id: string }>(
  users: T[], reviewedUserIds: Set<string> | string[],
): T[] {
  const reviewed = reviewedUserIds instanceof Set ? reviewedUserIds : new Set(reviewedUserIds);
  return users.filter((u) => !reviewed.has(u.id));
}
```

- [ ] **Step 4: Run `npm test`, confirm all pass.**

- [ ] **Step 5: Commit**
```bash
git add src/lib/reviews.ts src/lib/reviews.test.ts
git commit -m "feat: usersMissingReview helper"
```

---

### Task 2: Reminder email + cron + schedule

**Files:**
- Modify: `src/lib/email.ts` (add `sendReviewReminderEmail`)
- Create: `src/app/api/cron/review-reminder/route.ts`
- Modify: `vercel.json` (add the cron entry)

- [ ] **Step 1: Add the email function** — append to `src/lib/email.ts` (reuse module `transport`; match the `from` of `sendHoursReminderEmail`):
```ts
export async function sendReviewReminderEmail(
  admin: { name: string; email: string },
  employees: { name: string }[],
  quarter: string,
  settings: any,
): Promise<void> {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  const from = `"${settings?.name ?? "EVAbits"}" <no-reply@time.evabits.dev>`;
  const list = employees.map((e) => `<li style="margin:2px 0;">${e.name}</li>`).join("");
  const html = `<!DOCTYPE html><html><body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;font-size:14px;color:#111;background:#fff;margin:0;padding:0;">
  <div style="max-width:640px;margin:0 auto;padding:40px 24px;">
    <p style="font-size:20px;font-weight:700;margin:0 0 32px;">${settings?.name ?? ""}</p>
    <p style="margin:0 0 8px;">Beste ${admin.name},</p>
    <p style="margin:0 0 16px;">De volgende medewerkers hebben nog geen beoordeling voor ${quarter}:</p>
    <ul style="margin:0 0 24px;padding-left:20px;">${list}</ul>
    <a href="${appUrl}/personeel" style="display:inline-block;padding:10px 20px;background:#397d3a;color:#fff;border-radius:6px;text-decoration:none;font-weight:500;">Beoordelingen plannen</a>
    <p style="margin-top:40px;color:#888;font-size:12px;">${settings?.name ?? ""} &nbsp;·&nbsp; ${settings?.email ?? ""}</p>
  </div></body></html>`;
  await transport.sendMail({ from, to: admin.email, subject: `Beoordelingen plannen voor ${quarter}`, html });
}
```

- [ ] **Step 2: Create the cron** `src/app/api/cron/review-reminder/route.ts`:
```ts
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { currentQuarter, usersMissingReview } from "@/lib/reviews";
import { sendReviewReminderEmail } from "@/lib/email";

export async function GET(req: Request) {
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && req.headers.get("x-vercel-cron-secret") !== cronSecret) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const quarter = currentQuarter();

  const [users, reviewed] = await Promise.all([
    prisma.user.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }),
    prisma.performanceReview.findMany({ where: { period: quarter }, select: { userId: true } }),
  ]);

  const missing = usersMissingReview(users, new Set(reviewed.map((r) => r.userId)));
  if (missing.length === 0) return NextResponse.json({ reminded: 0, missing: 0 });

  const admins = await prisma.user.findMany({ where: { role: "ADMIN" }, select: { name: true, email: true } });
  const settings = await prisma.companySettings.findFirst();

  let reminded = 0;
  for (const admin of admins) {
    if (!admin.email) continue;
    try {
      await sendReviewReminderEmail(admin, missing, quarter, settings);
      reminded++;
    } catch (e) {
      console.error("review reminder email failed", admin.email, e);
    }
  }
  return NextResponse.json({ reminded, missing: missing.length });
}
```

- [ ] **Step 3: Schedule** — in `vercel.json`, add a third entry to the `crons` array (keep `hours-reminder` and `contract-expiry`):
```json
{
  "path": "/api/cron/review-reminder",
  "schedule": "0 8 1 1,4,7,10 *"
}
```
Keep valid JSON.

- [ ] **Step 4: Typecheck + test**
```bash
export NVM_DIR="$HOME/.nvm" && source "$NVM_DIR/nvm.sh" && nvm use 22 && npx tsc --noEmit && npm test
```
Expected: tsc exit 0; all tests pass.

- [ ] **Step 5: Commit**
```bash
git add src/lib/email.ts src/app/api/cron/review-reminder vercel.json
git commit -m "feat: quarterly review reminder cron + email"
```

---

### Task 3: Final verification

- [ ] **Step 1: Build**
```bash
export NVM_DIR="$HOME/.nvm" && source "$NVM_DIR/nvm.sh" && nvm use 22 && npm run build
```
Expected: succeeds; `/api/cron/review-reminder` appears in the route list.

---

## Self-Review

- **Spec coverage:** §1 helper → Task 1; §2 email → Task 2 Step 1; §3 cron → Task 2 Step 2; §4 schedule → Task 2 Step 3; verification → Task 3. ✅
- **Placeholders:** none — all code is concrete. ✅
- **Type consistency:** `usersMissingReview` (generic over `{id}`) defined in Task 1, used in Task 2 with `{id,name}` users; `currentQuarter` reused from sub-project 3; `sendReviewReminderEmail` signature matches between Task 2 Step 1 and Step 2. ✅
