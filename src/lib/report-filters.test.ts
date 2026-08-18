import { describe, it, expect } from "vitest";
import { projectWhereForRequiredProject, projectWhereForOptionalProject, invoicedWhere } from "./report-filters";

const none = { projectId: null, customerId: null, tagIds: [], billable: null };

describe("projectWhereForRequiredProject (uren, ritten)", () => {
  it("returns no project key at all when nothing is filtered", () => {
    expect(projectWhereForRequiredProject(none)).toEqual({});
  });

  it("projectId wins outright and ignores customer/tags", () => {
    expect(projectWhereForRequiredProject({ ...none, projectId: "p1", customerId: "c1", tagIds: ["t1"] })).toEqual({ projectId: "p1" });
  });

  it("combines projectId with billable", () => {
    expect(projectWhereForRequiredProject({ ...none, projectId: "p1", billable: "true" })).toEqual({ projectId: "p1", project: { billable: true } });
    expect(projectWhereForRequiredProject({ ...none, projectId: "p1", billable: "false" })).toEqual({ projectId: "p1", project: { billable: false } });
  });

  it("combines customer, tags and billable into one project condition, not two colliding spreads", () => {
    const where = projectWhereForRequiredProject({ ...none, customerId: "c1", tagIds: ["t1", "t2"], billable: "true" });
    expect(where).toEqual({
      project: { customerId: "c1", tags: { some: { id: { in: ["t1", "t2"] } } }, billable: true },
    });
  });

  it("never adds an OR / projectId: null branch — the FK is required", () => {
    const where = projectWhereForRequiredProject({ ...none, customerId: "c1", billable: "false" });
    expect(where).toEqual({ project: { customerId: "c1", billable: false } });
    expect(where).not.toHaveProperty("OR");
  });
});

describe("projectWhereForOptionalProject (uitgaven)", () => {
  it("returns no project key at all when nothing is filtered", () => {
    expect(projectWhereForOptionalProject(none)).toEqual({});
  });

  it("billable=false with no customer/tag filter also matches project-less expenses", () => {
    const where = projectWhereForOptionalProject({ ...none, billable: "false" });
    expect(where).toEqual({ OR: [{ project: { billable: false } }, { projectId: null }] });
  });

  it("billable=false WITH a customer filter does not fall back to project-less expenses", () => {
    // A project-less expense has no customer to match, so it must not
    // resurface just because billable=false is also requested.
    const where = projectWhereForOptionalProject({ ...none, customerId: "c1", billable: "false" });
    expect(where).toEqual({ project: { customerId: "c1", billable: false } });
    expect(where).not.toHaveProperty("OR");
  });

  it("billable=false WITH a tag filter does not fall back to project-less expenses either", () => {
    const where = projectWhereForOptionalProject({ ...none, tagIds: ["t1"], billable: "false" });
    expect(where).toEqual({ project: { tags: { some: { id: { in: ["t1"] } } }, billable: false } });
    expect(where).not.toHaveProperty("OR");
  });

  it("billable=true never includes project-less expenses (they can never be billable)", () => {
    const where = projectWhereForOptionalProject({ ...none, billable: "true" });
    expect(where).toEqual({ project: { billable: true } });
    expect(where).not.toHaveProperty("OR");
  });

  it("projectId wins outright, same as the required-project variant", () => {
    expect(projectWhereForOptionalProject({ ...none, projectId: "p1", customerId: "c1", billable: "false" })).toEqual({
      projectId: "p1", project: { billable: false },
    });
  });
});

describe("invoicedWhere", () => {
  it("filters nothing when no choice is made", () => {
    expect(invoicedWhere(null)).toEqual({});
    expect(invoicedWhere("")).toEqual({});
    expect(invoicedWhere(undefined)).toEqual({});
  });

  it("filters on invoiced and on not invoiced", () => {
    expect(invoicedWhere("true")).toEqual({ invoiced: true });
    expect(invoicedWhere("false")).toEqual({ invoiced: false });
  });

  it("ignores anything else instead of guessing", () => {
    // Een onbekende waarde in de URL mag geen half filter opleveren; dan
    // liever alles tonen dan stilzwijgend de helft weglaten.
    expect(invoicedWhere("ja")).toEqual({});
  });

  it("stays out of the project condition, so it combines with billable", () => {
    // De twee filters grijpen op verschillende plekken aan: dit is de
    // combinatie "factureerbaar maar nog niet gefactureerd".
    const where = {
      ...projectWhereForRequiredProject({ ...none, billable: "true" }),
      ...invoicedWhere("false"),
    };
    expect(where).toEqual({ project: { billable: true }, invoiced: false });
  });
});
