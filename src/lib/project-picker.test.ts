import { describe, it, expect } from "vitest";
import { projectOptions, filterProjectOptions, ZONDER_KLANT } from "./project-picker";

const projects = [
  { id: "3", name: "Onderhoud", customer: { name: "Zonneplan" } },
  { id: "1", name: "Juli 2026", customer: { name: "Acquaint" } },
  { id: "2", name: "April 2026", customer: { name: "acquaint" } },
  { id: "4", name: "Intern overleg", customer: null },
  { id: "5", name: "Oud project", customer: { name: "Acquaint" }, archivedAt: new Date() },
];

describe("projectOptions", () => {
  it("sorts by customer and then by project name", () => {
    // Hoofdletters mogen de volgorde niet bepalen: "acquaint" hoort bij
    // "Acquaint" en niet ergens onderaan.
    expect(projectOptions(projects).map((o) => o.label)).toEqual([
      "acquaint — April 2026",
      "Acquaint — Juli 2026",
      "Zonneplan — Onderhoud",
      `${ZONDER_KLANT} — Intern overleg`,
    ]);
  });

  it("puts projects without a customer last, not first", () => {
    const laatste = projectOptions(projects).at(-1);
    expect(laatste?.customerName).toBe(ZONDER_KLANT);
  });

  it("leaves out archived projects and the one you came from", () => {
    const ids = projectOptions(projects, { excludeId: "1" }).map((o) => o.id);
    expect(ids).not.toContain("5"); // gearchiveerd
    expect(ids).not.toContain("1"); // de bron zelf
    expect(ids).toEqual(["2", "3", "4"]);
  });

  it("treats a blank customer name as no customer at all", () => {
    const [optie] = projectOptions([{ id: "x", name: "Los", customer: { name: "   " } }]);
    expect(optie.customerName).toBe(ZONDER_KLANT);
  });

  it("searches while sorting, in one call", () => {
    expect(projectOptions(projects, { zoek: "acquaint" }).map((o) => o.id)).toEqual(["2", "1"]);
  });
});

describe("filterProjectOptions", () => {
  const opties = projectOptions(projects);

  it("gives everything back when nothing is typed", () => {
    expect(filterProjectOptions(opties, "")).toEqual(opties);
    expect(filterProjectOptions(opties, "   ")).toEqual(opties);
    expect(filterProjectOptions(opties, undefined)).toEqual(opties);
  });

  it("ignores case", () => {
    expect(filterProjectOptions(opties, "ZONNE").map((o) => o.id)).toEqual(["3"]);
  });

  it("matches on the project name as well as the customer", () => {
    expect(filterProjectOptions(opties, "onderhoud").map((o) => o.id)).toEqual(["3"]);
  });

  it("requires every word, in whatever order you type them", () => {
    // Dit is het punt van meerdere woorden: je weet niet of de klant of het
    // project vooraan staat, en zo hoef je dat ook niet te weten.
    expect(filterProjectOptions(opties, "acq juli").map((o) => o.id)).toEqual(["1"]);
    expect(filterProjectOptions(opties, "juli acq").map((o) => o.id)).toEqual(["1"]);
    expect(filterProjectOptions(opties, "acq maart")).toEqual([]);
  });
});
