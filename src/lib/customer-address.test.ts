import { describe, it, expect } from "vitest";
import { customerAddressLines } from "./customer-address";

const klant = {
  name: "Acquaint B.V.",
  attention: "Afdeling Inkoop",
  address: "Hoofdstraat 12",
  postalCode: "7411 AB",
  city: "Deventer",
  country: "Nederland",
};

describe("customerAddressLines", () => {
  it("puts the attention line under the name and above the address", () => {
    expect(customerAddressLines(klant)).toEqual([
      "Acquaint B.V.",
      "T.a.v. Afdeling Inkoop",
      "Hoofdstraat 12",
      "7411 AB Deventer",
      "Nederland",
    ]);
  });

  it("leaves the attention line out when nobody is named", () => {
    // En het adres blijft gewoon staan — dat was juist wat er misging toen de
    // straatnaam zelf achter "T.a.v." belandde.
    expect(customerAddressLines({ ...klant, attention: null })).toEqual([
      "Acquaint B.V.",
      "Hoofdstraat 12",
      "7411 AB Deventer",
      "Nederland",
    ]);
    expect(customerAddressLines({ ...klant, attention: "   " })).not.toContain("T.a.v.    ");
  });

  it("leaves no empty lines for fields that were never filled in", () => {
    expect(customerAddressLines({ name: "Acquaint B.V." })).toEqual(["Acquaint B.V."]);
  });

  it("puts postal code and town on one line, and copes with only one of them", () => {
    expect(customerAddressLines({ name: "X", city: "Deventer" })).toEqual(["X", "Deventer"]);
    expect(customerAddressLines({ name: "X", postalCode: "7411 AB" })).toEqual(["X", "7411 AB"]);
  });

  it("trims what was typed with stray spaces", () => {
    expect(customerAddressLines({ name: "  Acquaint B.V. ", attention: " Jan " })).toEqual([
      "Acquaint B.V.",
      "T.a.v. Jan",
    ]);
  });

  it("gives nothing without a customer", () => {
    expect(customerAddressLines(null)).toEqual([]);
    expect(customerAddressLines(undefined)).toEqual([]);
  });
});
