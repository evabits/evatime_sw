import { describe, it, expect } from "vitest";
import {
  mayWrite,
  startImpersonation,
  stopImpersonation,
  IMPERSONATION_PAD,
  type SessieToken,
} from "./impersonation";

const beheerder: SessieToken = {
  id: "admin1", role: "ADMIN", name: "Arjen", email: "arjen@evabits.com",
};
const merlijn = { id: "u2", role: "EMPLOYEE", name: "Merlijn", email: "merlijn@evabits.com" };
const paul = { id: "u3", role: "EMPLOYEE", name: "Paul", email: "paul@evabits.com" };

describe("mayWrite", () => {
  it("allows anything when not looking on", () => {
    expect(mayWrite("POST", "/api/time", false)).toBe(true);
    expect(mayWrite("DELETE", "/api/time/1", false)).toBe(true);
  });

  it("allows a GET while looking on", () => {
    expect(mayWrite("GET", "/api/time", true)).toBe(true);
    expect(mayWrite("HEAD", "/time", true)).toBe(true);
  });

  it("refuses a POST while looking on", () => {
    expect(mayWrite("POST", "/api/time", true)).toBe(false);
  });

  it("refuses PUT, PATCH and DELETE just the same", () => {
    expect(mayWrite("PUT", "/api/time/1", true)).toBe(false);
    expect(mayWrite("PATCH", "/api/time/1", true)).toBe(false);
    expect(mayWrite("DELETE", "/api/time/1", true)).toBe(false);
  });

  it("refuses a POST to a page, which is how a server action arrives", () => {
    expect(mayWrite("POST", "/time", true)).toBe(false);
  });

  it("lets the route that switches it off through", () => {
    // Anders kom je er niet meer uit.
    expect(mayWrite("POST", IMPERSONATION_PAD, true)).toBe(true);
  });

  it("does not let a path that merely starts with the same text through", () => {
    // /api/impersonateer bestaat niet, maar een prefixvergelijking zonder
    // grens zou hem toelaten.
    expect(mayWrite("POST", `${IMPERSONATION_PAD}er`, true)).toBe(false);
  });
});

describe("startImpersonation", () => {
  it("swaps the identity and remembers who you really are", () => {
    expect(startImpersonation(beheerder, merlijn)).toEqual({
      id: "u2", role: "EMPLOYEE", name: "Merlijn", email: "merlijn@evabits.com",
      realId: "admin1", realRole: "ADMIN", realName: "Arjen", realEmail: "arjen@evabits.com",
    });
  });

  it("refuses when the real role is not ADMIN", () => {
    const medewerker: SessieToken = { id: "u2", role: "EMPLOYEE", name: "Merlijn", email: "m@x.nl" };
    expect(startImpersonation(medewerker, paul)).toBeNull();
  });

  it("refuses when the impersonated role is ADMIN but the real one is not", () => {
    // Wie meekijkt met een beheerder heeft ADMIN in role staan. Alleen realRole
    // telt, anders kan een medewerker zich omhoog werken zodra hij ooit
    // meekeek met een beheerder.
    const geleend: SessieToken = {
      id: "admin1", role: "ADMIN", name: "Arjen", email: "a@x.nl",
      realId: "u2", realRole: "EMPLOYEE", realName: "Merlijn", realEmail: "m@x.nl",
    };
    expect(startImpersonation(geleend, paul)).toBeNull();
  });

  it("keeps the original real identity when switching to another employee", () => {
    const bijMerlijn = startImpersonation(beheerder, merlijn)!;
    const bijPaul = startImpersonation(bijMerlijn, paul)!;
    expect(bijPaul.id).toBe("u3");
    expect(bijPaul.realId).toBe("admin1");
    expect(bijPaul.realName).toBe("Arjen");
  });
});

describe("stopImpersonation", () => {
  it("puts everything back and leaves no real fields behind", () => {
    const bijMerlijn = startImpersonation(beheerder, merlijn)!;
    expect(stopImpersonation(bijMerlijn)).toEqual(beheerder);
  });

  it("changes nothing when you were not looking on", () => {
    expect(stopImpersonation(beheerder)).toEqual(beheerder);
  });
});
