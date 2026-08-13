import { describe, it, expect } from "vitest";
import { contractVacationHours, fillBudgets, toContractVacation } from "./vacation-budget";

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
