import { describe, it, expect } from "vitest";
import {
  weeklyHoursField, workLevelField, vacationOpeningDateField, vacationOpeningUsedField,
  overtimeOpeningDateField, overtimeOpeningHoursField,
} from "./user-schema";

// Deze vier velden kregen dezelfde undefined/null-guard als de
// urensaldo-velden onderaan dit bestand: een scherm dat de sleutel niet
// meestuurt (undefined) mag de kolom niet raken; alleen een expliciete "" of
// null wist hem. Vóór die fix collapsete "" hier naar undefined, wat de guard
// in /api/users/[id] onmogelijk maakte — zie task-6-report.md.
describe("weeklyHoursField", () => {
  it("empty string => null (bewust gewist)", () => {
    expect(weeklyHoursField.parse("")).toBeNull();
  });
  it("null => null", () => {
    expect(weeklyHoursField.parse(null)).toBeNull();
  });
  it("undefined => undefined (sleutel ontbreekt, kolom blijft ongemoeid)", () => {
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

  it("empty string => null (bewust gewist)", () => {
    expect(workLevelField.parse("")).toBeNull();
  });
  it("null => null", () => {
    expect(workLevelField.parse(null)).toBeNull();
  });
  it("undefined => undefined (sleutel ontbreekt, kolom blijft ongemoeid)", () => {
    expect(workLevelField.parse(undefined)).toBeUndefined();
  });

  it("rejects an unknown level", () => {
    expect(() => workLevelField.parse("PRINCIPAL")).toThrow();
  });
});

describe("vacationOpeningDateField", () => {
  it("empty string => null (bewust gewist)", () => {
    expect(vacationOpeningDateField.parse("")).toBeNull();
  });
  it("null => null", () => {
    expect(vacationOpeningDateField.parse(null)).toBeNull();
  });
  it("undefined => undefined (sleutel ontbreekt, kolom blijft ongemoeid)", () => {
    expect(vacationOpeningDateField.parse(undefined)).toBeUndefined();
  });
  it("'2026-01-01' => doorgelaten", () => {
    expect(vacationOpeningDateField.parse("2026-01-01")).toBe("2026-01-01");
  });
  it("verkeerd formaat wordt geweigerd", () => {
    expect(() => vacationOpeningDateField.parse("1-1-2026")).toThrow();
  });
});

describe("vacationOpeningUsedField", () => {
  it("empty string => null (bewust gewist)", () => {
    expect(vacationOpeningUsedField.parse("")).toBeNull();
  });
  it("null => null", () => {
    expect(vacationOpeningUsedField.parse(null)).toBeNull();
  });
  it("undefined => undefined (sleutel ontbreekt, kolom blijft ongemoeid)", () => {
    expect(vacationOpeningUsedField.parse(undefined)).toBeUndefined();
  });
  it("negative rejected — je kunt geen vakantie-uren teruggeven", () => {
    expect(() => vacationOpeningUsedField.parse(-5)).toThrow();
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
