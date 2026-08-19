import { describe, it, expect } from "vitest";
import {
  projectBar, unplannedProjects, validateDateRange, groupByCustomer, timelineWindow,
  barGeometry, todayOffsetPct, swapOrder, timelineHeader,
} from "./planning";

const som = (segmenten: { widthPct: number }[]) => segmenten.reduce((s, x) => s + x.widthPct, 0);

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

const vandaag = new Date(2026, 8, 15); // 15-SEP-2026

describe("timelineWindow", () => {
  it("spans everything that gets drawn, with seven days of margin", () => {
    const venster = timelineWindow([
      { id: "p1", name: "A", plannedStart: "2026-09-01", plannedEnd: "2026-09-30", tasks: [] },
    ], vandaag);
    expect(venster.start).toEqual(new Date("2026-08-25"));
    expect(venster.end).toEqual(new Date("2026-10-07"));
  });

  it("stretches for a task that falls outside its own project's dates", () => {
    // Dat mag: het is juist de zichtbare waarschuwing dat de planning niet
    // klopt. Dan moet die taak wel in beeld blijven.
    const venster = timelineWindow([
      {
        id: "p1", name: "A", plannedStart: "2026-09-01", plannedEnd: "2026-09-30",
        tasks: [{ id: "t1", name: "uitloop", startDate: "2026-10-20", endDate: "2026-11-05", sortOrder: 0 }],
      },
    ], vandaag);
    expect(venster.end).toEqual(new Date("2026-11-12"));
  });

  it("falls back to a window around today when nothing is planned at all", () => {
    const venster = timelineWindow([{ id: "p1", name: "Intern", tasks: [] }], vandaag);
    expect(venster.start).toEqual(new Date(2026, 7, 16)); // 30 dagen terug
    expect(venster.end).toEqual(new Date(2026, 11, 14)); // 90 dagen vooruit
  });

  it("does the same for no projects at all", () => {
    expect(timelineWindow([], vandaag).start).toEqual(new Date(2026, 7, 16));
  });
});

describe("barGeometry", () => {
  const venster = { start: new Date("2026-09-01"), end: new Date("2026-09-10") }; // 10 dagen

  it("puts a bar that fills the whole window at nought and a hundred percent", () => {
    expect(barGeometry("2026-09-01", "2026-09-10", venster)).toEqual({ leftPct: 0, widthPct: 100 });
  });

  it("gives a one-day task a width of one day, not zero", () => {
    // Dit is waarom de einddatum inclusief is: zonder de +1 verdwijnt een taak
    // van één dag volledig uit beeld.
    expect(barGeometry("2026-09-01", "2026-09-01", venster)).toEqual({ leftPct: 0, widthPct: 10 });
  });

  it("shifts a bar that starts later", () => {
    expect(barGeometry("2026-09-06", "2026-09-10", venster)).toEqual({ leftPct: 50, widthPct: 50 });
  });
});

describe("todayOffsetPct", () => {
  it("gives the position of today inside the window", () => {
    const venster = { start: new Date("2026-09-01"), end: new Date("2026-09-10") };
    expect(todayOffsetPct(new Date("2026-09-06"), venster)).toBe(50);
  });

  it("gives null when today falls outside the window, so no line is drawn", () => {
    const venster = { start: new Date("2026-09-01"), end: new Date("2026-09-10") };
    expect(todayOffsetPct(new Date("2026-08-31"), venster)).toBeNull();
    expect(todayOffsetPct(new Date("2026-09-11"), venster)).toBeNull();
  });
});

