import { describe, it, expect } from "vitest";
import { accruedVacationHours, contractVacationHours, fillBudgets, toContractVacation, vacationBalance } from "./vacation-budget";

const lopend = { startDate: "2020-01-01", endDate: null, vacationHours: 160 };

describe("contractVacationHours", () => {
  it("takes the hours of the contract in force at the end of the year", () => {
    expect(contractVacationHours([lopend], 2026)).toBe(160);
  });

  it("prefers the later contract when two of them cover the year", () => {
    const oud = { startDate: "2020-01-01", endDate: "2026-06-30", vacationHours: 160 };
    const nieuw = { startDate: "2026-07-01", endDate: null, vacationHours: 200 };
    expect(contractVacationHours([oud, nieuw], 2026)).toBe(200);
  });

  it("falls back to the last contract that overlapped the year", () => {
    // Contract liep in augustus af en er kwam niets voor terug: over dat jaar
    // had hij wel degelijk vakantie-uren.
    const afgelopen = { startDate: "2020-01-01", endDate: "2026-08-31", vacationHours: 160 };
    expect(contractVacationHours([afgelopen], 2026)).toBe(160);
  });

  it("ignores a contract that ended before the year began", () => {
    const oud = { startDate: "2019-01-01", endDate: "2025-12-31", vacationHours: 160 };
    expect(contractVacationHours([oud], 2026)).toBeNull();
  });

  it("gives nothing when the contract leaves the field empty", () => {
    expect(contractVacationHours([{ ...lopend, vacationHours: null }], 2026)).toBeNull();
  });

  it("gives nothing without any contract", () => {
    expect(contractVacationHours([], 2026)).toBeNull();
  });

  it("does not look past the contract in force, even when an older one has a number", () => {
    // Het geldende contract zwijgt over vakantie-uren. Dan is er geen afspraak,
    // en een ouder contract erbij halen zou een verlopen afspraak laten
    // doorwerken.
    const oud = { startDate: "2020-01-01", endDate: "2025-12-31", vacationHours: 160 };
    const nieuw = { startDate: "2026-01-01", endDate: null, vacationHours: null };
    expect(contractVacationHours([oud, nieuw], 2026)).toBeNull();
  });
});

describe("accruedVacationHours", () => {
  const contract = [{ startDate: "2020-01-01", endDate: null, vacationHours: 200 }];

  it("gives only this year's entitlement when there is no opening balance", () => {
    expect(accruedVacationHours(contract, [], null, 2026)).toBe(200);
  });

  it("gives nought when neither a budget row nor a contract says anything", () => {
    expect(accruedVacationHours([], [], null, 2026)).toBe(0);
  });

  it("adds the part of the opening year that falls after the reference date", () => {
    // 1 juli t/m 31 december is 184 van de 365 dagen: 200 × 184/365 = 100,82.
    const opening = { date: "2026-07-01", hours: 40 };
    expect(accruedVacationHours(contract, [], opening, 2026)).toBe(140.82);
  });

  it("counts the whole year when the reference date is 1 January", () => {
    const opening = { date: "2026-01-01", hours: 0 };
    expect(accruedVacationHours(contract, [], opening, 2026)).toBe(200);
  });

  it("counts a leap year by its 366 days", () => {
    // 1 juli 2028 t/m 31 december is 184 van de 366 dagen.
    const opening = { date: "2028-07-01", hours: 0 };
    expect(accruedVacationHours(contract, [], opening, 2028)).toBe(100.55);
  });

  it("stacks the years after the opening year in full", () => {
    const opening = { date: "2026-07-01", hours: 0 };
    // 100,82 over 2026 plus 200 over 2027 en nog eens 200 over 2028.
    expect(accruedVacationHours(contract, [], opening, 2028)).toBe(500.82);
  });

  it("stops accruing once the contract has run out", () => {
    const aflopend = [{ startDate: "2020-01-01", endDate: "2027-06-30", vacationHours: 200 }];
    const opening = { date: "2026-01-01", hours: 0 };
    // 2026 en 2027 leveren allebei nog het jaarrecht; 2028 raakt geen contract meer.
    expect(accruedVacationHours(aflopend, [], opening, 2028)).toBe(400);
  });

  it("lets a budget row override the contract for its own year", () => {
    const opening = { date: "2026-01-01", hours: 0 };
    const budgets = [{ year: 2027, hours: 80 }];
    expect(accruedVacationHours(contract, budgets, opening, 2027)).toBe(280);
  });

  it("ignores a reference date that lies after the year being asked about", () => {
    // Iemand die pas volgend jaar begint heeft nu nog niets opgebouwd; het
    // beginsaldo staat er wel, want dat is wat hij meeneemt.
    const opening = { date: "2027-01-01", hours: 40 };
    expect(accruedVacationHours(contract, [], opening, 2026)).toBe(40);
  });
});

