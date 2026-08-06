import { describe, it, expect } from "vitest";
import { perDayTotals } from "./per-day-totals";

// 2026-08-03 is een maandag.
const week = [
  "2026-08-03",
  "2026-08-04",
  "2026-08-05",
  "2026-08-06",
  "2026-08-07",
  "2026-08-08",
  "2026-08-09",
];

describe("perDayTotals", () => {
  it("returns a zero for every day when there is nothing", () => {
    expect(perDayTotals([], week)).toEqual([0, 0, 0, 0, 0, 0, 0]);
  });

  it("puts a single entry on its own day", () => {
    expect(perDayTotals([{ date: "2026-08-05", value: 8 }], week)).toEqual([0, 0, 8, 0, 0, 0, 0]);
  });

  it("adds up several entries on the same day", () => {
    const uitkomst = perDayTotals(
      [
        { date: "2026-08-04", value: 2.5 },
        { date: "2026-08-04", value: 5.5 },
        { date: "2026-08-06", value: 1 },
      ],
      week,
    );
    expect(uitkomst).toEqual([0, 8, 0, 1, 0, 0, 0]);
  });

  it("ignores entries outside the given days", () => {
    const uitkomst = perDayTotals(
      [
        { date: "2026-07-31", value: 99 },
        { date: "2026-08-10", value: 99 },
        { date: "2026-08-03", value: 4 },
      ],
      week,
    );
    expect(uitkomst).toEqual([4, 0, 0, 0, 0, 0, 0]);
  });

  it("accepts a Date as well as a string", () => {
    expect(perDayTotals([{ date: new Date("2026-08-07T00:00:00"), value: 3 }], week))
      .toEqual([0, 0, 0, 0, 3, 0, 0]);
  });

  it("lands on the right day for the production shape (UTC midnight with a Z)", () => {
    // `date` is `DateTime @db.Date`, dus de API levert UTC-middernacht met een
    // Z, niet lokale-tijd-middernacht. De testrunner draait op een vastgezette
    // tijdzone (zie vitest.config.mts), zodat dit deterministisch is.
    expect(perDayTotals([{ date: "2026-08-07T00:00:00.000Z", value: 5 }], week))
      .toEqual([0, 0, 0, 0, 5, 0, 0]);
  });

  it("keeps the order and length of the days it was given", () => {
    // Omgekeerde volgorde: de uitkomst volgt de dagen, niet de kalender.
    const omgekeerd = [...week].reverse();
    expect(perDayTotals([{ date: "2026-08-09", value: 6 }], omgekeerd))
      .toEqual([6, 0, 0, 0, 0, 0, 0]);
  });
});
