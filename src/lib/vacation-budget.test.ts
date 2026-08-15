import { describe, it, expect } from "vitest";
import {
  accruedBetween, accruedVacationHours, contractVacationHours, contractYearBalance, fillBudgets,
  toContractVacation, vacationBalance, vacationLedger,
} from "./vacation-budget";

const afgerondOpCent = (n: number) => Math.round(n * 100) / 100;

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

describe("accruedBetween", () => {
  it("gives a contract that runs exactly one year its own hours, leap day and all", () => {
    // 1-9-2023 t/m 31-8-2024 bevat 29 februari. Gemeten vanaf de contractstart
    // is dat precies één jaar, dus precies 168 uur.
    const c = [{ startDate: "2023-09-01", endDate: "2024-08-31", vacationHours: 168 }];
    expect(accruedBetween(c, "2023-09-01", "2027-01-01")).toBe(168);
  });

  it("counts a contract that started during the year by its days", () => {
    // 9 januari t/m 31 december is 357 van de 365 dagen: 168 × 357/365 = 164,32.
    const c = [{ startDate: "2026-01-09", endDate: null, vacationHours: 168 }];
    expect(accruedBetween(c, "2026-01-09", "2027-01-01")).toBe(164.32);
  });

  it("gives a two-year contract twice its yearly hours", () => {
    const c = [{ startDate: "2024-01-01", endDate: "2025-12-31", vacationHours: 168 }];
    expect(accruedBetween(c, "2024-01-01", "2026-01-01")).toBe(336);
  });

  it("adds up the contracts that follow each other", () => {
    const c = [
      { startDate: "2023-09-01", endDate: "2024-08-31", vacationHours: 168 },
      { startDate: "2024-09-01", endDate: "2025-08-31", vacationHours: 168 },
      { startDate: "2025-09-01", endDate: "2026-08-31", vacationHours: 200 },
    ];
    expect(accruedBetween(c, "2023-09-01", "2027-01-01")).toBe(536);
  });

  it("skips a contract that says nothing about vacation hours", () => {
    const c = [{ startDate: "2020-01-01", endDate: null, vacationHours: null }];
    expect(accruedBetween(c, "2026-01-01", "2027-01-01")).toBe(0);
  });

  it("skips a contract that does not touch the window", () => {
    const c = [{ startDate: "2020-01-01", endDate: "2025-12-31", vacationHours: 200 }];
    expect(accruedBetween(c, "2026-01-01", "2027-01-01")).toBe(0);
  });

  it("gives nothing for an empty window", () => {
    const c = [{ startDate: "2020-01-01", endDate: null, vacationHours: 200 }];
    expect(accruedBetween(c, "2026-01-01", "2026-01-01")).toBe(0);
  });
});

describe("accruedVacationHours", () => {
  const contract = [{ startDate: "2020-01-01", endDate: null, vacationHours: 200 }];
  const peildatum = { date: "2026-07-01", used: 0 };

  it("gives only this year's entitlement when there is no reference date", () => {
    expect(accruedVacationHours(contract, [], null, "2026-08-15")).toBe(200);
  });

  it("gives nought when neither a budget row nor a contract says anything", () => {
    expect(accruedVacationHours([], [], null, "2026-08-15")).toBe(0);
  });

  it("stacks every year from the first contract onwards", () => {
    const vanaf2024 = [{ startDate: "2024-01-01", endDate: null, vacationHours: 200 }];
    expect(accruedVacationHours(vanaf2024, [], peildatum, "2026-08-15")).toBe(600);
  });

  it("counts the running contract year only as far as it has come", () => {
    // Twee volle contractjaren vanaf 1 juli 2024, plus 184 van de 365 dagen
    // van het derde: 200 + 200 + 100,82.
    const halverwege = [{ startDate: "2024-07-01", endDate: null, vacationHours: 200 }];
    expect(accruedVacationHours(halverwege, [], peildatum, "2026-08-15")).toBe(500.82);
  });

  it("gives a contract that runs on into next year its full hours", () => {
    // Een contract van 1 februari t/m 31 januari belooft 208 uur over zijn
    // eigen looptijd. De opbouw eindigt bij die 31e januari, niet op oudjaar —
    // anders viel de laatste maand eraf en bleef er 190,33 over.
    const overDeJaargrens = [
      { startDate: "2025-02-01", endDate: "2026-01-31", vacationHours: 208 },
      { startDate: "2026-02-01", endDate: "2027-01-31", vacationHours: 208 },
    ];
    const peil = { date: "2026-02-01", used: 0 };
    expect(accruedVacationHours(overDeJaargrens, [], peil, "2026-08-15")).toBe(416);
  });

  it("gives a career of neat one-year contracts exactly their hours", () => {
    const perJaar = [
      { startDate: "2023-09-01", endDate: "2024-08-31", vacationHours: 168 },
      { startDate: "2024-09-01", endDate: "2025-08-31", vacationHours: 168 },
      { startDate: "2025-09-01", endDate: "2026-08-31", vacationHours: 200 },
    ];
    expect(accruedVacationHours(perJaar, [], peildatum, "2026-08-15")).toBe(536);
  });

  it("stops accruing once the contract has run out", () => {
    // Tot en met 30 juni 2026 is 181 van de 365 dagen.
    const aflopend = [{ startDate: "2025-01-01", endDate: "2026-06-30", vacationHours: 200 }];
    expect(accruedVacationHours(aflopend, [], peildatum, "2026-08-15")).toBe(299.18);
  });

  it("adds up the years of a career spanning three contracts", () => {
    const loopbaan = [
      { startDate: "2023-01-09", endDate: "2024-05-31", vacationHours: 168 },
      { startDate: "2024-06-01", endDate: "2025-08-31", vacationHours: 168 },
      { startDate: "2025-09-01", endDate: "2026-08-31", vacationHours: 200 },
    ];
    // Het eerste contract duurde ruim 16 maanden en levert daarom meer dan zijn
    // jaarbedrag: 234,10. Het tweede 210,34, het derde precies zijn 200.
    expect(accruedVacationHours(loopbaan, [], peildatum, "2026-08-15")).toBe(644.44);
  });
});

