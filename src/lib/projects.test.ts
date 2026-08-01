import { describe, it, expect } from "vitest";
import { projectCreateDenialReason, partitionProjectsByCustomer } from "./projects";

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

describe("partitionProjectsByCustomer", () => {
  const p = (id: string, customerId: string | null) => ({
    id,
    customer: customerId ? { id: customerId } : null,
  });

  it("no customer selected: splits into projects-with-customer and customerless", () => {
    const projects = [p("a", "c1"), p("b", null), p("c", "c2")];
    const { matched, customerless } = partitionProjectsByCustomer(projects, "");
    expect(matched.map((x) => x.id)).toEqual(["a", "c"]);
    expect(customerless.map((x) => x.id)).toEqual(["b"]);
  });

  it("customer selected: matched is that customer's projects, customerless always included", () => {
    const projects = [p("a", "c1"), p("b", null), p("c", "c2")];
    const { matched, customerless } = partitionProjectsByCustomer(projects, "c1");
    expect(matched.map((x) => x.id)).toEqual(["a"]);
    expect(customerless.map((x) => x.id)).toEqual(["b"]);
  });

  it("customerless is empty when every project has a customer", () => {
    const projects = [p("a", "c1"), p("c", "c2")];
    const { customerless } = partitionProjectsByCustomer(projects, "c1");
    expect(customerless).toEqual([]);
  });
});
