import { describe, it, expect } from "vitest";
import {
  monthsToSettle, bucketHoursByMonth, monthTarget, validateOpeningDate,
} from "./overtime";

describe("monthsToSettle", () => {
  it("runs from the opening month up to and including last month", () => {
    // Vandaag is augustus, dus augustus telt niet mee: die maand loopt nog.
    expect(monthsToSettle("2026-05-01", new Date(2026, 7, 20))).toEqual([
      "2026-05", "2026-06", "2026-07",
    ]);
  });

  it("gives nothing when the opening date is in the running month", () => {
    expect(monthsToSettle("2026-08-01", new Date(2026, 7, 20))).toEqual([]);
  });

  it("gives nothing when the opening date is in the future", () => {
    expect(monthsToSettle("2027-01-01", new Date(2026, 7, 20))).toEqual([]);
  });

  it("gives exactly one month when the opening date is last month", () => {
    expect(monthsToSettle("2026-07-01", new Date(2026, 7, 20))).toEqual(["2026-07"]);
  });

  it("crosses the turn of the year", () => {
    expect(monthsToSettle("2025-11-01", new Date(2026, 0, 15))).toEqual(["2025-11", "2025-12"]);
  });
});

describe("bucketHoursByMonth", () => {
  it("adds up the hours per calendar month", () => {
    const entries = [
      { date: "2026-09-01T00:00:00.000Z", hours: 8 },
      { date: "2026-09-30T00:00:00.000Z", hours: 4.5 },
      { date: "2026-10-01T00:00:00.000Z", hours: 8 },
    ];
    expect(bucketHoursByMonth(entries)).toEqual({ "2026-09": 12.5, "2026-10": 8 });
  });

  it("copes with Decimal arriving as a string", () => {
    // Prisma levert Decimal als string aan; optellen zonder Number() plakt ze
    // aan elkaar in plaats van ze op te tellen.
    const entries = [
      { date: "2026-09-01T00:00:00.000Z", hours: "8.00" },
      { date: "2026-09-02T00:00:00.000Z", hours: "0.50" },
    ];
    expect(bucketHoursByMonth(entries)).toEqual({ "2026-09": 8.5 });
  });

  it("gives an empty object for no entries", () => {
    expect(bucketHoursByMonth([])).toEqual({});
  });
});

describe("monthTarget", () => {
  it("multiplies the contract hours by the weeks in that month", () => {
    // Juli heeft 31 dagen: 31 / 7 = 4,4286 weken. 40 × 4,4286 = 177,1.
    expect(monthTarget(40, "2026-07")).toBeCloseTo(177.1, 1);
    // Februari 2026 heeft 28 dagen: precies 4 weken.
    expect(monthTarget(40, "2026-02")).toBeCloseTo(160, 1);
  });

  it("scales with a part-time contract", () => {
    expect(monthTarget(24, "2026-07")).toBeCloseTo(106.3, 1);
  });

  it("gives null without a contract, so the month counts as nothing", () => {
    expect(monthTarget(null, "2026-07")).toBeNull();
  });

  it("gives null for a zero-hours contract", () => {
    // Daar is "target" een leeg begrip; de loonverwerking slaat ze ook over.
    expect(monthTarget(0, "2026-07")).toBeNull();
  });
});

describe("validateOpeningDate", () => {
  it("accepts the first of a month", () => {
    expect(validateOpeningDate("2026-09-01")).toBeNull();
  });

  it("accepts an empty value, which means no balance at all", () => {
    expect(validateOpeningDate(null)).toBeNull();
    expect(validateOpeningDate("")).toBeNull();
    expect(validateOpeningDate(undefined)).toBeNull();
  });

  it("refuses a date halfway through a month, and says why", () => {
    expect(validateOpeningDate("2026-09-15")).toBe(
      "De peildatum moet op de eerste van een maand liggen",
    );
  });
});
