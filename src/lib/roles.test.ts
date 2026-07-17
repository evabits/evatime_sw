import { describe, it, expect } from "vitest";
import { canViewReports } from "./roles";

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
