import { describe, it, expect } from "vitest";
import { buildPayrollRows, weeksInMonth, type PayrollUser } from "./payroll";

describe("payroll", () => {
  describe("weeksInMonth", () => {
    it("June 2026 has 30 days -> 30/7", () => {
      expect(weeksInMonth(2026, 6)).toBeCloseTo(30 / 7, 9);
    });
    it("February 2024 (leap) has 29 days -> 29/7", () => {
      expect(weeksInMonth(2024, 2)).toBeCloseTo(29 / 7, 9);
    });
  });

  describe("buildPayrollRows", () => {
    const users: PayrollUser[] = [
      { id: "perm", name: "Permanent", contractType: "PERMANENT", contractHours: 40 },
      { id: "zero", name: "Zero", contractType: "ZERO_HOURS", contractHours: null },
      { id: "under", name: "Under", contractType: "FIXED_TERM", contractHours: 40 },
      { id: "none", name: "NoData", contractType: "PERMANENT", contractHours: 40 },
    ];

    const weeks = 4;
    const worked = new Map([["perm", 200], ["zero", 50], ["under", 100]]);
    const wbso = new Map([["perm", 30], ["zero", 10]]);
    const km = new Map([["perm", 120.5], ["under", 60]]);

    const rows = buildPayrollRows(users, worked, wbso, km, weeks);
    const byId = Object.fromEntries(rows.map((r) => [r.userId, r]));

    it("permanent: workedHours, wbsoHours, overtime, km", () => {
      // monthly contract = 40*4 = 160; overtime = 200-160 = 40
      expect(byId.perm.workedHours).toBe(200);
      expect(byId.perm.wbsoHours).toBe(30);
      expect(byId.perm.overtime).toBe(40);
      expect(byId.perm.km).toBe(120.5);
    });

    it("zero-hours: overtime is null", () => {
      expect(byId.zero.workedHours).toBe(50);
      expect(byId.zero.wbsoHours).toBe(10);
      expect(byId.zero.overtime).toBeNull();
      expect(byId.zero.km).toBe(0);
    });

    it("under contract: overtime clamped to 0", () => {
      // 100 worked < 160 contract
      expect(byId.under.overtime).toBe(0);
    });

    it("no aggregated data: zeros, overtime clamps to 0", () => {
      expect(byId.none.workedHours).toBe(0);
      expect(byId.none.wbsoHours).toBe(0);
      expect(byId.none.km).toBe(0);
      expect(byId.none.overtime).toBe(0);
    });
  });
});
