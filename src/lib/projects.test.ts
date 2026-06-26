import { describe, it, expect } from "vitest";
import { projectCreateDenialReason } from "./projects";

describe("projects", () => {
  it("admins may create anything (active with customer)", () => {
    expect(projectCreateDenialReason("ADMIN", { status: "ACTIVE", customerId: "c1" })).toBeNull();
  });
  it("admins may create anything (concept)", () => {
    expect(projectCreateDenialReason("ADMIN", { status: "CONCEPT" })).toBeNull();
  });
  it("employees may create a bare concept project", () => {
    expect(projectCreateDenialReason("EMPLOYEE", { status: "CONCEPT" })).toBeNull();
  });
  it("employees may not create non-concept projects", () => {
    expect(projectCreateDenialReason("EMPLOYEE", { status: "ACTIVE" })).toBeTruthy();
  });
  it("employees may not attach a customer to a concept project", () => {
    expect(projectCreateDenialReason("EMPLOYEE", { status: "CONCEPT", customerId: "c1" })).toBeTruthy();
  });
  it("employees may not set defaultHourlyRate on a concept project", () => {
    expect(projectCreateDenialReason("EMPLOYEE", { status: "CONCEPT", defaultHourlyRate: 80 })).toBeTruthy();
  });
  it("employees may not set defaultKmRate on a concept project", () => {
    expect(projectCreateDenialReason("EMPLOYEE", { status: "CONCEPT", defaultKmRate: 0.23 })).toBeTruthy();
  });
  it("FINANCE is not admin -> same restriction as employees", () => {
    expect(projectCreateDenialReason("FINANCE", { status: "ACTIVE", customerId: "c1" })).toBeTruthy();
  });
});
