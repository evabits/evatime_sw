import { describe, it, expect } from "vitest";
import { resolvePeriod, PERIOD_LABELS, PERIOD_ORDER } from "./periods";

// Woensdag 15 juli 2026. Let op: de lokale constructor, niet new Date("2026-07-15"),
// want die parst als UTC en kan in een andere tijdzone een dag verschuiven.
const wed = new Date(2026, 6, 15);

describe("resolvePeriod", () => {
  it("returns the whole current month", () => {
    expect(resolvePeriod("this-month", wed)).toEqual({ from: "2026-07-01", to: "2026-07-31" });
  });

  it("returns the whole previous month", () => {
    expect(resolvePeriod("last-month", wed)).toEqual({ from: "2026-06-01", to: "2026-06-30" });
  });

  it("returns Monday to Sunday of the current week", () => {
    expect(resolvePeriod("this-week", wed)).toEqual({ from: "2026-07-13", to: "2026-07-19" });
  });

  it("returns Monday to Sunday of the previous week", () => {
    expect(resolvePeriod("last-week", wed)).toEqual({ from: "2026-07-06", to: "2026-07-12" });
  });

  it("returns January 1st up to and including today, not the end of the year", () => {
    expect(resolvePeriod("this-year", wed)).toEqual({ from: "2026-01-01", to: "2026-07-15" });
  });

  it("returns null for custom so the caller keeps its dates", () => {
    expect(resolvePeriod("custom", wed)).toBeNull();
  });
});

describe("resolvePeriod edge cases", () => {
  it("crosses the year boundary for last month and this week", () => {
    // Zaterdag 3 januari 2026: vorige maand is december 2025, en de week
    // begint op maandag 29 december 2025.
    const sat = new Date(2026, 0, 3);
    expect(resolvePeriod("last-month", sat)).toEqual({ from: "2025-12-01", to: "2025-12-31" });
    expect(resolvePeriod("this-week", sat)).toEqual({ from: "2025-12-29", to: "2026-01-04" });
  });

  it("treats a Monday as the first day of its own week", () => {
    const mon = new Date(2026, 6, 13);
    expect(resolvePeriod("this-week", mon)).toEqual({ from: "2026-07-13", to: "2026-07-19" });
  });

  it("treats a Sunday as the last day of the week that started six days earlier", () => {
    // Dit is de test die faalt zodra iemand weekStartsOn weglaat: date-fns
    // valt dan terug op zondag en geeft 2026-07-19 als from.
    const sun = new Date(2026, 6, 19);
    expect(resolvePeriod("this-week", sun)).toEqual({ from: "2026-07-13", to: "2026-07-19" });
  });

  it("does not overflow when the current month is longer than the previous one", () => {
    // 31 maart min een maand is 28 februari; de maandgrenzen moeten februari
    // volledig dekken, niet een geknipt bereik.
    const mar31 = new Date(2026, 2, 31);
    expect(resolvePeriod("last-month", mar31)).toEqual({ from: "2026-02-01", to: "2026-02-28" });
  });
});

describe("PERIOD_ORDER and PERIOD_LABELS", () => {
  it("lists the presets in the order the dropdown shows them", () => {
    expect(PERIOD_ORDER).toEqual([
      "this-month", "last-month", "this-week", "last-week", "this-year", "custom",
    ]);
  });

  it("has a Dutch label for every preset in the order", () => {
    expect(PERIOD_ORDER.map((p) => PERIOD_LABELS[p])).toEqual([
      "Deze maand", "Vorige maand", "Deze week", "Vorige week", "Dit jaar", "Aangepast",
    ]);
  });
});
