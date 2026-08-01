import { describe, it, expect } from "vitest";
import { buildBulkWhere, buildBulkData } from "./bulk-entries";

describe("buildBulkWhere", () => {
  it("scopes to the given ids", () => {
    expect(buildBulkWhere(["a", "b"]).id).toEqual({ in: ["a", "b"] });
  });

  it("always excludes invoiced rows", () => {
    expect(buildBulkWhere(["a"]).invoiced).toBe(false);
    expect(buildBulkWhere([]).invoiced).toBe(false);
  });
});

describe("buildBulkData", () => {
  it("moves rows to another project", () => {
    expect(buildBulkData({ type: "project", projectId: "p-1" })).toEqual({ projectId: "p-1" });
  });

  it("flips the billable flag both ways", () => {
    expect(buildBulkData({ type: "billable", billable: false })).toEqual({ billable: false });
    expect(buildBulkData({ type: "billable", billable: true })).toEqual({ billable: true });
  });

  it("reassigns rows to another employee", () => {
    expect(buildBulkData({ type: "user", userId: "u-9" })).toEqual({ userId: "u-9" });
  });

  it("re-snapshots the work level when the caller passes one along (bulk time reassignment)", () => {
    expect(buildBulkData({ type: "user", userId: "u-9" }, { workLevel: "SENIOR" })).toEqual({
      userId: "u-9",
      workLevel: "SENIOR",
    });
  });

  it("carries a null work level through unchanged (target user has none set)", () => {
    expect(buildBulkData({ type: "user", userId: "u-9" }, { workLevel: null })).toEqual({
      userId: "u-9",
      workLevel: null,
    });
  });

  it("leaves workLevel out entirely for km/expense reassignment (no opts passed)", () => {
    expect(buildBulkData({ type: "user", userId: "u-9" })).not.toHaveProperty("workLevel");
  });

  it("refuses to build update data for a delete", () => {
    expect(() => buildBulkData({ type: "delete" })).toThrow();
  });
});
