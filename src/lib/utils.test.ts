import { describe, it, expect } from "vitest";
import { formatDate, formatDateTime } from "./utils";

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
