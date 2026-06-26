import assert from "node:assert";
import { getEffectiveContract, fillSalary, rangeOverlaps, WEEKS_PER_MONTH } from "./contracts";

const a = { id: "a", startDate: "2024-01-01", endDate: "2024-12-31" };
const b = { id: "b", startDate: "2025-01-01", endDate: null };

assert.strictEqual(getEffectiveContract([], "2025-06-01"), null, "empty -> null");
assert.strictEqual(getEffectiveContract([a, b], "2024-06-01")?.id, "a", "covers a");
assert.strictEqual(getEffectiveContract([a, b], "2025-06-01")?.id, "b", "covers b");
assert.strictEqual(getEffectiveContract([a, b], "2023-06-01"), null, "before any -> null");
const c = { id: "c", startDate: "2025-06-01", endDate: null };
assert.strictEqual(getEffectiveContract([a, c], "2025-03-01"), null, "gap -> null");
const open = { id: "o", startDate: null, endDate: null };
assert.strictEqual(getEffectiveContract([open], "1999-01-01")?.id, "o", "null start = from beginning");
assert.strictEqual(getEffectiveContract([open, b], "2025-06-01")?.id, "b", "latest start wins");

const fromMonthly = fillSalary({ salaryMonthly: 4000, salaryHourly: null, contractHours: 40 });
assert.ok(Math.abs(fromMonthly.salaryHourly! - 4000 / (40 * WEEKS_PER_MONTH)) < 0.01, "hourly from monthly");
assert.strictEqual(fromMonthly.salaryMonthly, 4000, "monthly kept");
const fromHourly = fillSalary({ salaryMonthly: null, salaryHourly: 25, contractHours: 40 });
assert.ok(Math.abs(fromHourly.salaryMonthly! - 25 * 40 * WEEKS_PER_MONTH) < 0.01, "monthly from hourly");
assert.deepStrictEqual(
  fillSalary({ salaryMonthly: 4000, salaryHourly: 30, contractHours: 40 }),
  { salaryMonthly: 4000, salaryHourly: 30 },
  "both kept (manual override)",
);
assert.strictEqual(
  fillSalary({ salaryMonthly: 4000, salaryHourly: null, contractHours: null }).salaryHourly,
  null,
  "no derive without hours",
);

assert.strictEqual(rangeOverlaps("2024-01-01", null, "2025-06-01", null), true, "open ranges overlap");
assert.strictEqual(rangeOverlaps("2024-01-01", "2024-12-31", "2025-01-01", null), false, "adjacent no overlap");

console.log("contracts self-check passed");
