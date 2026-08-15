import { describe, it, expect } from "vitest";
import { accruedVacationHours, contractVacationHours, fillBudgets, proRataYearHours, toContractVacation, vacationBalance } from "./vacation-budget";

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

describe("proRataYearHours", () => {
  it("gives the full year to a contract that covers it", () => {
    expect(proRataYearHours([{ startDate: "2020-01-01", endDate: null, vacationHours: 200 }], [], 2026)).toBe(200);
  });

  it("counts a contract that starts during the year by its days", () => {
    // 9 januari t/m 31 december is 357 van de 365 dagen: 168 × 357/365 = 164,32.
    const c = [{ startDate: "2026-01-09", endDate: null, vacationHours: 168 }];
    expect(proRataYearHours(c, [], 2026)).toBe(164.32);
  });

  it("counts the last day of the contract as worked", () => {
    // Een contract dat op oudjaar afloopt heeft het hele jaar geduurd.
    const c = [{ startDate: "2020-01-01", endDate: "2026-12-31", vacationHours: 200 }];
    expect(proRataYearHours(c, [], 2026)).toBe(200);
  });

  it("adds up two contracts that split the year between them", () => {
    // Tot en met 31 augustus is 243 dagen, daarna 122: 168×243/365 + 200×122/365.
    const c = [
      { startDate: "2020-01-01", endDate: "2026-08-31", vacationHours: 168 },
      { startDate: "2026-09-01", endDate: null, vacationHours: 200 },
    ];
    expect(proRataYearHours(c, [], 2026)).toBe(178.7);
  });

  it("skips a contract that says nothing about vacation hours", () => {
    const c = [{ startDate: "2020-01-01", endDate: null, vacationHours: null }];
    expect(proRataYearHours(c, [], 2026)).toBe(0);
  });

  it("skips a contract that does not touch the year", () => {
    const c = [{ startDate: "2020-01-01", endDate: "2025-12-31", vacationHours: 200 }];
    expect(proRataYearHours(c, [], 2026)).toBe(0);
  });

  it("lets a budget row for that year replace the contracts entirely", () => {
    const c = [{ startDate: "2026-07-01", endDate: null, vacationHours: 200 }];
    expect(proRataYearHours(c, [{ year: 2026, hours: 144 }], 2026)).toBe(144);
  });
});

describe("accruedVacationHours", () => {
  const contract = [{ startDate: "2020-01-01", endDate: null, vacationHours: 200 }];
  const peildatum = { date: "2026-07-01", used: 0 };

  it("gives only this year's entitlement when there is no reference date", () => {
    expect(accruedVacationHours(contract, [], null, 2026)).toBe(200);
  });

  it("gives nought when neither a budget row nor a contract says anything", () => {
    expect(accruedVacationHours([], [], null, 2026)).toBe(0);
  });

  it("stacks every year from the first contract onwards", () => {
    const vanaf2024 = [{ startDate: "2024-01-01", endDate: null, vacationHours: 200 }];
    expect(accruedVacationHours(vanaf2024, [], peildatum, 2026)).toBe(600);
  });

  it("counts the first year by the days the contract ran", () => {
    // 2024 telt vanaf 1 juli (184/366), 2025 en 2026 tellen heel mee.
    const halverwege = [{ startDate: "2024-07-01", endDate: null, vacationHours: 200 }];
    expect(accruedVacationHours(halverwege, [], peildatum, 2026)).toBe(500.55);
  });

  it("stops accruing once the contract has run out", () => {
    // Tot en met 30 juni 2026 is 181 van de 365 dagen.
    const aflopend = [{ startDate: "2025-01-01", endDate: "2026-06-30", vacationHours: 200 }];
    expect(accruedVacationHours(aflopend, [], peildatum, 2026)).toBe(299.18);
  });

  it("adds up the years of a career spanning three contracts", () => {
    const loopbaan = [
      { startDate: "2023-01-09", endDate: "2024-05-31", vacationHours: 168 },
      { startDate: "2024-06-01", endDate: "2025-08-31", vacationHours: 168 },
      { startDate: "2025-09-01", endDate: "2026-08-31", vacationHours: 200 },
    ];
    // 2023: 164,32 · 2024: 168 · 2025: 178,70 · 2026: 133,15.
    expect(accruedVacationHours(loopbaan, [], peildatum, 2026)).toBe(644.17);
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

  it("replaces what was taken before the reference date by the number filled in", () => {
    // De 8 uur van maart zit al in de 340 verwerkt en telt niet nog eens mee.
    // Het recht loopt vanaf het contract in 2020, dus zeven jaar × 200.
    const opening = { date: "2026-07-01", used: 340 };
    expect(vacationBalance(contract, [], opgenomen, opening, 2026)).toEqual({
      entitled: 1400, used: 388, remaining: 1012,
    });
  });

  it("leaves out vacation that is already booked for next year", () => {
    // Dat recht wordt pas volgend jaar opgebouwd, dus het hoort er nu ook niet
    // vanaf te gaan.
    const volgendJaar = [...opgenomen, { date: "2027-02-01", hours: 24 }];
    expect(vacationBalance(contract, [], volgendJaar, null, 2026).used).toBe(56);
  });

  it("counts what was taken on the reference date itself", () => {
    // 10 maart valt niet vóór de peildatum, dus die 8 uur komt boven op de 100.
    const opening = { date: "2026-03-10", used: 100 };
    expect(vacationBalance(contract, [], opgenomen, opening, 2026).used).toBe(156);
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
