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

  it("refuses FINANCE — only ADMIN gets the retroactive override, not every privileged role", () => {
    expect(canCancelAbsence("FINANCE", "u9", aanvraag(), VANDAAG)).toBe("forbidden");
  });

  it("lets an employee cancel leave that starts tomorrow (pins the <= boundary from the other side)", () => {
    expect(canCancelAbsence("EMPLOYEE", "u1", aanvraag({ startDate: "2026-08-07" }), VANDAAG))
      .toBe("ok");
  });

  it("refuses someone else's leave even when it already started (forbidden wins before already-started)", () => {
    expect(canCancelAbsence("EMPLOYEE", "u2", aanvraag({ startDate: "2026-01-01" }), VANDAAG))
      .toBe("forbidden");
  });

  it("refuses a non-admin when startDate is not a plain YYYY-MM-DD string", () => {
    // ISO-timestamp: "2026-08-06T00:00:00.000Z" <= "2026-08-06" is lexicografisch
    // false, dus zonder deze weigering zou verlof dat vandaag begint doorglippen.
    expect(canCancelAbsence("EMPLOYEE", "u1", aanvraag({ startDate: "2026-08-06T00:00:00.000Z" }), VANDAAG))
      .toBe("already-started");
    // Date#toString(): "Mon Aug 10 2026" sorteert lexicografisch boven elk cijfer,
    // dus zonder deze weigering zou zelfs verlof uit het verleden doorglippen.
    expect(canCancelAbsence("EMPLOYEE", "u1", aanvraag({ startDate: "Mon Aug 10 2026" }), VANDAAG))
      .toBe("already-started");
  });

  it("refuses a non-admin when today is not a plain YYYY-MM-DD string", () => {
    expect(canCancelAbsence("EMPLOYEE", "u1", aanvraag(), "2026-08-06T00:00:00.000Z"))
      .toBe("already-started");
  });
});
