import { describe, it, expect } from "vitest";
import { kmTemplateSchema, canManageTemplate } from "./km-template";

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

describe("canManageTemplate", () => {
  const base = { currentUserId: "u1", ownerId: "u1" };
  it("owner may manage own non-managed template", () => {
    expect(canManageTemplate({ ...base, role: "EMPLOYEE", managedByAdmin: false })).toBe(true);
  });
  it("non-owner employee may not manage another's template", () => {
    expect(canManageTemplate({ role: "EMPLOYEE", currentUserId: "u2", ownerId: "u1", managedByAdmin: false })).toBe(false);
  });
  it("owner employee may NOT manage a managed template", () => {
    expect(canManageTemplate({ ...base, role: "EMPLOYEE", managedByAdmin: true })).toBe(false);
  });
  it("admin may manage a managed template for anyone", () => {
    expect(canManageTemplate({ role: "ADMIN", currentUserId: "admin", ownerId: "u1", managedByAdmin: true })).toBe(true);
  });
  it("admin may manage any non-managed template", () => {
    expect(canManageTemplate({ role: "ADMIN", currentUserId: "admin", ownerId: "u1", managedByAdmin: false })).toBe(true);
  });
});
