import { describe, it, expect } from "vitest";
import {
  weeklyHoursField, workLevelField, overtimeOpeningDateField, overtimeOpeningHoursField,
} from "./user-schema";

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

describe("workLevelField", () => {
  it("accepts each of the four levels", () => {
    for (const level of ["PRODUCTION", "JUNIOR", "MEDIOR", "SENIOR"]) {
      expect(workLevelField.parse(level)).toBe(level);
    }
  });

  it("treats empty input as not set", () => {
    expect(workLevelField.parse("")).toBeUndefined();
    expect(workLevelField.parse(null)).toBeUndefined();
    expect(workLevelField.parse(undefined)).toBeUndefined();
  });

  it("rejects an unknown level", () => {
    expect(() => workLevelField.parse("PRINCIPAL")).toThrow();
  });
});

// Dit onderscheid is de kern van de fix voor het datalek waarbij een scherm
// dat deze velden niet kent de beginstand stilzwijgend wiste: "sleutel
// ontbreekt" (undefined) moet anders blijven dan "bewust leeggemaakt" (null).
describe("overtimeOpeningDateField", () => {
  it("undefined => undefined (sleutel ontbreekt, kolom blijft ongemoeid)", () => {
    expect(overtimeOpeningDateField.parse(undefined)).toBeUndefined();
  });
  it("'' => null (bewust gewist)", () => {
    expect(overtimeOpeningDateField.parse("")).toBeNull();
  });
  it("null => null", () => {
    expect(overtimeOpeningDateField.parse(null)).toBeNull();
  });
  it("'2026-01-01' => doorgelaten", () => {
    expect(overtimeOpeningDateField.parse("2026-01-01")).toBe("2026-01-01");
  });
  it("verkeerd formaat wordt geweigerd", () => {
    expect(() => overtimeOpeningDateField.parse("1-1-2026")).toThrow();
  });
});

describe("overtimeOpeningHoursField", () => {
  it("undefined => undefined (sleutel ontbreekt, kolom blijft ongemoeid)", () => {
    expect(overtimeOpeningHoursField.parse(undefined)).toBeUndefined();
  });
  it("'' => null (bewust gewist)", () => {
    expect(overtimeOpeningHoursField.parse("")).toBeNull();
  });
  it("null => null", () => {
    expect(overtimeOpeningHoursField.parse(null)).toBeNull();
  });
  it("negatief mag (een tekort als beginstand)", () => {
    expect(overtimeOpeningHoursField.parse(-5)).toBe(-5);
  });
});
