import { describe, it, expect } from "vitest";
import { nextCustomerNumber } from "./customer-number";

describe("nextCustomerNumber", () => {
  it("starts at one when no customer has a number yet", () => {
    expect(nextCustomerNumber([])).toBe("1");
    expect(nextCustomerNumber([null, undefined, "", "  "])).toBe("1");
  });

  it("counts on from the highest", () => {
    expect(nextCustomerNumber(["1", "2", "3"])).toBe("4");
  });

  it("compares as numbers, not as words", () => {
    // Als tekst is "9" groter dan "10"; dan zou hij op 10 blijven hangen.
    expect(nextCustomerNumber(["9", "10"])).toBe("11");
  });

  it("keeps the width of a padded number", () => {
    expect(nextCustomerNumber(["007"])).toBe("008");
    expect(nextCustomerNumber(["0001", "0002"])).toBe("0003");
  });

  it("lets the number outgrow its padding instead of truncating", () => {
    expect(nextCustomerNumber(["99"])).toBe("100");
  });

  it("ignores numbers that are not purely digits", () => {
    // Bij een eigen schema doet hij geen voorstel over de reeks, maar de
    // gewone nummers ernaast tellen wel gewoon door.
    expect(nextCustomerNumber(["ACQ-01", "ZON-05", "12"])).toBe("13");
  });

  it("gives the first number when every entry follows a scheme of its own", () => {
    expect(nextCustomerNumber(["ACQ-01", "ZON-05"])).toBe("1");
  });

  it("ignores stray spaces around a number", () => {
    expect(nextCustomerNumber([" 42 "])).toBe("43");
  });
});
