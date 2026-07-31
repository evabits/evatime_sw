import { describe, it, expect } from "vitest";
import { resolveEntryUserId, checkEntryMutation } from "./entry-owner";

describe("resolveEntryUserId", () => {
  it("uses the requested user when an admin asks for it", () => {
    expect(resolveEntryUserId("ADMIN", "admin-1", "piet-2")).toBe("piet-2");
  });

  it("falls back to the session user when an admin sends nothing", () => {
    expect(resolveEntryUserId("ADMIN", "admin-1", undefined)).toBe("admin-1");
    expect(resolveEntryUserId("ADMIN", "admin-1", null)).toBe("admin-1");
    expect(resolveEntryUserId("ADMIN", "admin-1", "")).toBe("admin-1");
  });

  it("ignores a requested user from a non-admin", () => {
    expect(resolveEntryUserId("EMPLOYEE", "piet-2", "admin-1")).toBe("piet-2");
    expect(resolveEntryUserId("FINANCE", "fin-3", "admin-1")).toBe("fin-3");
  });
});

describe("checkEntryMutation", () => {
  it("reports a missing entry", () => {
    expect(checkEntryMutation("ADMIN", "admin-1", null)).toBe("not-found");
  });

  it("lets an owner mutate their own entry", () => {
    expect(checkEntryMutation("EMPLOYEE", "piet-2", { userId: "piet-2", invoiced: false })).toBe("ok");
  });

  it("blocks a non-admin from another user's entry", () => {
    expect(checkEntryMutation("EMPLOYEE", "piet-2", { userId: "jan-4", invoiced: false })).toBe("forbidden");
    expect(checkEntryMutation("FINANCE", "fin-3", { userId: "jan-4", invoiced: false })).toBe("forbidden");
  });

  it("lets an admin mutate another user's entry", () => {
    expect(checkEntryMutation("ADMIN", "admin-1", { userId: "jan-4", invoiced: false })).toBe("ok");
  });

  it("blocks invoiced entries for everyone, admins included", () => {
    expect(checkEntryMutation("ADMIN", "admin-1", { userId: "jan-4", invoiced: true })).toBe("invoiced");
    expect(checkEntryMutation("EMPLOYEE", "piet-2", { userId: "piet-2", invoiced: true })).toBe("invoiced");
  });

  it("reports forbidden before invoiced so a stranger learns nothing about the entry", () => {
    expect(checkEntryMutation("EMPLOYEE", "piet-2", { userId: "jan-4", invoiced: true })).toBe("forbidden");
  });
});
