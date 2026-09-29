import { describe, it, expect } from "vitest";
import { variantChanges, variantDenial } from "./recurring-variants";

describe("variantDenial", () => {
  const twee = [{ name: "SaltBuddies" }, { name: "Slim Smart Watches" }];

  it("laat varianten toe bij een stuksprijs zonder goed- en afkeur", () => {
    expect(variantDenial(twee, "PER_UNIT", false)).toBeNull();
  });

  it("weigert varianten naast goed- en afkeur", () => {
    expect(variantDenial(twee, "PER_UNIT", true)).toMatch(/niet allebei/);
  });

  it("weigert varianten bij een vast bedrag of op uren", () => {
    expect(variantDenial(twee, "FIXED", false)).toMatch(/per stuk/);
    expect(variantDenial(twee, "HOURS", false)).toMatch(/per stuk/);
  });

  it("laat een sjabloon zonder varianten met rust", () => {
    expect(variantDenial([], "FIXED", true)).toBeNull();
  });

  it("weigert een naamloze of dubbele variant", () => {
    expect(variantDenial([{ name: "  " }], "PER_UNIT", false)).toMatch(/naam/);
    expect(variantDenial([{ name: "A" }, { name: "a" }], "PER_UNIT", false)).toMatch(/dezelfde naam/);
  });
});

describe("variantChanges", () => {
  const bestaand = [
    { id: "v1", name: "SaltBuddies", sortOrder: 0 },
    { id: "v2", name: "SSW", sortOrder: 1 },
  ];

  it("ziet een hernoeming", () => {
    const c = variantChanges(bestaand, [{ id: "v1", name: "SaltBuddies" }, { id: "v2", name: "Slim Smart Watches" }]);
    expect(c.bijwerken).toEqual([{ id: "v2", name: "Slim Smart Watches", sortOrder: 1 }]);
    expect(c.toevoegen).toEqual([]);
    expect(c.verwijderen).toEqual([]);
  });

  it("ziet een nieuwe variant en een verwijderde", () => {
    const c = variantChanges(bestaand, [{ id: "v1", name: "SaltBuddies" }, { name: "Testkabels" }]);
    expect(c.toevoegen).toEqual([{ name: "Testkabels", sortOrder: 1 }]);
    expect(c.verwijderen).toEqual(["v2"]);
  });

  it("ziet een gewijzigde volgorde", () => {
    const c = variantChanges(bestaand, [{ id: "v2", name: "SSW" }, { id: "v1", name: "SaltBuddies" }]);
    expect(c.bijwerken).toEqual([
      { id: "v2", name: "SSW", sortOrder: 0 },
      { id: "v1", name: "SaltBuddies", sortOrder: 1 },
    ]);
  });

  it("doet niets als er niets verandert", () => {
    const c = variantChanges(bestaand, [{ id: "v1", name: "SaltBuddies" }, { id: "v2", name: "SSW" }]);
    expect([c.bijwerken, c.toevoegen, c.verwijderen]).toEqual([[], [], []]);
  });
});
