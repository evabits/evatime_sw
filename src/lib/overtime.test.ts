import { describe, it, expect } from "vitest";
import {
  monthsToSettle, bucketHoursByMonth, monthTarget, validateOpeningDate, overtimeLedger,
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

const mutatie = (id: string, date: string, hours: number, reason: string) => ({ id, date, hours, reason });

describe("overtimeLedger", () => {
  const basis = {
    openingDate: "2026-09-01",
    openingHours: 12,
    months: ["2026-09", "2026-10"],
    hoursByMonth: { "2026-09": 180.4, "2026-10": 174.9 },
    contractHoursByMonth: { "2026-09": 40, "2026-10": 40 },
    adjustments: [],
    vandaag: new Date(2026, 10, 20), // 20-NOV-2026
    lopendeUren: 0,
    lopendContract: 40,
  };

  it("starts with the opening balance", () => {
    const { lines } = overtimeLedger(basis);
    expect(lines[0]).toEqual({ kind: "opening", date: "2026-09-01", hours: 12 });
  });

  it("gives a line per month with booked hours, target and the difference", () => {
    const { lines } = overtimeLedger(basis);
    const sept = lines.find((l) => l.kind === "month" && l.key === "2026-09");
    expect(sept).toMatchObject({ kind: "month", key: "2026-09", geboekt: 180.4 });
    // September heeft 30 dagen: 30/7 = 4,286 weken × 40 = 171,4.
    expect((sept as { target: number }).target).toBeCloseTo(171.4, 1);
    expect((sept as { hours: number }).hours).toBeCloseTo(9, 1);
  });

  it("adds opening, months and adjustments into one balance", () => {
    const met = { ...basis, adjustments: [mutatie("a1", "2026-10-15", -10, "uitbetaald bij salaris")] };
    const { saldo } = overtimeLedger(met);
    // 12 + (180,4 − 171,4) + (174,9 − 177,1) + (−10) = 8,8
    expect(saldo).toBeCloseTo(8.8, 1);
  });

  it("puts an adjustment after the month it falls in", () => {
    const met = { ...basis, adjustments: [mutatie("a1", "2026-10-15", -10, "uitbetaald")] };
    const soorten = overtimeLedger(met).lines.map((l) => `${l.kind}:${"key" in l ? l.key : "date" in l ? l.date : ""}`);
    expect(soorten).toEqual([
      "opening:2026-09-01",
      "month:2026-09",
      "month:2026-10",
      "adjustment:2026-10-15",
    ]);
  });

  it("counts a month without a contract as nothing, not as a shortfall", () => {
    const zonder = {
      ...basis,
      contractHoursByMonth: { "2026-09": 40, "2026-10": null },
      hoursByMonth: { "2026-09": 171.4, "2026-10": 0 },
    };
    const { lines, saldo } = overtimeLedger(zonder);
    const okt = lines.find((l) => l.kind === "month" && l.key === "2026-10") as { target: number | null; hours: number };
    expect(okt.target).toBeNull();
    expect(okt.hours).toBe(0);
    expect(saldo).toBeCloseTo(12, 1);
  });

  it("reports the running month separately, outside the balance", () => {
    const { lopend, saldo } = overtimeLedger({ ...basis, lopendeUren: 120 });
    expect(lopend).toMatchObject({ key: "2026-11", geboekt: 120 });
    // 12 + (180,4 − 171,4) + (174,9 − 177,1) = 18,8. De lopende maand telt niet
    // mee, dus 120 geboekte uren van november veranderen daar niets aan.
    expect(saldo).toBeCloseTo(18.8, 1);
  });

  it("gives no ledger at all without an opening date", () => {
    const { lines, saldo, lopend } = overtimeLedger({ ...basis, openingDate: null, months: [] });
    expect(lines).toEqual([]);
    expect(saldo).toBe(0);
    expect(lopend).toBeNull();
  });

  it("keeps an adjustment dated before the opening, rather than hiding it", () => {
    // Zinloos maar zichtbaar: stilzwijgend weglaten zou een saldo opleveren dat
    // niet klopt met wat er in de database staat.
    const met = { ...basis, adjustments: [mutatie("a1", "2026-08-01", 5, "correctie")] };
    const { lines, saldo } = overtimeLedger(met);
    expect(lines[0]).toMatchObject({ kind: "adjustment", date: "2026-08-01" });
    expect(saldo).toBeCloseTo(23.8, 1); // 18,8 + 5
  });
});
