import { describe, it, expect } from "vitest";
import { weeklyHoursField } from "./user-schema";

describe("weeklyHoursField", () => {
  it("empty string => undefined (no target)", () => {
    expect(weeklyHoursField.parse("")).toBeUndefined();
  });
  it("null => undefined", () => {
    expect(weeklyHoursField.parse(null)).toBeUndefined();
  });
  it("undefined => undefined", () => {
    expect(weeklyHoursField.parse(undefined)).toBeUndefined();
  });
  it("'40' => 40", () => {
    expect(weeklyHoursField.parse("40")).toBe(40);
  });
  it("number 40 => 40", () => {
    expect(weeklyHoursField.parse(40)).toBe(40);
  });
  it("'0' rejected", () => {
    expect(() => weeklyHoursField.parse("0")).toThrow();
  });
  it("negative rejected", () => {
    expect(() => weeklyHoursField.parse("-5")).toThrow();
  });
});
