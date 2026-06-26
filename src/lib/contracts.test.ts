import { describe, it, expect } from "vitest";
import { getEffectiveContract, fillSalary, rangeOverlaps, WEEKS_PER_MONTH } from "./contracts";

const a = { id: "a", startDate: "2024-01-01", endDate: "2024-12-31" };
const b = { id: "b", startDate: "2025-01-01", endDate: null };

describe("contracts", () => {
  describe("getEffectiveContract", () => {
    it("empty -> null", () => {
      expect(getEffectiveContract([], "2025-06-01")).toBeNull();
    });
    it("covers a", () => {
      expect(getEffectiveContract([a, b], "2024-06-01")?.id).toBe("a");
    });
    it("covers b", () => {
      expect(getEffectiveContract([a, b], "2025-06-01")?.id).toBe("b");
    });
    it("before any -> null", () => {
      expect(getEffectiveContract([a, b], "2023-06-01")).toBeNull();
    });
    it("gap -> null", () => {
      const c = { id: "c", startDate: "2025-06-01", endDate: null };
      expect(getEffectiveContract([a, c], "2025-03-01")).toBeNull();
    });
    it("null start = from beginning", () => {
      const open = { id: "o", startDate: null, endDate: null };
      expect(getEffectiveContract([open], "1999-01-01")?.id).toBe("o");
    });
    it("latest start wins", () => {
      const open = { id: "o", startDate: null, endDate: null };
      expect(getEffectiveContract([open, b], "2025-06-01")?.id).toBe("b");
    });
  });

  describe("fillSalary", () => {
    it("hourly from monthly", () => {
      const fromMonthly = fillSalary({ salaryMonthly: 4000, salaryHourly: null, contractHours: 40 });
      expect(fromMonthly.salaryHourly).toBeCloseTo(4000 / (40 * WEEKS_PER_MONTH), 2);
      expect(fromMonthly.salaryMonthly).toBe(4000);
    });
    it("monthly from hourly", () => {
      const fromHourly = fillSalary({ salaryMonthly: null, salaryHourly: 25, contractHours: 40 });
      expect(fromHourly.salaryMonthly).toBeCloseTo(25 * 40 * WEEKS_PER_MONTH, 2);
    });
    it("both kept (manual override)", () => {
      expect(fillSalary({ salaryMonthly: 4000, salaryHourly: 30, contractHours: 40 })).toEqual({
        salaryMonthly: 4000,
        salaryHourly: 30,
      });
    });
    it("no derive without hours", () => {
      expect(
        fillSalary({ salaryMonthly: 4000, salaryHourly: null, contractHours: null }).salaryHourly,
      ).toBeNull();
    });
  });

  describe("rangeOverlaps", () => {
    it("open ranges overlap", () => {
      expect(rangeOverlaps("2024-01-01", null, "2025-06-01", null)).toBe(true);
    });
    it("adjacent no overlap", () => {
      expect(rangeOverlaps("2024-01-01", "2024-12-31", "2025-01-01", null)).toBe(false);
    });
  });
});
