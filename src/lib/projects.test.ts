import { describe, it, expect } from "vitest";
import {
  projectCreateDenialReason,
  partitionProjectsByCustomer,
  projectMergeDenialReason,
} from "./projects";

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
  it("employees may not set levelRates on a concept project", () => {
    expect(
      projectCreateDenialReason("EMPLOYEE", { status: "CONCEPT", levelRates: [{ level: "JUNIOR", rate: 80 }] }),
    ).toBeTruthy();
  });
  it("employees may not set defaultKmRate on a concept project", () => {
    expect(projectCreateDenialReason("EMPLOYEE", { status: "CONCEPT", defaultKmRate: 0.23 })).toBeTruthy();
  });
  it("refuses a concept project with level rates from a non-admin", () => {
    expect(
      projectCreateDenialReason("EMPLOYEE", {
        status: "CONCEPT",
        levelRates: [{ level: "SENIOR", rate: 140 }],
      }),
    ).toBe("Een conceptproject kan geen tarieven hebben");
  });
  it("FINANCE is not admin -> same restriction as employees", () => {
    expect(projectCreateDenialReason("FINANCE", { status: "ACTIVE", customerId: "c1" })).toBeTruthy();
  });
  it("employees may not set billable: false on a concept project", () => {
    expect(
      projectCreateDenialReason("EMPLOYEE", { status: "CONCEPT", billable: false }),
    ).toBe("Medewerkers kunnen factureerbaarheid niet aanpassen");
  });
  it("employees may create a concept project with billable: true (matches the default)", () => {
    expect(projectCreateDenialReason("EMPLOYEE", { status: "CONCEPT", billable: true })).toBeNull();
  });
  it("employees may not set memberIds on a concept project", () => {
    expect(
      projectCreateDenialReason("EMPLOYEE", { status: "CONCEPT", memberIds: ["u1"] }),
    ).toBe("Medewerkers kunnen geen deelnemers toewijzen bij het aanmaken van een project");
  });
  it("employees may create a concept project with an empty memberIds", () => {
    expect(projectCreateDenialReason("EMPLOYEE", { status: "CONCEPT", memberIds: [] })).toBeNull();
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

describe("projectMergeDenialReason", () => {
  const concept = { id: "p1", status: "CONCEPT", archivedAt: null };
  const doel = { id: "p2", status: "ACTIVE", archivedAt: null };
  const schoon = { timeEntries: 0, kmEntries: 0, expenses: 0 };

  it("allows merging a bare concept project into an active one", () => {
    expect(projectMergeDenialReason(concept, doel, schoon)).toBeNull();
  });

  it("allows a concept project as the target too", () => {
    // Twee mensen die hetzelfde aanvragen is een reeel geval.
    expect(
      projectMergeDenialReason(concept, { id: "p3", status: "CONCEPT", archivedAt: null }, schoon),
    ).toBeNull();
  });

  it("refuses a missing source", () => {
    expect(projectMergeDenialReason(null, doel, schoon)).toBe("Het bronproject bestaat niet");
  });

  it("refuses a missing target", () => {
    expect(projectMergeDenialReason(concept, null, schoon)).toBe("Het doelproject bestaat niet");
  });

  it("refuses merging a project with itself", () => {
    expect(projectMergeDenialReason(concept, concept, schoon)).toBe(
      "Een project kan niet met zichzelf worden samengevoegd",
    );
  });

  it("refuses a source that is not a concept project", () => {
    // Twee echte projecten samenvoegen raakt facturatie en tarieven.
    expect(projectMergeDenialReason({ ...concept, status: "ACTIVE" }, doel, schoon)).toBe(
      "Alleen een conceptproject kan worden samengevoegd",
    );
  });

  it("refuses an archived source", () => {
    expect(
      projectMergeDenialReason({ ...concept, archivedAt: new Date("2026-01-01") }, doel, schoon),
    ).toBe("Een gearchiveerd project kan niet worden samengevoegd");
  });

  it("refuses an archived target", () => {
    expect(
      projectMergeDenialReason(concept, { ...doel, archivedAt: new Date("2026-01-01") }, schoon),
    ).toBe("Het doelproject is gearchiveerd");
  });

  it("refuses when hours are already invoiced", () => {
    expect(projectMergeDenialReason(concept, doel, { ...schoon, timeEntries: 1 })).toBe(
      "Er staan gefactureerde uren op dit project",
    );
  });

  it("refuses when kilometres are already invoiced", () => {
    expect(projectMergeDenialReason(concept, doel, { ...schoon, kmEntries: 1 })).toBe(
      "Er staan gefactureerde kilometers op dit project",
    );
  });

  it("refuses when expenses are already invoiced", () => {
    expect(projectMergeDenialReason(concept, doel, { ...schoon, expenses: 1 })).toBe(
      "Er staan gefactureerde uitgaven op dit project",
    );
  });
});
