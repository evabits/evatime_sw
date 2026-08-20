import { describe, it, expect } from "vitest";
import {
  canViewReports,
  canManagePlanning,
  canManageRecurringTemplates,
  canManageRecurringBatches,
} from "./roles";

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

describe("canManageRecurringTemplates", () => {
  it("only lets an admin manage the templates", () => {
    expect(canManageRecurringTemplates("ADMIN")).toBe(true);
    expect(canManageRecurringTemplates("FINANCE")).toBe(false);
    expect(canManageRecurringTemplates("TEAMLEAD")).toBe(false);
    expect(canManageRecurringTemplates("EMPLOYEE")).toBe(false);
  });
});

describe("canManageRecurringBatches", () => {
  it("lets an admin and a team lead start and finish a batch", () => {
    expect(canManageRecurringBatches("ADMIN")).toBe(true);
    expect(canManageRecurringBatches("TEAMLEAD")).toBe(true);
  });

  it("keeps everyone else out", () => {
    expect(canManageRecurringBatches("FINANCE")).toBe(false);
    expect(canManageRecurringBatches("EMPLOYEE")).toBe(false);
    expect(canManageRecurringBatches("ONBEKEND")).toBe(false);
  });
});
