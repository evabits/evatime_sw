import { describe, it, expect } from "vitest";
import { kmTemplateSchema } from "./km-template";

describe("km-template schema", () => {
  it("valid minimal payload parses", () => {
    expect(kmTemplateSchema.safeParse({ name: "Thuis", projectId: "p1", km: 45.5 }).success).toBeTruthy();
  });
  it("valid full payload parses", () => {
    expect(
      kmTemplateSchema.safeParse({ name: "Thuis", projectId: "p1", activityTypeId: null, km: 1, description: "x" }).success,
    ).toBeTruthy();
  });
  it("empty name rejected", () => {
    expect(kmTemplateSchema.safeParse({ name: "", projectId: "p1", km: 1 }).success).toBe(false);
  });
  it("zero km rejected", () => {
    expect(kmTemplateSchema.safeParse({ name: "Thuis", projectId: "p1", km: 0 }).success).toBe(false);
  });
  it("negative km rejected", () => {
    expect(kmTemplateSchema.safeParse({ name: "Thuis", projectId: "p1", km: -5 }).success).toBe(false);
  });
});
