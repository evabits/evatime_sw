import { describe, it, expect } from "vitest";
import {
  pickCommuteTemplate, commuteDates, commuteEntryData, commuteToggleDenial,
  type CommuteTemplate,
} from "./commute";

const sjabloon = (over: Partial<CommuteTemplate> = {}): CommuteTemplate => ({
  id: "t1",
  name: "WoonWerk",
  projectId: "p-intern",
  km: "77.7",
  description: null,
  managedByAdmin: true,
  updatedAt: "2026-08-01T10:00:00.000Z",
  ...over,
});

describe("pickCommuteTemplate", () => {
  it("gives nothing when the employee has no templates at all", () => {
    expect(pickCommuteTemplate([])).toBeNull();
  });

  it("ignores templates the employee made himself", () => {
    // Alleen het door een beheerder ingestelde sjabloon telt als woon-werk.
    expect(pickCommuteTemplate([sjabloon({ managedByAdmin: false })])).toBeNull();
  });

  it("picks the managed one from a mixed list", () => {
    const eigen = sjabloon({ id: "eigen", name: "Klant bezoeken", managedByAdmin: false });
    const beheerd = sjabloon({ id: "beheerd" });
    expect(pickCommuteTemplate([eigen, beheerd])?.id).toBe("beheerd");
  });

  it("takes the most recently changed when there are somehow two managed ones", () => {
    // Dat hoort niet te kunnen, maar het staat niet in de weg: zo verergert een
    // datafout zichzelf niet.
    const oud = sjabloon({ id: "oud", updatedAt: "2026-01-01T00:00:00.000Z" });
    const nieuw = sjabloon({ id: "nieuw", updatedAt: "2026-08-01T00:00:00.000Z" });
    expect(pickCommuteTemplate([oud, nieuw])?.id).toBe("nieuw");
    expect(pickCommuteTemplate([nieuw, oud])?.id).toBe("nieuw");
  });
});

describe("commuteDates", () => {
  it("gives the days that have a commute ride, as yyyy-MM-dd", () => {
    const ritten = [
      { date: "2026-08-17T00:00:00.000Z", commute: true },
      { date: "2026-08-18T00:00:00.000Z", commute: false },
      { date: "2026-08-19T00:00:00.000Z", commute: true },
    ];
    expect(commuteDates(ritten)).toEqual(["2026-08-17", "2026-08-19"]);
  });

  it("counts a day once, even if there are somehow two rides", () => {
    const ritten = [
      { date: "2026-08-17T00:00:00.000Z", commute: true },
      { date: "2026-08-17T00:00:00.000Z", commute: true },
    ];
    expect(commuteDates(ritten)).toEqual(["2026-08-17"]);
  });

  it("gives an empty list for no rides", () => {
    expect(commuteDates([])).toEqual([]);
  });
});

describe("commuteEntryData", () => {
  it("takes project and distance from the template", () => {
    expect(commuteEntryData(sjabloon())).toEqual({
      projectId: "p-intern",
      km: 77.7,
      description: "WoonWerk",
    });
  });

  it("prefers the template's own description over its name", () => {
    const met = sjabloon({ description: "Heen en terug naar kantoor" });
    expect(commuteEntryData(met).description).toBe("Heen en terug naar kantoor");
  });

  it("falls back to the name when the description is blank", () => {
    // Een lege omschrijving zou een naamloze regel in de kilometerlijst geven.
    expect(commuteEntryData(sjabloon({ description: "   " })).description).toBe("WoonWerk");
  });
});

describe("commuteToggleDenial", () => {
  it("allows switching a day on when there is a template", () => {
    expect(commuteToggleDenial({ template: sjabloon(), bestaand: null, present: true })).toBeNull();
  });

  it("refuses switching on without a commute template, and says who fixes it", () => {
    const melding = commuteToggleDenial({ template: null, bestaand: null, present: true });
    expect(melding).toBe("Er is nog geen woon-werksjabloon ingesteld. Vraag een beheerder dit onder Personeel in te stellen.");
  });

  it("allows switching a day off", () => {
    expect(commuteToggleDenial({ template: sjabloon(), bestaand: { invoiced: false }, present: false })).toBeNull();
  });

  it("refuses to remove a ride that has already been invoiced", () => {
    const melding = commuteToggleDenial({ template: sjabloon(), bestaand: { invoiced: true }, present: false });
    expect(melding).toBe("Deze rit is al gefactureerd en kan niet meer worden verwijderd");
  });

  it("does not need a template to switch a day off", () => {
    // Het sjabloon kan verwijderd zijn nadat de rit is aangemaakt; die rit moet
    // je dan nog steeds kwijt kunnen.
    expect(commuteToggleDenial({ template: null, bestaand: { invoiced: false }, present: false })).toBeNull();
  });
});
