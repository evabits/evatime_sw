import { describe, it, expect } from "vitest";
import { resolveHourRate, effectiveWorkLevel } from "./rates";

const customerRates = [
  { level: "JUNIOR" as const, rate: 80 },
  { level: "SENIOR" as const, rate: 140 },
];

function entry(over: Record<string, any> = {}) {
  return {
    rateOverride: null,
    workLevel: "SENIOR" as const,
    user: { workLevel: "JUNIOR" as const },
    project: { levelRates: [], customer: { levelRates: customerRates } },
    ...over,
  };
}

describe("effectiveWorkLevel", () => {
  it("prefers the level frozen on the entry", () => {
    expect(effectiveWorkLevel(entry())).toBe("SENIOR");
  });

  it("falls back to the owner's current level when the entry has none", () => {
    expect(effectiveWorkLevel(entry({ workLevel: null }))).toBe("JUNIOR");
  });

  it("is null when neither the entry nor the owner has a level", () => {
    expect(effectiveWorkLevel(entry({ workLevel: null, user: { workLevel: null } }))).toBeNull();
  });
});

describe("resolveHourRate", () => {
  it("lets a manual override win over every level rate", () => {
    expect(resolveHourRate(entry({ rateOverride: 200 }))).toBe(200);
  });

  it("uses the customer rate for the entry's level", () => {
    expect(resolveHourRate(entry())).toBe(140);
  });

  it("lets a project rate override the customer rate for the same level", () => {
    const e = entry({ project: { levelRates: [{ level: "SENIOR", rate: 175 }], customer: { levelRates: customerRates } } });
    expect(resolveHourRate(e)).toBe(175);
  });

  it("falls back to the customer when the project has a rate for a different level only", () => {
    const e = entry({ project: { levelRates: [{ level: "JUNIOR", rate: 90 }], customer: { levelRates: customerRates } } });
    expect(resolveHourRate(e)).toBe(140);
  });

  it("returns null when neither project nor customer has a rate for the level", () => {
    const e = entry({ workLevel: "MEDIOR" });
    expect(resolveHourRate(e)).toBeNull();
  });

  it("returns null when there is no level to resolve", () => {
    expect(resolveHourRate(entry({ workLevel: null, user: { workLevel: null } }))).toBeNull();
  });

  it("does not fall back to a customer rate for a project without a customer", () => {
    const e = entry({ project: { levelRates: [], customer: null } });
    expect(resolveHourRate(e)).toBeNull();
  });

  it("returns null instead of throwing when the rates were not included", () => {
    // Vangnet voor een vergeten Prisma-include: liever een zichtbare
    // "Geen tarief"-badge dan een crash of een stil verkeerd bedrag.
    expect(resolveHourRate({ workLevel: "SENIOR", project: {} })).toBeNull();
    expect(resolveHourRate({ workLevel: "SENIOR" })).toBeNull();
  });

  it("accepts Decimal-shaped string rates from Prisma", () => {
    const e = entry({ project: { levelRates: [{ level: "SENIOR", rate: "175.50" }], customer: null } });
    expect(resolveHourRate(e)).toBe(175.5);
  });

  it("treats an empty-string override as no override", () => {
    expect(resolveHourRate(entry({ rateOverride: "" }))).toBe(140);
  });
});
