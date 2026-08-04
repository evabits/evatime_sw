import { describe, it, expect } from "vitest";
import { ABSENCE_PROJECT_NAMES, splitHoursOverDays } from "./absence-entries";

/** Optellen in centen: 3.33 + 3.33 + 3.34 is in floating point net geen 10. */
function totaalInCenten(regels: Array<{ hours: number }>): number {
  return regels.reduce((som, r) => som + Math.round(r.hours * 100), 0);
}

describe("ABSENCE_PROJECT_NAMES", () => {
  it("names a project for every absence type", () => {
    expect(ABSENCE_PROJECT_NAMES).toEqual({
      VACATION: "Vakantieverlof",
      SICK: "Ziekteverlof",
      PARENTAL_LEAVE: "Ouderschapsverlof",
      SPECIAL_LEAVE: "Bijzonder verlof",
      UNPAID_LEAVE: "Onbetaald verlof",
    });
  });
});

describe("splitHoursOverDays", () => {
  const week = ["2026-08-03", "2026-08-04", "2026-08-05", "2026-08-06", "2026-08-07"];

  it("divides evenly when it comes out round", () => {
    expect(splitHoursOverDays(40, week)).toEqual([
      { date: "2026-08-03", hours: 8 },
      { date: "2026-08-04", hours: 8 },
      { date: "2026-08-05", hours: 8 },
      { date: "2026-08-06", hours: 8 },
      { date: "2026-08-07", hours: 8 },
    ]);
  });

  it("puts the remainder on the last day", () => {
    // 10 / 3 does not divide into two decimals; the last day absorbs the rest.
    expect(splitHoursOverDays(10, ["2026-08-03", "2026-08-04", "2026-08-05"])).toEqual([
      { date: "2026-08-03", hours: 3.33 },
      { date: "2026-08-04", hours: 3.33 },
      { date: "2026-08-05", hours: 3.34 },
    ]);
  });

  it("handles a single day", () => {
    expect(splitHoursOverDays(8, ["2026-08-04"])).toEqual([{ date: "2026-08-04", hours: 8 }]);
  });

  it("returns nothing for no days rather than dividing by zero", () => {
    expect(splitHoursOverDays(8, [])).toEqual([]);
  });

  it("splits a half day across two days", () => {
    expect(splitHoursOverDays(7.5, ["2026-08-03", "2026-08-04"])).toEqual([
      { date: "2026-08-03", hours: 3.75 },
      { date: "2026-08-04", hours: 3.75 },
    ]);
  });

  it("always sums to exactly the requested total", () => {
    // The property that matters: an approval must never quietly book more or
    // fewer hours than the employee asked for.
    for (const totaal of [40, 10, 7.5, 1, 36.4, 13.33]) {
      expect(totaalInCenten(splitHoursOverDays(totaal, week))).toBe(Math.round(totaal * 100));
    }
  });
});
