import { describe, it, expect } from "vitest";
import { removedProjectIds } from "./activity-impact";

describe("removedProjectIds", () => {
  it("returns links present now but not in the new selection", () => {
    expect(removedProjectIds(["a", "b", "c"], ["a", "c"])).toEqual(["b"]);
  });
  it("empty when nothing removed", () => {
    expect(removedProjectIds(["a"], ["a", "b"])).toEqual([]);
  });
  it("all removed when new selection empty", () => {
    expect(removedProjectIds(["a", "b"], [])).toEqual(["a", "b"]);
  });
});
