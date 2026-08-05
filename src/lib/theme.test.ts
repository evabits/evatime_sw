import { describe, it, expect } from "vitest";
import { resolveTheme, THEME_STORAGE_KEY } from "./theme";

describe("THEME_STORAGE_KEY", () => {
  it("is the key the inline script in layout.tsx also reads", () => {
    expect(THEME_STORAGE_KEY).toBe("theme");
  });
});

describe("resolveTheme", () => {
  it("honours an explicit light choice even when the system is dark", () => {
    expect(resolveTheme("light", true)).toBe("light");
  });

  it("honours an explicit dark choice even when the system is light", () => {
    expect(resolveTheme("dark", false)).toBe("dark");
  });

  it("follows a dark system when the choice is system", () => {
    expect(resolveTheme("system", true)).toBe("dark");
  });

  it("follows a light system when the choice is system", () => {
    expect(resolveTheme("system", false)).toBe("light");
  });

  it("follows the system when nothing is stored yet", () => {
    expect(resolveTheme(null, true)).toBe("dark");
    expect(resolveTheme(null, false)).toBe("light");
  });

  it("follows the system on a value it does not recognise", () => {
    // localStorage is door de gebruiker te bewerken en overleeft een
    // hernoeming van de waarden. Een onbekende waarde mag nooit een leeg of
    // half thema opleveren; hij valt terug op wat het systeem zegt.
    expect(resolveTheme("blauw", true)).toBe("dark");
    expect(resolveTheme("", false)).toBe("light");
  });
});
