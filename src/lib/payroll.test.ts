import assert from "node:assert";
import { buildPayrollRows, weeksInMonth, type PayrollUser } from "./payroll";

// weeksInMonth: June 2026 has 30 days -> 30/7
assert.ok(Math.abs(weeksInMonth(2026, 6) - 30 / 7) < 1e-9, "weeksInMonth June 2026");
// February 2024 (leap) has 29 days
assert.ok(Math.abs(weeksInMonth(2024, 2) - 29 / 7) < 1e-9, "weeksInMonth Feb 2024 leap");

const users: PayrollUser[] = [
  { id: "perm", name: "Permanent", contractType: "PERMANENT", contractHours: 40 },
  { id: "zero", name: "Zero", contractType: "ZERO_HOURS", contractHours: null },
  { id: "under", name: "Under", contractType: "FIXED_TERM", contractHours: 40 },
  { id: "none", name: "NoData", contractType: "PERMANENT", contractHours: 40 },
];

const weeks = 4; // fixed for a deterministic test
const worked = new Map([["perm", 200], ["zero", 50], ["under", 100]]);
const wbso = new Map([["perm", 30], ["zero", 10]]);
const km = new Map([["perm", 120.5], ["under", 60]]);

const rows = buildPayrollRows(users, worked, wbso, km, weeks);
const byId = Object.fromEntries(rows.map((r) => [r.userId, r]));

// Permanent: monthly contract = 40*4 = 160; overtime = 200-160 = 40
assert.strictEqual(byId.perm.workedHours, 200);
assert.strictEqual(byId.perm.wbsoHours, 30);
assert.strictEqual(byId.perm.overtime, 40);
assert.strictEqual(byId.perm.km, 120.5);

// Zero-hours: overtime is null regardless of hours worked
assert.strictEqual(byId.zero.workedHours, 50);
assert.strictEqual(byId.zero.wbsoHours, 10);
assert.strictEqual(byId.zero.overtime, null);
assert.strictEqual(byId.zero.km, 0);

// Under contract: 100 worked < 160 -> overtime clamped to 0
assert.strictEqual(byId.under.overtime, 0);

// No aggregated data -> zeros, overtime clamps to 0
assert.strictEqual(byId.none.workedHours, 0);
assert.strictEqual(byId.none.wbsoHours, 0);
assert.strictEqual(byId.none.km, 0);
assert.strictEqual(byId.none.overtime, 0);

console.log("payroll self-check passed");
