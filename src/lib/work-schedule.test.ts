import { describe, it, expect } from "vitest";
import { scheduledHoursOn, targetSoFar, weekTotal, toWeekSchedule, missingHours } from "./work-schedule";

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

  it("does not leak floating-point noise in a partial sum", () => {
    // 8.1 + 8.2 + 8.1 + 8.2 is 32.599999999999994 in floating point, in
    // this reduce order (verified: the 3-day Monday-Wednesday partial sum
    // happens to land back on exactly 24.4, so it would not catch a
    // dropped rond() — the 4-day Thursday partial sum genuinely doesn't).
    // Must read back as a clean 32.6.
    const ONGELIJK = { monday: 8.1, tuesday: 8.2, wednesday: 8.1, thursday: 8.2, friday: 0 };
    expect(targetSoFar(ONGELIJK, "2026-08-06")).toBe(32.6);
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
    // 8.1 + 8.2 + 8.1 + 8.2 + 0 is 32.599999999999994 in floating point, in
    // this reduce order. The column is Decimal(4,2), so the answer must
    // read back as a clean 32.6.
    expect(weekTotal({ monday: 8.1, tuesday: 8.2, wednesday: 8.1, thursday: 8.2, friday: 0 })).toBe(32.6);
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

describe("missingHours", () => {
  it("geeft nul voor wie afwezig is, ook zonder geboekte uren", () => {
    expect(missingHours(8, 0, true)).toBe(0);
  });

  it("geeft nul op een vaste vrije dag", () => {
    expect(missingHours(0, 0, false)).toBe(0);
  });

  it("geeft nul zonder weekrooster", () => {
    // Zes van de veertien medewerkers hebben er geen; die blijven bewust
    // buiten elke telling.
    expect(missingHours(null, 0, false)).toBe(0);
  });

  it("geeft nul wanneer precies genoeg geboekt is", () => {
    expect(missingHours(8, 8, false)).toBe(0);
  });

  it("geeft nul wanneer er meer geboekt is dan gepland", () => {
    expect(missingHours(8, 9.5, false)).toBe(0);
  });

  it("geeft het hele rooster wanneer er niets geboekt is", () => {
    expect(missingHours(8, 0, false)).toBe(8);
  });

  it("geeft het verschil bij een gedeeltelijke boeking", () => {
    expect(missingHours(8, 4, false)).toBe(4);
  });

  it("rondt het verschil af op twee decimalen", () => {
    // Decimal(4,2)-sommen landen net naast een rond getal; zonder afronding
    // zou hier 0.7999999999999998 uit komen.
    expect(missingHours(6.4, 5.6, false)).toBe(0.8);
  });
});
