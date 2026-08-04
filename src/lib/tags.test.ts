import { describe, it, expect } from "vitest";
import { normalizeTagName, isReservedTagName, RESERVED_TAG_NAME } from "./tags";

describe("normalizeTagName", () => {
  it("trims surrounding whitespace", () => {
    expect(normalizeTagName(" Marketing ")).toBe("marketing");
  });

  it("lowercases", () => {
    expect(normalizeTagName("MARKETING")).toBe("marketing");
  });

  it("maps two spellings of one name onto the same key", () => {
    expect(normalizeTagName("Marketing")).toBe(normalizeTagName(" marketing"));
  });

  it("returns an empty string for whitespace only", () => {
    expect(normalizeTagName("   ")).toBe("");
  });
});

describe("isReservedTagName", () => {
  it("recognises the payroll tag in any spelling", () => {
    expect(isReservedTagName("wbso")).toBe(true);
    expect(isReservedTagName("WBSO")).toBe(true);
    expect(isReservedTagName(" Wbso ")).toBe(true);
  });

  it("does not over-reach to names that merely contain it", () => {
    expect(isReservedTagName("wbso2")).toBe(false);
    expect(isReservedTagName("efro")).toBe(false);
    expect(isReservedTagName("")).toBe(false);
  });

  it("exports the reserved name so payroll and the tag routes cannot drift", () => {
    expect(RESERVED_TAG_NAME).toBe("wbso");
  });
});

import { canonicalizeTagNames } from "./tags";

describe("canonicalizeTagNames", () => {
  it("replaces a typed spelling with the existing one", () => {
    expect(canonicalizeTagNames(["Marketing"], ["marketing", "WBSO"])).toEqual(["marketing"]);
  });

  it("keeps a genuinely new name as typed", () => {
    expect(canonicalizeTagNames(["EFRO"], ["marketing"])).toEqual(["EFRO"]);
  });

  it("trims what the user typed", () => {
    expect(canonicalizeTagNames(["  EFRO  "], [])).toEqual(["EFRO"]);
  });

  it("drops blank entries", () => {
    expect(canonicalizeTagNames(["", "   ", "EFRO"], [])).toEqual(["EFRO"]);
  });

  it("collapses two spellings of one new name into a single tag", () => {
    // Anders maakt één opslagactie meteen twee bijna-gelijke tags aan.
    expect(canonicalizeTagNames(["EFRO", "efro"], [])).toEqual(["EFRO"]);
  });

  it("collapses onto the existing spelling when both are typed", () => {
    expect(canonicalizeTagNames(["Marketing", "marketing"], ["marketing"])).toEqual(["marketing"]);
  });

  it("preserves the order in which names were typed", () => {
    expect(canonicalizeTagNames(["b", "a"], [])).toEqual(["b", "a"]);
  });

  it("returns an empty array for no input", () => {
    expect(canonicalizeTagNames([], ["marketing"])).toEqual([]);
  });
});
