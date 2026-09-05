import { describe, it, expect } from "vitest";
import { meldingenVoor } from "./meldingen";

const GEEN = { review: null, uren: null };

describe("meldingenVoor", () => {
  it("zwijgt als er niets te doen is", () => {
    expect(meldingenVoor(GEEN)).toEqual([]);
  });

  it("meldt een openstaande zelfreflectie", () => {
    const [m] = meldingenVoor({ ...GEEN, review: { period: "2026-Q3", status: "PLANNED" } });
    expect(m.tekst).toContain("2026-Q3");
    expect(m.href).toBe("/beoordelingen");
  });

  it("zwijgt over een ingediende zelfreflectie", () => {
    // Na het indienen ligt de bal bij de leidinggevende.
    expect(meldingenVoor({ ...GEEN, review: { period: "2026-Q3", status: "SELF_COMPLETED" } })).toEqual([]);
  });

  it("meldt onvolledige uren met beide getallen erbij", () => {
    const [m] = meldingenVoor({ ...GEEN, uren: { geboekt: 12.5, doel: 24 } });
    expect(m.tekst).toBe("Je uren van deze week zijn niet compleet: 12,5 van 24 uur geboekt");
    expect(m.href).toBe("/time");
  });

  it("zwijgt als de uren compleet zijn", () => {
    expect(meldingenVoor({ ...GEEN, uren: { geboekt: 24, doel: 24 } })).toEqual([]);
    expect(meldingenVoor({ ...GEEN, uren: { geboekt: 30, doel: 24 } })).toEqual([]);
  });

  it("zwijgt op maandag, wanneer er nog niets verwacht wordt", () => {
    // Doel nul: alles wat je dan boekt is vooruitwerken, geen achterstand.
    expect(meldingenVoor({ ...GEEN, uren: { geboekt: 0, doel: 0 } })).toEqual([]);
  });

  it("zwijgt over uren voor wie geen rooster en geen weekuren heeft", () => {
    expect(meldingenVoor({ ...GEEN, uren: null })).toEqual([]);
  });

  it("toont beide meldingen tegelijk", () => {
    const m = meldingenVoor({
      review: { period: "2026-Q3", status: "PLANNED" },
      uren: { geboekt: 0, doel: 8 },
    });
    expect(m.map((x) => x.id)).toEqual(["zelfreflectie", "uren"]);
  });
});
