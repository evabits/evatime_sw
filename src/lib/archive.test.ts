import { describe, it, expect } from "vitest";
import { archivedWhere } from "./archive";

describe("archivedWhere", () => {
  it("excludes archived by default", () => {
    expect(archivedWhere(false)).toEqual({ archivedAt: null });
  });
  it("includes archived when asked", () => {
    expect(archivedWhere(true)).toEqual({});
  });
});