describe("vacationBalance", () => {
  const contract = [{ startDate: "2020-01-01", endDate: null, vacationHours: 200 }];
  const opgenomen = [
    { date: "2026-03-10", hours: 8 },
    { date: "2026-07-23", hours: 48 },
  ];

  it("counts only this year without an opening balance", () => {
    expect(vacationBalance(contract, [], opgenomen, null, 2026)).toEqual({
      entitled: 200, used: 56, remaining: 144,
    });
  });

  it("ignores what was taken before the reference date", () => {
    // De 8 uur van maart zit al in het beginsaldo verwerkt.
    const opening = { date: "2026-07-01", hours: 40 };
    expect(vacationBalance(contract, [], opgenomen, opening, 2026)).toEqual({
      entitled: 140.82, used: 48, remaining: 92.82,
    });
  });

  it("leaves out vacation that is already booked for next year", () => {
    // Dat recht wordt pas volgend jaar opgebouwd, dus het hoort er nu ook niet
    // vanaf te gaan.
    const volgendJaar = [...opgenomen, { date: "2027-02-01", hours: 24 }];
    expect(vacationBalance(contract, [], volgendJaar, null, 2026).used).toBe(56);
  });

  it("counts what was taken on the reference date itself", () => {
    const opening = { date: "2026-03-10", hours: 0 };
    expect(vacationBalance(contract, [], opgenomen, opening, 2026).used).toBe(56);
  });
});

describe("fillBudgets", () => {
  const users = [
    { id: "u1", name: "Anna" },
    { id: "u2", name: "Bert" },
  ];
  const contracten = [
    { userId: "u1", startDate: "2020-01-01", endDate: null, vacationHours: 160 },
    { userId: "u2", startDate: "2020-01-01", endDate: null, vacationHours: 200 },
  ];
  const bestaand = {
    id: "b1", userId: "u1", year: 2026, hours: 999,
    user: { id: "u1", name: "Anna" },
  };

  it("leaves an existing row alone and derives only for the others", () => {
    const uitkomst = fillBudgets([bestaand], users, contracten, 2026);
    expect(uitkomst).toEqual([
      bestaand,
      { id: null, userId: "u2", year: 2026, hours: 200, user: { id: "u2", name: "Bert" } },
    ]);
  });

  it("derives for everyone when there is no row at all", () => {
    const uitkomst = fillBudgets([], users, contracten, 2026);
    expect(uitkomst.map((b) => [b.userId, b.hours, b.id])).toEqual([
      ["u1", 160, null],
      ["u2", 200, null],
    ]);
  });

  it("skips an employee whose contract says nothing", () => {
    const uitkomst = fillBudgets([], users, [contracten[0]], 2026);
    expect(uitkomst.map((b) => b.userId)).toEqual(["u1"]);
  });

  it("sorts by name so a derived row does not land at the bottom", () => {
    const zeger = { id: "b9", userId: "u9", year: 2026, hours: 80, user: { id: "u9", name: "Zeger" } };
    const uitkomst = fillBudgets([zeger], users, contracten, 2026);
    expect(uitkomst.map((b) => b.user.name)).toEqual(["Anna", "Bert", "Zeger"]);
  });
});

describe("toContractVacation", () => {
  it("turns Prisma rows into dates and numbers", () => {
    const rijen = [
      {
        userId: "u1",
        startDate: new Date("2026-01-01T00:00:00Z"),
        endDate: null,
        vacationHours: "160.00",
      },
    ];
    expect(toContractVacation(rijen)).toEqual([
      { userId: "u1", startDate: "2026-01-01", endDate: null, vacationHours: 160 },
    ]);
  });

  it("keeps an empty vacationHours empty instead of turning it into nought", () => {
    const rijen = [{ userId: "u1", startDate: null, endDate: null, vacationHours: null }];
    expect(toContractVacation(rijen)).toEqual([
      { userId: "u1", startDate: null, endDate: null, vacationHours: null },
    ]);
  });
});