describe("vacationBalance", () => {
  const contract = [{ startDate: "2020-01-01", endDate: null, vacationHours: 200 }];
  const opgenomen = [
    { date: "2026-03-10", hours: 8 },
    { date: "2026-07-23", hours: 48 },
  ];

  it("counts only this year without an opening balance", () => {
    expect(vacationBalance(contract, [], opgenomen, null, "2026-08-15")).toEqual({
      entitled: 200, used: 56, remaining: 144,
    });
  });

  it("replaces what was taken before the reference date by the number filled in", () => {
    // De 8 uur van maart zit al in de 340 verwerkt en telt niet nog eens mee.
    // Het recht loopt vanaf het contract in 2020, dus zeven jaar × 200.
    const opening = { date: "2026-07-01", used: 340 };
    expect(vacationBalance(contract, [], opgenomen, opening, "2026-08-15")).toEqual({
      entitled: 1400, used: 388, remaining: 1012,
    });
  });

  it("does subtract leave booked in the tail of a contract that runs into next year", () => {
    // Die januari valt binnen het lopende contract, dus binnen hetzelfde
    // venster als de opbouw. Hem laten staan zou het saldo te hoog maken.
    const overDeJaargrens = [{ startDate: "2026-02-01", endDate: "2027-01-31", vacationHours: 208 }];
    const peil = { date: "2026-02-01", used: 0 };
    const inJanuari = [{ date: "2027-01-12", hours: 8 }];
    expect(vacationBalance(overDeJaargrens, [], inJanuari, peil, "2026-08-15")).toEqual({
      entitled: 208, used: 8, remaining: 200,
    });
  });

  it("leaves out vacation that is already booked for next year", () => {
    // Dat recht wordt pas volgend jaar opgebouwd, dus het hoort er nu ook niet
    // vanaf te gaan.
    const volgendJaar = [...opgenomen, { date: "2027-02-01", hours: 24 }];
    expect(vacationBalance(contract, [], volgendJaar, null, "2026-08-15").used).toBe(56);
  });

  it("counts what was taken on the reference date itself", () => {
    // 10 maart valt niet vóór de peildatum, dus die 8 uur komt boven op de 100.
    const opening = { date: "2026-03-10", used: 100 };
    expect(vacationBalance(contract, [], opgenomen, opening, "2026-08-15").used).toBe(156);
  });
});

