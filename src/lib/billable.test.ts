import { describe, it, expect } from "vitest";
import { isBillable, deriveProjectBillable } from "./billable";

describe("isBillable", () => {
  it("follows a loaded, billable project", () => {
    expect(isBillable({ project: { billable: true } })).toBe(true);
  });

  it("follows a loaded, non-billable project", () => {
    expect(isBillable({ project: { billable: false } })).toBe(false);
  });

  it("treats a record without a project as not billable", () => {
    // Een uitgave zonder project: er is geen project om het aan te vragen.
    expect(isBillable({ project: null })).toBe(false);
  });

  it("returns null when the project relation was never loaded", () => {
    // Dit is het hele punt: een vergeten Prisma-include mag geen stille false
    // worden, want dan verdwijnt er omzet zonder dat iets klaagt.
    expect(isBillable({})).toBeNull();
    expect(isBillable({ project: undefined })).toBeNull();
  });
});

describe("deriveProjectBillable", () => {
  it("uses the override when one is given, whatever the entries say", () => {
    expect(deriveProjectBillable([true, false], true)).toEqual({
      status: "ok", value: true, reason: "override",
    });
    expect(deriveProjectBillable([true, true], false)).toEqual({
      status: "ok", value: false, reason: "override",
    });
  });

  it("defaults an empty project to billable", () => {
    expect(deriveProjectBillable([])).toEqual({
      status: "ok", value: true, reason: "empty",
    });
  });

  it("follows the entries when they all agree", () => {
    expect(deriveProjectBillable([true, true, true])).toEqual({
      status: "ok", value: true, reason: "all-billable",
    });
    expect(deriveProjectBillable([false, false])).toEqual({
      status: "ok", value: false, reason: "all-non-billable",
    });
  });

  it("refuses to guess for a mixed project", () => {
    expect(deriveProjectBillable([true, false])).toEqual({ status: "needs-choice" });
    expect(deriveProjectBillable([false, true, false])).toEqual({ status: "needs-choice" });
  });

  it("accepts an explicit false override for a mixed project", () => {
    expect(deriveProjectBillable([true, false], false)).toEqual({
      status: "ok", value: false, reason: "override",
    });
  });
});
