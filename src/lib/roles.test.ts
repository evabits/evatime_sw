import { describe, it, expect } from "vitest";
import { canViewReports, canManagePlanning } from "./roles";

describe("canViewReports", () => {
  it("allows ADMIN", () => {
    expect(canViewReports("ADMIN")).toBe(true);
  });
  it("allows FINANCE", () => {
    expect(canViewReports("FINANCE")).toBe(true);
  });
  it("denies EMPLOYEE", () => {
    expect(canViewReports("EMPLOYEE")).toBe(false);
  });
  it("denies unknown roles", () => {
    expect(canViewReports("")).toBe(false);
  });
});

describe("canManagePlanning", () => {
  it("only lets an admin plan", () => {
    expect(canManagePlanning("ADMIN")).toBe(true);
    expect(canManagePlanning("FINANCE")).toBe(false);
    expect(canManagePlanning("TEAMLEAD")).toBe(false);
    expect(canManagePlanning("EMPLOYEE")).toBe(false);
  });

  it("says no to an unknown role instead of throwing", () => {
    expect(canManagePlanning("ONBEKEND")).toBe(false);
  });
});