describe("contractYearBalance", () => {
  // Merlijn: drie contracten op rij, het lopende van 1-9-2025 t/m 31-8-2026.
  const loopbaan = [
    { startDate: "2023-01-09", endDate: "2024-05-31", vacationHours: 168 },
    { startDate: "2024-06-01", endDate: "2025-08-31", vacationHours: 168 },
    { startDate: "2025-09-01", endDate: "2026-08-31", vacationHours: 200 },
  ];
  const opening = { date: "2025-09-01", used: 400 };
  const opgenomen = [{ date: "2026-07-23", hours: 48 }];
  const saldo = () => vacationBalance(loopbaan, [], opgenomen, opening, "2026-08-15");

  it("splits the balance into what was carried over and what this contract gives", () => {
    const uitsplitsing = contractYearBalance(loopbaan, opgenomen, saldo(), opening, "2026-08-15")!;
    // Opgebouwd t/m 31-8-2025 is 234,10 + 210,34 = 444,44; daar gaat 400
    // opgenomen vanaf. Het lopende contract geeft precies zijn 200 uur.
    expect(uitsplitsing.carriedOver).toBe(44.44);
    expect(uitsplitsing.contractTotal).toBe(200);
    expect(uitsplitsing.used).toBe(48);
    expect(uitsplitsing.endDate).toBe("2026-08-31");
  });

  it("lands on exactly the same remaining hours as the leave screen shows", () => {
    // De uitsplitsing mag het saldo verdelen, niet veranderen.
    const totaal = saldo();
    const uitsplitsing = contractYearBalance(loopbaan, opgenomen, totaal, opening, "2026-08-15")!;
    expect(uitsplitsing.remaining).toBe(totaal.remaining);
    expect(
      afgerondOpCent(uitsplitsing.carriedOver + uitsplitsing.contractTotal - uitsplitsing.used),
    ).toBe(totaal.remaining);
  });

  it("counts vacation registered between the reference date and the contract start as taken before", () => {
    const vroeg = { date: "2025-01-01", used: 300 };
    const met = [{ date: "2025-03-10", hours: 16 }, ...opgenomen];
    const uitsplitsing = contractYearBalance(loopbaan, met, vacationBalance(loopbaan, [], met, vroeg, "2026-08-15"), vroeg, "2026-08-15")!;
    // De 16 uur van maart 2025 hoort bij het vorige contract, niet bij dit.
    expect(uitsplitsing.used).toBe(48);
    expect(uitsplitsing.carriedOver).toBe(128.44);
  });

  it("refuses to split when the reference date lies inside the current contract year", () => {
    const teLaat = { date: "2026-07-01", used: 400 };
    expect(contractYearBalance(loopbaan, opgenomen, saldo(), teLaat, "2026-08-15")).toBeNull();
  });

  it("refuses to split when no contract is in force today", () => {
    expect(contractYearBalance(loopbaan, opgenomen, saldo(), opening, "2026-09-15")).toBeNull();
  });
});

describe("vacationLedger", () => {
  const perJaar = [
    { startDate: "2023-09-01", endDate: "2024-08-31", vacationHours: 168 },
    { startDate: "2024-09-01", endDate: "2025-08-31", vacationHours: 168 },
    { startDate: "2025-09-01", endDate: "2026-08-31", vacationHours: 200 },
  ];
  const opening = { date: "2025-09-01", used: 300 };
  const opgenomen = [{ date: "2026-07-23", until: "2026-07-31", hours: 48 }];

  it("lists every contract, the manual total and each leave, in date order", () => {
    expect(vacationLedger(perJaar, opgenomen, opening, "2026-08-15")).toEqual([
      { kind: "contract", date: "2023-09-01", until: "2024-08-31", hours: 168 },
      { kind: "contract", date: "2024-09-01", until: "2025-08-31", hours: 168 },
      // Op dezelfde dag als het lopende contract, maar het gaat over de periode
      // ervóór en staat er daarom boven.
      { kind: "opening", date: "2025-09-01", until: null, hours: -300 },
      { kind: "contract", date: "2025-09-01", until: "2026-08-31", hours: 200 },
      { kind: "leave", date: "2026-07-23", until: "2026-07-31", hours: -48 },
    ]);
  });

  it("adds up to exactly the remaining balance", () => {
    // Dit is waar de opsomming voor bestaat: hij moet het saldo verklaren.
    const regels = vacationLedger(perJaar, opgenomen, opening, "2026-08-15");
    const som = afgerondOpCent(regels.reduce((s, r) => s + r.hours, 0));
    expect(som).toBe(vacationBalance(perJaar, [], opgenomen, opening, "2026-08-15").remaining);
  });

  it("also adds up when a contract does not run a whole year", () => {
    const scheef = [
      { startDate: "2023-01-09", endDate: "2024-05-31", vacationHours: 168 },
      { startDate: "2024-06-01", endDate: null, vacationHours: 168 },
    ];
    const regels = vacationLedger(scheef, opgenomen, opening, "2026-08-15");
    const som = afgerondOpCent(regels.reduce((s, r) => s + r.hours, 0));
    expect(som).toBe(vacationBalance(scheef, [], opgenomen, opening, "2026-08-15").remaining);
  });

  it("leaves out a contract that has not built up anything", () => {
    const zonderUren = [...perJaar, { startDate: "2022-01-01", endDate: "2023-08-31", vacationHours: null }];
    const soorten = vacationLedger(zonderUren, [], { date: "2025-09-01", used: 0 }, "2026-08-15");
    expect(soorten).toHaveLength(3);
    expect(soorten.every((r) => r.kind === "contract")).toBe(true);
  });

  it("leaves out leave that falls before the reference date", () => {
    const eerder = [{ date: "2025-03-01", until: "2025-03-05", hours: 24 }, ...opgenomen];
    const regels = vacationLedger(perJaar, eerder, opening, "2026-08-15");
    expect(regels.filter((r) => r.kind === "leave")).toHaveLength(1);
  });

  it("gives nothing at all without a contract", () => {
    expect(vacationLedger([], opgenomen, opening, "2026-08-15")).toEqual([]);
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
