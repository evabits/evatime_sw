import { describe, it, expect } from "vitest";
import { previousWorkingDay } from "./standup";

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
