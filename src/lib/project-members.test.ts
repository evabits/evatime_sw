import { describe, it, expect } from "vitest";
import { isProjectMember, membershipCheckNeeded } from "./project-members";

describe("isProjectMember", () => {
  it("is false for an empty member list", () => {
    expect(isProjectMember([], "u1")).toBe(false);
  });

  it("is false for someone who is not on the list", () => {
    expect(isProjectMember(["u1", "u2"], "u3")).toBe(false);
  });

  it("is true for someone who is", () => {
    expect(isProjectMember(["u1", "u2"], "u2")).toBe(true);
  });

  it("is false for a missing owner, even when the list is not empty", () => {
    // Een ontbrekende eigenaar mag nooit per ongeluk toegang geven.
    expect(isProjectMember(["u1"], null)).toBe(false);
    expect(isProjectMember(["u1"], undefined)).toBe(false);
    expect(isProjectMember(["u1"], "")).toBe(false);
  });
});

describe("membershipCheckNeeded", () => {
  const next = { projectId: "p1", userId: "u1" };

  it("always checks on create", () => {
    expect(membershipCheckNeeded(null, next)).toBe(true);
  });

  it("does not check when neither project nor owner changed", () => {
    // Anders wordt historie onbewerkbaar: een oude regel van iemand die nooit
    // deelnemer was, zou je niet eens van omschrijving kunnen wijzigen.
    expect(membershipCheckNeeded({ projectId: "p1", userId: "u1" }, next)).toBe(false);
  });

  it("checks when the entry moves to another project", () => {
    expect(membershipCheckNeeded({ projectId: "p2", userId: "u1" }, next)).toBe(true);
  });

  it("checks when the entry is reassigned to another employee", () => {
    expect(membershipCheckNeeded({ projectId: "p1", userId: "u2" }, next)).toBe(true);
  });

  it("checks when both changed", () => {
    expect(membershipCheckNeeded({ projectId: "p2", userId: "u2" }, next)).toBe(true);
  });

  it("checks when an expense gains a project it did not have", () => {
    expect(membershipCheckNeeded({ projectId: null, userId: "u1" }, next)).toBe(true);
  });
});
