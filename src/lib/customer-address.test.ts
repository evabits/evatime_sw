import { describe, it, expect } from "vitest";
import { customerAddressLines, invoiceCustomer, addressOverrideToSave } from "./customer-address";

const klant = {
  name: "Acquaint B.V.",
  attention: "Afdeling Inkoop",
  address: "Hoofdstraat 12",
  postalCode: "7411 AB",
  city: "Deventer",
  country: "Nederland",
};

describe("customerAddressLines met een eigen t.a.v.", () => {
  it("lets the document override the customer's attention line", () => {
    // Een offerte gaat soms naar een andere contactpersoon dan de klantgegevens
    // zeggen, zonder dat die gegevens daarvoor aangepast horen te worden.
    expect(customerAddressLines(klant, "Jan de Vries")).toEqual([
      "Acquaint B.V.",
      "T.a.v. Jan de Vries",
      "Hoofdstraat 12",
      "7411 AB Deventer",
      "Nederland",
    ]);
  });

  it("drops the attention line when the document explicitly clears it", () => {
    // Leeg is een keuze: op déze offerte geen t.a.v.-regel.
    expect(customerAddressLines(klant, "")).not.toContain("T.a.v. Afdeling Inkoop");
    expect(customerAddressLines(klant, "   ")).toEqual([
      "Acquaint B.V.",
      "Hoofdstraat 12",
      "7411 AB Deventer",
      "Nederland",
    ]);
  });

  it("falls back to the customer when the document never set one", () => {
    // null en undefined betekenen "niets ingevuld", niet "geen t.a.v." — anders
    // zouden alle bestaande offertes hun t.a.v.-regel kwijtraken.
    expect(customerAddressLines(klant, null)).toContain("T.a.v. Afdeling Inkoop");
    expect(customerAddressLines(klant, undefined)).toContain("T.a.v. Afdeling Inkoop");
  });
});

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

describe("invoiceCustomer", () => {
  const klant = {
    name: "Zonneplan BV",
    attention: "Inkoop",
    address: "Hoofdstraat 1",
    postalCode: "1234 AB",
    city: "Arnhem",
    country: "Nederland",
    vatNumber: "NL001",
  };

  it("volgt de klantkaart als de factuur niets eigens heeft", () => {
    expect(invoiceCustomer(klant, {})).toMatchObject(klant);
  });

  it("neemt per veld over wat de factuur zelf invult", () => {
    const k = invoiceCustomer(klant, { address: "Zijstraat 9", city: "Nijmegen" });
    expect([k.name, k.address, k.city, k.postalCode]).toEqual([
      "Zonneplan BV", "Zijstraat 9", "Nijmegen", "1234 AB",
    ]);
  });

  it("zet het afwijkende adres ook echt in het adresblok", () => {
    const regels = customerAddressLines(invoiceCustomer(klant, { address: "Zijstraat 9" }), "Afdeling X");
    expect(regels).toContain("Zijstraat 9");
    expect(regels).toContain("T.a.v. Afdeling X");
  });
});

describe("addressOverrideToSave", () => {
  const klant = { name: "Zonneplan BV", attention: "Inkoop", address: "Hoofdstraat 1", postalCode: "1234 AB", city: "Arnhem", country: "Nederland", vatNumber: "NL001" };
  const ongewijzigd = {
    customerName: "Zonneplan BV", attention: "Inkoop", address: "Hoofdstraat 1",
    postalCode: "1234 AB", city: "Arnhem", country: "Nederland", customerVatNumber: "NL001",
  };

  it("slaat niets vast als je niets hebt veranderd", () => {
    expect(Object.values(addressOverrideToSave(klant, ongewijzigd)).every((v) => v === null)).toBe(true);
  });

  it("bewaart alleen het veld dat afwijkt", () => {
    const s = addressOverrideToSave(klant, { ...ongewijzigd, city: "Nijmegen " });
    expect(s.city).toBe("Nijmegen");
    expect(s.address).toBeNull();
  });

  it("bewaart een bewust leeggemaakte t.a.v. als lege tekst", () => {
    expect(addressOverrideToSave(klant, { ...ongewijzigd, attention: "" }).attention).toBe("");
  });
});
