import { describe, it, expect } from "vitest";
import { customerMailCopy } from "./mail-copy";

describe("customerMailCopy", () => {
  it("sends a blind copy to the company address and points replies there too", () => {
    expect(customerMailCopy({ email: "administratie@evabits.com" })).toEqual({
      bcc: "administratie@evabits.com",
      replyTo: "administratie@evabits.com",
    });
  });

  it("adds nothing when there is no company address", () => {
    // Een lege bcc laat de verzending mislukken; dan liever geen kopie dan
    // geen factuur.
    expect(customerMailCopy({ email: null })).toEqual({});
    expect(customerMailCopy({ email: "" })).toEqual({});
    expect(customerMailCopy({ email: "   " })).toEqual({});
    expect(customerMailCopy(null)).toEqual({});
    expect(customerMailCopy(undefined)).toEqual({});
  });

  it("trims an address that was typed with stray spaces", () => {
    expect(customerMailCopy({ email: " post@evabits.com " })).toEqual({
      bcc: "post@evabits.com",
      replyTo: "post@evabits.com",
    });
  });
});
