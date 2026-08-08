import { describe, it, expect } from "vitest";
import { readHiddenIds, hiddenStorageKey } from "./hidden-members";

describe("hiddenStorageKey", () => {
  it("carries the user id, so two leaders on one browser do not share a selection", () => {
    expect(hiddenStorageKey("standup", "u1")).toBe("standup-hidden:u1");
    expect(hiddenStorageKey("standup", "u2")).not.toBe(hiddenStorageKey("standup", "u1"));
  });

  it("keeps the standup key it had before the payroll screen existed", () => {
    // Deze sleutel staat al bij gebruikers in de browser. Zou hij veranderen,
    // dan raakt iedereen stilzwijgend zijn standup-selectie kwijt bij de deploy.
    expect(hiddenStorageKey("standup", "u1")).toBe("standup-hidden:u1");
  });

  it("keeps the two screens apart", () => {
    // Mensen wegklikken op de standup zegt niets over de loonlijst.
    expect(hiddenStorageKey("payroll", "u1")).toBe("payroll-hidden:u1");
    expect(hiddenStorageKey("payroll", "u1")).not.toBe(hiddenStorageKey("standup", "u1"));
  });
});

describe("readHiddenIds", () => {
  it("hides nobody when nothing is stored", () => {
    expect(readHiddenIds(null)).toEqual([]);
  });

  it("returns the stored ids", () => {
    expect(readHiddenIds('["u1","u2"]')).toEqual(["u1", "u2"]);
  });

  it("hides nobody for an empty stored list", () => {
    expect(readHiddenIds("[]")).toEqual([]);
  });

  it("hides nobody when the stored value is not valid JSON", () => {
    expect(readHiddenIds("{kapot")).toEqual([]);
    expect(readHiddenIds("")).toEqual([]);
  });

  it("hides nobody when the stored value is not an array", () => {
    // Een oudere versie van dit scherm, of iemand die met de console speelt.
    expect(readHiddenIds('"u1"')).toEqual([]);
    expect(readHiddenIds("42")).toEqual([]);
    expect(readHiddenIds("null")).toEqual([]);
    expect(readHiddenIds('{"u1":true}')).toEqual([]);
  });

  it("drops entries that are not strings instead of rejecting the whole list", () => {
    // Eén rare waarde mag de rest van de selectie niet ongedaan maken, maar
    // hij mag ook niet als id meedoen — dan zou hij nooit ergens op matchen.
    expect(readHiddenIds('["u1",7,null,"u2"]')).toEqual(["u1", "u2"]);
  });
});
