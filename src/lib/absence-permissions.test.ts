import { describe, it, expect } from "vitest";
import { canCancelAbsence } from "./absence-permissions";

const VANDAAG = "2026-08-06";
const aanvraag = (over: Partial<{ userId: string; status: string; startDate: string }> = {}) => ({
  userId: "u1",
  status: "APPROVED",
  startDate: "2026-08-10",
  ...over,
});

describe("canCancelAbsence", () => {
  it("lets an employee cancel their own approved leave that has not started", () => {
    expect(canCancelAbsence("EMPLOYEE", "u1", aanvraag(), VANDAAG)).toBe("ok");
  });

  it("refuses leave that starts today, because that day is already running", () => {
    expect(canCancelAbsence("EMPLOYEE", "u1", aanvraag({ startDate: VANDAAG }), VANDAAG))
      .toBe("already-started");
  });

  it("refuses leave that started in the past", () => {
    expect(canCancelAbsence("EMPLOYEE", "u1", aanvraag({ startDate: "2026-07-01" }), VANDAAG))
      .toBe("already-started");
  });

  it("refuses someone else's leave", () => {
    expect(canCancelAbsence("EMPLOYEE", "u2", aanvraag(), VANDAAG)).toBe("forbidden");
  });

  it("refuses a request that is not approved", () => {
    // Een aanvraag in afwachting verwijder je, die trek je niet in.
    expect(canCancelAbsence("EMPLOYEE", "u1", aanvraag({ status: "PENDING" }), VANDAAG))
      .toBe("not-approved");
    expect(canCancelAbsence("EMPLOYEE", "u1", aanvraag({ status: "CANCELLED" }), VANDAAG))
      .toBe("not-approved");
  });

  it("lets an admin cancel anyone's approved leave, including in the past", () => {
    expect(canCancelAbsence("ADMIN", "u9", aanvraag({ startDate: "2026-01-05" }), VANDAAG))
      .toBe("ok");
  });

  it("still refuses an admin on a request that is not approved", () => {
    expect(canCancelAbsence("ADMIN", "u9", aanvraag({ status: "REJECTED" }), VANDAAG))
      .toBe("not-approved");
  });

  it("reports a missing request", () => {
    expect(canCancelAbsence("ADMIN", "u9", null, VANDAAG)).toBe("not-found");
  });
});
