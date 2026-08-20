import { describe, it, expect } from "vitest";
import { formatDate, formatDateTime, formatHoursDecimal } from "./utils";

describe("formatDate", () => {
  it("writes a date as DD-MMM-YYYY with the month spelled out short", () => {
    expect(formatDate("2026-01-01")).toBe("01-JAN-2026");
  });

  it("pads the day so every date is the same width", () => {
    expect(formatDate("2026-07-09")).toBe("09-JUL-2026");
  });

  it("uses Dutch month abbreviations", () => {
    expect(formatDate("2026-03-15")).toBe("15-MRT-2026");
    expect(formatDate("2026-05-15")).toBe("15-MEI-2026");
    expect(formatDate("2026-10-15")).toBe("15-OKT-2026");
  });

  it("keeps the day a date from the database stands on", () => {
    // Prisma geeft een @db.Date terug als middernacht UTC; in Amsterdam is dat
    // dezelfde dag en dat moet zo blijven.
    expect(formatDate(new Date("2026-08-31T00:00:00Z"))).toBe("31-AUG-2026");
  });

  it("gives nothing for an empty or unreadable date", () => {
    expect(formatDate(null)).toBe("");
    expect(formatDate(undefined)).toBe("");
    expect(formatDate("")).toBe("");
    expect(formatDate("geen datum")).toBe("");
  });
});

describe("formatDateTime", () => {
  it("puts the clock behind the date", () => {
    // Zomertijd in Amsterdam: 12:30 UTC is hier 14:30.
    expect(formatDateTime(new Date("2026-07-23T12:30:00Z"))).toBe("23-JUL-2026 14:30");
  });

  it("pads hours and minutes", () => {
    expect(formatDateTime(new Date("2026-01-05T08:05:00Z"))).toBe("05-JAN-2026 09:05");
  });

  it("gives nothing for an empty date", () => {
    expect(formatDateTime(null)).toBe("");
  });
});

describe("formatHoursDecimal", () => {
  it("writes a half hour as a decimal, not as minutes", () => {
    // Dit is het hele punt: 1:30 wordt 1,5.
    expect(formatHoursDecimal(1.5)).toBe("1,5");
  });

  it("uses a comma, because this is a Dutch screen", () => {
    expect(formatHoursDecimal(177.14)).toBe("177,14");
  });

  it("drops trailing zeros, so a whole number stays whole", () => {
    expect(formatHoursDecimal(8)).toBe("8");
    expect(formatHoursDecimal(8.0)).toBe("8");
  });

  it("rounds to two decimals", () => {
    expect(formatHoursDecimal(1.005)).toBe("1,01");
  });

  it("keeps the sign on a shortfall", () => {
    expect(formatHoursDecimal(-2.25)).toBe("-2,25");
  });

  it("copes with Decimal arriving as a string", () => {
    expect(formatHoursDecimal("167.25")).toBe("167,25");
  });

  it("falls back to zero for nothing at all", () => {
    expect(formatHoursDecimal(null)).toBe("0");
    expect(formatHoursDecimal(undefined)).toBe("0");
    expect(formatHoursDecimal("onzin")).toBe("0");
  });
});
