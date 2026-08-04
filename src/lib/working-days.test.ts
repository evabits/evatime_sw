import { describe, it, expect } from "vitest";
import { previousWorkingDay, workingDaysBetween } from "./working-days";

describe("previousWorkingDay", () => {
  it("goes back one day from a Tuesday", () => {
    // 2026-08-04 is a Tuesday.
    expect(previousWorkingDay("2026-08-04")).toBe("2026-08-03");
  });

  it("skips the weekend from a Monday", () => {
    // 2026-08-03 is a Monday; Friday is 2026-07-31, not Sunday the 2nd.
    expect(previousWorkingDay("2026-08-03")).toBe("2026-07-31");
  });

  it("returns Friday when asked from a Sunday", () => {
    expect(previousWorkingDay("2026-08-02")).toBe("2026-07-31");
  });

  it("returns Friday when asked from a Saturday", () => {
    expect(previousWorkingDay("2026-08-01")).toBe("2026-07-31");
  });

  it("goes back one day from a Wednesday", () => {
    expect(previousWorkingDay("2026-08-05")).toBe("2026-08-04");
  });

  it("crosses a month boundary", () => {
    // 2026-06-01 is a Monday.
    expect(previousWorkingDay("2026-06-01")).toBe("2026-05-29");
  });

  it("crosses a year boundary", () => {
    // 2027-01-01 is a Friday.
    expect(previousWorkingDay("2027-01-01")).toBe("2026-12-31");
  });

  it("returns a zero-padded YYYY-MM-DD string, never a Date", () => {
    // 2026-02-03 is a Tuesday, so the answer is Monday the 2nd — a low month
    // and a low day, where an unpadded formatter would produce "2026-2-2".
    expect(previousWorkingDay("2026-02-03")).toBe("2026-02-02");
    expect(previousWorkingDay("2026-02-03")).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

describe("workingDaysBetween", () => {
  it("returns every weekday of a full working week", () => {
    // 2026-08-03 is a Monday, 2026-08-07 the Friday of that week.
    expect(workingDaysBetween("2026-08-03", "2026-08-07")).toEqual([
      "2026-08-03", "2026-08-04", "2026-08-05", "2026-08-06", "2026-08-07",
    ]);
  });

  it("returns a single day when the range is one working day", () => {
    expect(workingDaysBetween("2026-08-04", "2026-08-04")).toEqual(["2026-08-04"]);
  });

  it("returns nothing when the range is a single Saturday", () => {
    // 2026-08-01 is a Saturday. A request that falls entirely in a weekend
    // yields no days at all, which the caller must handle.
    expect(workingDaysBetween("2026-08-01", "2026-08-01")).toEqual([]);
  });

  it("skips the weekend inside a range", () => {
    // Friday 2026-08-07 to Monday 2026-08-10: the 8th and 9th are dropped.
    expect(workingDaysBetween("2026-08-07", "2026-08-10")).toEqual([
      "2026-08-07", "2026-08-10",
    ]);
  });

  it("returns nothing when `to` falls before `from`", () => {
    expect(workingDaysBetween("2026-08-05", "2026-08-03")).toEqual([]);
  });

  it("crosses a month boundary", () => {
    // Thursday 2026-07-30 to Monday 2026-08-03.
    expect(workingDaysBetween("2026-07-30", "2026-08-03")).toEqual([
      "2026-07-30", "2026-07-31", "2026-08-03",
    ]);
  });
});
