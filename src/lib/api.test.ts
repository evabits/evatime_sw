import { describe, it, expect } from "vitest";
import { zodErrorMessage } from "./api";

describe("zodErrorMessage", () => {
  it("noemt het veld dat fout is", () => {
    expect(zodErrorMessage([{ path: ["lines", 0, "unitPrice"] }])).toBe(
      "Controleer de invoer: lines.0.unitPrice",
    );
  });

  it("noemt elk veld eenmaal", () => {
    expect(
      zodErrorMessage([
        { path: ["customerId"] },
        { path: ["vatRate"] },
        { path: ["customerId"] },
      ]),
    ).toBe("Controleer de invoer: customerId, vatRate");
  });

  it("valt terug op een kale melding als er geen pad is", () => {
    expect(zodErrorMessage([{ path: [] }])).toBe("Controleer de invoer");
  });
});