describe("swapOrder", () => {
  const taken = [
    { id: "a", sortOrder: 0 },
    { id: "b", sortOrder: 1 },
    { id: "c", sortOrder: 2 },
  ];

  it("moves a task up and renumbers the whole list", () => {
    expect(swapOrder(taken, "b", "up")).toEqual([
      { id: "b", sortOrder: 0 },
      { id: "a", sortOrder: 1 },
      { id: "c", sortOrder: 2 },
    ]);
  });

  it("moves a task down", () => {
    expect(swapOrder(taken, "b", "down")).toEqual([
      { id: "a", sortOrder: 0 },
      { id: "c", sortOrder: 1 },
      { id: "b", sortOrder: 2 },
    ]);
  });

  it("does nothing at the edges instead of failing", () => {
    expect(swapOrder(taken, "a", "up")).toEqual([]);
    expect(swapOrder(taken, "c", "down")).toEqual([]);
  });

  it("does nothing for a task that is not in the list", () => {
    expect(swapOrder(taken, "onbekend", "up")).toEqual([]);
  });

  it("still works when the order numbers collide or are all zero", () => {
    // Dat gebeurt na een samenvoeging: twee reeksen sortOrder lopen door
    // elkaar. Hernummeren van de hele lijst maakt dat vanzelf weer heel.
    const rommelig = [
      { id: "a", sortOrder: 0 },
      { id: "b", sortOrder: 0 },
      { id: "c", sortOrder: 0 },
    ];
    expect(swapOrder(rommelig, "c", "up")).toEqual([
      { id: "a", sortOrder: 0 },
      { id: "c", sortOrder: 1 },
      { id: "b", sortOrder: 2 },
    ]);
  });
});

describe("timelineHeader", () => {
  // Loopt van halverwege september tot begin oktober, dus zowel het eerste
  // als het laatste segment van elke rij steekt buiten het venster en moet
  // afgeknipt worden.
  const venster = { start: new Date("2026-09-15"), end: new Date("2026-10-10") };

  it("toont bij zoom maanden alleen een bovenrij, afgeknipt aan beide randen", () => {
    const header = timelineHeader(venster, "maanden");
    expect(header.onder).toEqual([]);
    expect(header.boven.map((s) => s.label)).toEqual(["SEP 2026", "OKT 2026"]);
    // Het eerste segment begint bij het venster, niet bij 1 september.
    expect(header.boven[0].leftPct).toBe(0);
    // September levert 16 dagen (15 t/m 30) van de 26 vensterdagen.
    expect(header.boven[0].widthPct).toBeCloseTo((16 / 26) * 100, 5);
    expect(som(header.boven)).toBeCloseTo(100, 5);
  });

  it("toont bij zoom weken maanden boven en ISO-weeknummers eronder", () => {
    const header = timelineHeader(venster, "weken");
    expect(header.boven.map((s) => s.label)).toEqual(["SEP 2026", "OKT 2026"]);
    // Weken 38 t/m 41 overlappen het venster; de eerste en de laatste zijn
    // afgeknipt tot 6 dagen in plaats van 7.
    expect(header.onder.map((s) => s.label)).toEqual(["38", "39", "40", "41"]);
    expect(header.onder[0].leftPct).toBe(0);
    expect(header.onder[0].widthPct).toBeCloseTo((6 / 26) * 100, 5);
    expect(som(header.onder)).toBeCloseTo(100, 5);
  });

  it("toont bij zoom kwartalen kwartalen boven en maanden (kort) eronder", () => {
    const header = timelineHeader(venster, "kwartalen");
    expect(header.boven.map((s) => s.label)).toEqual(["Q3 2026", "Q4 2026"]);
    expect(header.boven[0].leftPct).toBe(0);
    expect(som(header.boven)).toBeCloseTo(100, 5);
    expect(header.onder.map((s) => s.label)).toEqual(["SEP", "OKT"]);
    expect(som(header.onder)).toBeCloseTo(100, 5);
  });

  it("dekt met de bovenrij precies het volledige venster, ook zonder afknippen", () => {
    // Venster dat toevallig op een maandgrens begint en eindigt: hier valt er
    // dus niets af te knippen, maar de percentages moeten nog steeds optellen.
    const heleMaand = { start: new Date("2026-09-01"), end: new Date("2026-09-30") };
    const header = timelineHeader(heleMaand, "maanden");
    expect(header.boven).toEqual([{ key: "2026-8", label: "SEP 2026", leftPct: 0, widthPct: 100 }]);
  });
});
