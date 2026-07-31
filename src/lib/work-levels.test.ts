import { describe, it, expect } from "vitest";
import { WORK_LEVEL_ORDER, WORK_LEVEL_LABELS } from "./work-levels";

describe("work levels", () => {
  it("lists the four levels from least to most senior", () => {
    expect(WORK_LEVEL_ORDER).toEqual(["PRODUCTION", "JUNIOR", "MEDIOR", "SENIOR"]);
  });

  it("has a Dutch label for every level", () => {
    expect(WORK_LEVEL_ORDER.map((l) => WORK_LEVEL_LABELS[l])).toEqual([
      "Productie", "Junior Engineer", "Medior Engineer", "Senior Engineer",
    ]);
  });
});
