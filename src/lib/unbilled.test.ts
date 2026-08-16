import { describe, it, expect } from "vitest";
import { firstOfMonth, unbilledByCustomer } from "./unbilled";

const medusa = { id: "c1", name: "MedusaRadiometrics" };
const zonneplan = { id: "c2", name: "Zonneplan" };
const rij = (datum: string, klant: { id: string; name: string }) => ({
  date: datum,
  project: { customer: klant },
});

describe("firstOfMonth", () => {
  it("gives the first of the month the date falls in", () => {
    expect(firstOfMonth("2026-08-16")).toBe("2026-08-01");
    expect(firstOfMonth("2026-01-01")).toBe("2026-01-01");
  });
});

describe("unbilledByCustomer", () => {
  it("groups per customer and keeps the oldest date", () => {
    expect(
      unbilledByCustomer([
        rij("2026-07-29", medusa),
        rij("2026-05-11", medusa),
        rij("2026-06-02", medusa),
      ]),
    ).toEqual([{ customerId: "c1", name: "MedusaRadiometrics", since: "2026-05-11", count: 3 }]);
  });

  it("puts the customer that has waited longest on top", () => {
    const lijst = unbilledByCustomer([rij("2026-07-29", zonneplan), rij("2026-05-11", medusa)]);
    expect(lijst.map((k) => k.name)).toEqual(["MedusaRadiometrics", "Zonneplan"]);
  });

  it("sorts on name when two customers wait since the same day", () => {
    // Zonder deze tweede sleutel wisselt de volgorde tussen twee verversingen.
    const lijst = unbilledByCustomer([rij("2026-05-11", zonneplan), rij("2026-05-11", medusa)]);
    expect(lijst.map((k) => k.name)).toEqual(["MedusaRadiometrics", "Zonneplan"]);
  });

  it("leaves out work that belongs to no customer", () => {
    expect(unbilledByCustomer([{ date: "2026-05-11", project: { customer: null } }])).toEqual([]);
    expect(unbilledByCustomer([{ date: "2026-05-11", project: null }])).toEqual([]);
    expect(unbilledByCustomer([{ date: "2026-05-11" }])).toEqual([]);
  });

  it("reads a Date the same way as a string", () => {
    const lijst = unbilledByCustomer([
      { date: new Date("2026-05-11T00:00:00Z"), project: { customer: medusa } },
    ]);
    expect(lijst[0].since).toBe("2026-05-11");
  });

  it("gives nothing when everything has been invoiced", () => {
    expect(unbilledByCustomer([])).toEqual([]);
  });
});
