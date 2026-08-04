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
