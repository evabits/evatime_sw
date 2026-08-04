import { describe, it, expect } from "vitest";
import { scheduledHoursOn, targetSoFar, weekTotal, toWeekSchedule } from "./work-schedule";

// Merlijn werkt 32 uur: maandag t/m donderdag acht uur, vrijdag vrij.
const MERLIJN = { monday: 8, tuesday: 8, wednesday: 8, thursday: 8, friday: 0 };
// Iemand die middenin de week vrij is — het geval waarvoor de urenherinnering
// vandaag onterecht aanslaat.
const WOENSDAG_VRIJ = { monday: 8, tuesday: 8, wednesday: 0, thursday: 8, friday: 8 };

describe("scheduledHoursOn", () => {
  it("returns zero on a scheduled day off", () => {
    // 2026-08-07 is a Friday.
    expect(scheduledHoursOn(MERLIJN, "2026-08-07")).toBe(0);
  });

  it("returns the scheduled hours on a working day", () => {
    // 2026-08-03 is a Monday.
    expect(scheduledHoursOn(MERLIJN, "2026-08-03")).toBe(8);
  });

  it("returns zero on a Saturday", () => {
    // 2026-08-08 is a Saturday; the schedule has no weekend fields at all.
    expect(scheduledHoursOn(MERLIJN, "2026-08-08")).toBe(0);
  });

  it("returns zero on a Sunday", () => {
    expect(scheduledHoursOn(MERLIJN, "2026-08-09")).toBe(0);
  });
});

describe("targetSoFar", () => {
  it("counts only Monday on a Monday", () => {
    expect(targetSoFar(MERLIJN, "2026-08-03")).toBe(8);
  });

  it("counts through Wednesday on a Wednesday", () => {
    // 2026-08-05 is a Wednesday.
    expect(targetSoFar(MERLIJN, "2026-08-05")).toBe(24);
  });

  it("counts the whole week on a Friday", () => {
    expect(targetSoFar(MERLIJN, "2026-08-07")).toBe(32);
  });

  it("skips a mid-week day off", () => {
    // This is the whole point: today the reminder would expect 40 * 3/5 = 24
    // for a full-timer, and 19.2 for this 32-hour employee — both wrong.
    expect(targetSoFar(WOENSDAG_VRIJ, "2026-08-05")).toBe(16);
  });

  it("counts the whole week on a Saturday", () => {
    expect(targetSoFar(MERLIJN, "2026-08-08")).toBe(32);
  });

  it("counts the whole week on a Sunday", () => {
    // Sunday is day 0, which must not read as "no weekdays elapsed yet".
    expect(targetSoFar(MERLIJN, "2026-08-09")).toBe(32);
  });
});

describe("weekTotal", () => {
  it("adds the five days", () => {
    expect(weekTotal(MERLIJN)).toBe(32);
  });

  it("returns zero for an empty schedule", () => {
    expect(weekTotal({ monday: 0, tuesday: 0, wednesday: 0, thursday: 0, friday: 0 })).toBe(0);
  });

  it("does not leak floating-point noise", () => {
    // 6.4 * 5 is 32.00000000000001 in floating point. The column is
    // Decimal(4,2), so the answer must read back as a clean 32.
    expect(weekTotal({ monday: 6.4, tuesday: 6.4, wednesday: 6.4, thursday: 6.4, friday: 6.4 })).toBe(32);
  });
});

describe("toWeekSchedule", () => {
  it("returns null when there is no row", () => {
    expect(toWeekSchedule(null)).toBeNull();
    expect(toWeekSchedule(undefined)).toBeNull();
  });

  it("converts Prisma Decimals to plain numbers", () => {
    // Prisma hands back Decimal objects, not numbers; everything downstream
    // does arithmetic, so they have to be converted once, here.
    const row = { monday: "8.00", tuesday: "8.00", wednesday: "8.00", thursday: "8.00", friday: "0.00" };
    expect(toWeekSchedule(row)).toEqual(MERLIJN);
  });
});
