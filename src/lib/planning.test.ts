import { describe, it, expect } from "vitest";
import { projectBar, unplannedProjects, validateDateRange, groupByCustomer } from "./planning";

const taak = (id: string, start: string, eind: string, sortOrder = 0) => ({
  id, name: `taak ${id}`, startDate: start, endDate: eind, sortOrder,
});

describe("projectBar", () => {
  it("uses the project's own dates when both are filled in", () => {
    const bar = projectBar({
      id: "p1", name: "Datalogger",
      plannedStart: "2026-09-01", plannedEnd: "2026-10-15",
      tasks: [taak("t1", "2026-09-05", "2026-09-20")],
    });
    expect(bar).toEqual({ start: new Date("2026-09-01"), end: new Date("2026-10-15") });
  });

  it("spans the tasks when the project has no dates of its own", () => {
    const bar = projectBar({
      id: "p1", name: "H3X",
      tasks: [taak("t1", "2026-09-10", "2026-09-14"), taak("t2", "2026-09-03", "2026-09-08")],
    });
    expect(bar).toEqual({ start: new Date("2026-09-03"), end: new Date("2026-09-14") });
  });

  it("falls back to the tasks when only one of the two dates is filled in", () => {
    // De API weigert een halve invulling, maar oude of met de hand gewijzigde
    // rijen mogen hier geen onzinbalk opleveren.
    const bar = projectBar({
      id: "p1", name: "Half", plannedStart: "2026-09-01", plannedEnd: null,
      tasks: [taak("t1", "2026-10-01", "2026-10-02")],
    });
    expect(bar).toEqual({ start: new Date("2026-10-01"), end: new Date("2026-10-02") });
  });

  it("returns null when there is nothing to draw", () => {
    expect(projectBar({ id: "p1", name: "Intern", tasks: [] })).toBeNull();
  });
});

describe("unplannedProjects", () => {
  it("keeps only the projects that have no bar at all", () => {
    const projecten = [
      { id: "a", name: "Gepland", plannedStart: "2026-09-01", plannedEnd: "2026-09-30", tasks: [] },
      { id: "b", name: "Via taken", tasks: [taak("t1", "2026-09-01", "2026-09-02")] },
      { id: "c", name: "Niets", tasks: [] },
    ];
    expect(unplannedProjects(projecten).map((p) => p.id)).toEqual(["c"]);
  });
});

describe("validateDateRange", () => {
  it("accepts a range that runs forwards, and a single day", () => {
    expect(validateDateRange("2026-09-01", "2026-09-30")).toBeNull();
    expect(validateDateRange("2026-09-01", "2026-09-01")).toBeNull();
  });

  it("rejects an end date before the start date", () => {
    expect(validateDateRange("2026-09-30", "2026-09-01")).toBe("De einddatum ligt vóór de startdatum");
  });

  it("accepts both being empty, because that means 'follow the tasks'", () => {
    expect(validateDateRange(null, null)).toBeNull();
    expect(validateDateRange("", "")).toBeNull();
    expect(validateDateRange(undefined, undefined)).toBeNull();
  });

  it("rejects half a range, because one date draws no bar", () => {
    const melding = "Vul een startdatum én een einddatum in, of allebei niet";
    expect(validateDateRange("2026-09-01", null)).toBe(melding);
    expect(validateDateRange(null, "2026-09-30")).toBe(melding);
  });
});

describe("groupByCustomer", () => {
  const projecten = [
    { id: "3", name: "Onderhoud", customer: { name: "Zonneplan" }, tasks: [] },
    { id: "1", name: "Juli 2026", customer: { name: "Acquaint" }, tasks: [] },
    { id: "2", name: "April 2026", customer: { name: "Acquaint" }, tasks: [] },
    { id: "4", name: "Intern overleg", customer: null, tasks: [] },
  ];

  it("groups per customer and sorts the projects within a group by name", () => {
    const groepen = groupByCustomer(projecten);
    expect(groepen.map((g) => g.customerName)).toEqual(["Acquaint", "Zonneplan", "Zonder klant"]);
    expect(groepen[0].projects.map((p) => p.id)).toEqual(["2", "1"]);
  });

  it("sorts customers the Dutch way, so case does not decide the order", () => {
    // "ekster" hoort tussen Aalscholver en Zwaluw, niet erachter omdat hij met
    // een kleine letter begint.
    const gemengd = [
      { id: "a", name: "P", customer: { name: "Zwaluw" }, tasks: [] },
      { id: "b", name: "P", customer: { name: "ekster" }, tasks: [] },
      { id: "c", name: "P", customer: { name: "Aalscholver" }, tasks: [] },
    ];
    expect(groupByCustomer(gemengd).map((g) => g.customerName)).toEqual([
      "Aalscholver", "ekster", "Zwaluw",
    ]);
  });

  it("keeps two customers that differ only in case apart", () => {
    // Dat zijn twee klantrijen in de database. Samenvoegen zou een echt
    // verschil verbergen, dus dat doet deze functie bewust niet.
    const bijnaGelijk = [
      { id: "a", name: "P", customer: { name: "Acquaint" }, tasks: [] },
      { id: "b", name: "Q", customer: { name: "acquaint" }, tasks: [] },
    ];
    expect(groupByCustomer(bijnaGelijk)).toHaveLength(2);
  });

  it("puts projects without a customer last, not first", () => {
    expect(groupByCustomer(projecten).at(-1)?.customerName).toBe("Zonder klant");
  });

  it("gives an empty list for no projects instead of a group with nothing in it", () => {
    expect(groupByCustomer([])).toEqual([]);
  });
});
