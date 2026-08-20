import { describe, it, expect } from "vitest";
import { cycleThrough, shiftPlan, planningWarnings, arrowPath, type DependencyLink, type SchedulableTask } from "./task-dependencies";

// "A wacht op B" schrijven we als { taskId: "A", dependsOnId: "B" }.
const wacht = (taskId: string, dependsOnId: string): DependencyLink => ({ taskId, dependsOnId });

const taak = (id: string, start: string, eind: string): SchedulableTask => ({
  id, name: `taak ${id}`, startDate: start, endDate: eind,
});

describe("cycleThrough", () => {
  it("sees no cycle in an empty graph", () => {
    expect(cycleThrough([], "A", "B")).toBeNull();
  });

  it("refuses a task that waits on itself", () => {
    expect(cycleThrough([], "A", "A")).toEqual(["A", "A"]);
  });

  it("catches the shortest cycle: B already waits on A", () => {
    expect(cycleThrough([wacht("B", "A")], "A", "B")).toEqual(["A", "B", "A"]);
  });

  it("catches a cycle three links long and names the whole chain", () => {
    // B wacht op C, C wacht op A. Nu A op B laten wachten sluit de ring.
    const links = [wacht("B", "C"), wacht("C", "A")];
    expect(cycleThrough(links, "A", "B")).toEqual(["A", "B", "C", "A"]);
  });

  it("allows a link that only looks like a cycle but is not", () => {
    // A en B wachten allebei op C. A op B laten wachten mag: geen ring.
    const links = [wacht("A", "C"), wacht("B", "C")];
    expect(cycleThrough(links, "A", "B")).toBeNull();
  });

  it("does not get stuck on a diamond", () => {
    // D wacht op B en C, die allebei op A wachten. Twee paden naar A, geen ring.
    const links = [wacht("D", "B"), wacht("D", "C"), wacht("B", "A"), wacht("C", "A")];
    expect(cycleThrough(links, "A", "D")).toEqual(["A", "D", "B", "A"]);
    expect(cycleThrough(links, "E", "D")).toBeNull();
  });
});

describe("shiftPlan", () => {
  it("moves nothing when there are no links", () => {
    const taken = [taak("A", "2026-09-01", "2026-09-05"), taak("B", "2026-09-02", "2026-09-06")];
    expect(shiftPlan(taken, [])).toEqual([]);
  });

  it("moves nothing when the successor already starts late enough", () => {
    // A eindigt op de 5e, B begint op de 6e: precies de dag erna, dus goed.
    const taken = [taak("A", "2026-09-01", "2026-09-05"), taak("B", "2026-09-06", "2026-09-10")];
    expect(shiftPlan(taken, [wacht("B", "A")])).toEqual([]);
  });

  it("pushes a successor that starts on the same day as its predecessor ends", () => {
    // Einddatums zijn inclusief: op de 5e is A nog bezig, dus B mag pas op de 6e.
    const taken = [taak("A", "2026-09-01", "2026-09-05"), taak("B", "2026-09-05", "2026-09-09")];
    const plan = shiftPlan(taken, [wacht("B", "A")]);
    expect(plan).toHaveLength(1);
    expect(plan[0].id).toBe("B");
    expect(plan[0].naarStart).toEqual(new Date("2026-09-06"));
    expect(plan[0].naarEind).toEqual(new Date("2026-09-10")); // duur van 5 dagen blijft
  });

  it("cascades down a chain of three", () => {
    const taken = [
      taak("A", "2026-09-01", "2026-09-10"),
      taak("B", "2026-09-02", "2026-09-04"),
      taak("C", "2026-09-05", "2026-09-06"),
    ];
    const plan = shiftPlan(taken, [wacht("B", "A"), wacht("C", "B")]);
    expect(plan.map((p) => p.id)).toEqual(["B", "C"]);
    expect(plan[0].naarStart).toEqual(new Date("2026-09-11"));
    expect(plan[0].naarEind).toEqual(new Date("2026-09-13"));
    // C schuift op naar de nieuwe positie van B, niet naar de oude.
    expect(plan[1].naarStart).toEqual(new Date("2026-09-14"));
    expect(plan[1].naarEind).toEqual(new Date("2026-09-15"));
  });

  it("takes the latest of several predecessors", () => {
    const taken = [
      taak("A", "2026-09-01", "2026-09-05"),
      taak("B", "2026-09-01", "2026-09-20"),
      taak("C", "2026-09-02", "2026-09-03"),
    ];
    const plan = shiftPlan(taken, [wacht("C", "A"), wacht("C", "B")]);
    expect(plan).toHaveLength(1);
    expect(plan[0].naarStart).toEqual(new Date("2026-09-21"));
  });

  it("never pulls a task forward, only pushes it back", () => {
    // A is vervroegd en eindigt op de 3e; B mag blijven staan waar hij staat.
    const taken = [taak("A", "2026-09-01", "2026-09-03"), taak("B", "2026-10-01", "2026-10-05")];
    expect(shiftPlan(taken, [wacht("B", "A")])).toEqual([]);
  });

  it("reports the old dates alongside the new ones", () => {
    const taken = [taak("A", "2026-09-01", "2026-09-05"), taak("B", "2026-09-05", "2026-09-09")];
    const [regel] = shiftPlan(taken, [wacht("B", "A")]);
    expect(regel.name).toBe("taak B");
    expect(regel.vanStart).toEqual(new Date("2026-09-05"));
    expect(regel.vanEind).toEqual(new Date("2026-09-09"));
  });

  it("gives up on a cycle instead of looping forever", () => {
    // Zou niet moeten kunnen — de route weigert kringlopen — maar vastlopen op
    // onverwachte gegevens is erger dan niets doen.
    const taken = [taak("A", "2026-09-01", "2026-09-05"), taak("B", "2026-09-01", "2026-09-05")];
    expect(shiftPlan(taken, [wacht("A", "B"), wacht("B", "A")])).toEqual([]);
  });

  it("ignores links that point at a task it does not know", () => {
    const taken = [taak("A", "2026-09-01", "2026-09-05")];
    expect(shiftPlan(taken, [wacht("A", "ONBEKEND")])).toEqual([]);
  });
});

const vandaag = new Date("2026-09-15");

describe("planningWarnings", () => {
  const project = { plannedStart: "2026-09-01", plannedEnd: "2026-09-30" };

  it("flags a task that starts before its predecessor is done, naming the predecessor", () => {
    const taken = [taak("A", "2026-09-01", "2026-09-10"), taak("B", "2026-09-05", "2026-09-20")];
    const { perTaak } = planningWarnings(project, taken, [wacht("B", "A")], vandaag);
    expect(perTaak.B).toHaveLength(1);
    expect(perTaak.B[0].soort).toBe("te-vroeg");
    expect(perTaak.B[0].uitleg).toBe("Begint voordat 'taak A' klaar is");
  });

  it("does not flag a successor that starts the day after", () => {
    const taken = [taak("A", "2026-09-01", "2026-09-10"), taak("B", "2026-09-11", "2026-09-20")];
    const { perTaak } = planningWarnings(project, taken, [wacht("B", "A")], vandaag);
    expect(perTaak.B ?? []).toEqual([]);
  });

  it("flags a task that sticks out of the project period, with the period in the text", () => {
    const taken = [taak("A", "2026-09-20", "2026-10-15")];
    const { perTaak } = planningWarnings(project, taken, [], vandaag);
    expect(perTaak.A[0].soort).toBe("buiten-project");
    expect(perTaak.A[0].uitleg).toBe("Valt buiten de projectperiode (01-SEP-2026 t/m 30-SEP-2026)");
  });

  it("flags a task that started before the project did", () => {
    const taken = [taak("A", "2026-08-20", "2026-09-05")];
    const { perTaak } = planningWarnings(project, taken, [], vandaag);
    expect(perTaak.A.map((s) => s.soort)).toContain("buiten-project");
  });

  it("says a project runs over when its tasks end after its planned end", () => {
    const taken = [taak("A", "2026-09-20", "2026-10-15")];
    expect(planningWarnings(project, taken, [], vandaag).projectLooptUit).toBe(true);
    expect(planningWarnings(project, [taak("A", "2026-09-01", "2026-09-10")], [], vandaag).projectLooptUit).toBe(false);
  });

  it("explains in plain Dutch why a project runs over, with the planned end date", () => {
    const taken = [taak("A", "2026-09-20", "2026-10-15")];
    const { projectUitleg } = planningWarnings(project, taken, [], vandaag);
    expect(projectUitleg).toBe("Loopt door na de geplande einddatum van het project (30-SEP-2026)");
  });

  it("gives no explanation when the project does not run over", () => {
    const taken = [taak("A", "2026-09-01", "2026-09-10")];
    const { projectUitleg } = planningWarnings(project, taken, [], vandaag);
    expect(projectUitleg).toBeNull();
  });

  it("cannot judge a project without dates of its own", () => {
    // Dan spant de balk zich om de taken en kan er per definitie niets uitsteken.
    const los = { plannedStart: null, plannedEnd: null };
    const taken = [taak("A", "2026-01-01", "2026-12-31")];
    const { perTaak, projectLooptUit, projectUitleg } = planningWarnings(los, taken, [], vandaag);
    expect(perTaak.A ?? []).toEqual([]);
    expect(projectLooptUit).toBe(false);
    expect(projectUitleg).toBeNull();
  });

  it("marks a task whose end date has passed, quietly", () => {
    const taken = [taak("A", "2026-09-01", "2026-09-10")];
    const { perTaak } = planningWarnings(project, taken, [], vandaag);
    expect(perTaak.A[0].soort).toBe("verlopen");
    expect(perTaak.A[0].uitleg).toBe("De einddatum is voorbij");
  });

  it("does not call a task that ends today expired", () => {
    const taken = [taak("A", "2026-09-01", "2026-09-15")];
    const { perTaak } = planningWarnings(project, taken, [], vandaag);
    expect((perTaak.A ?? []).map((s) => s.soort)).not.toContain("verlopen");
  });

  it("can give one task several signals at once", () => {
    const taken = [taak("A", "2026-08-01", "2026-08-20"), taak("B", "2026-08-10", "2026-08-25")];
    const { perTaak } = planningWarnings(project, taken, [wacht("B", "A")], vandaag);
    expect(perTaak.B.map((s) => s.soort).sort()).toEqual(["buiten-project", "te-vroeg", "verlopen"]);
  });
});

describe("arrowPath", () => {
  const opties = { breedte: 1000, rijHoogte: 24, stub: 8 };

  it("leaves the right edge of the predecessor and arrives at the left edge of the successor", () => {
    const punten = arrowPath(
      { leftPct: 10, widthPct: 20, rij: 0 },
      { leftPct: 40, widthPct: 20, rij: 1 },
      opties,
    );
    expect(punten).toEqual([
      { x: 300, y: 12 },
      { x: 308, y: 12 },
      { x: 308, y: 36 },
      { x: 400, y: 36 },
    ]);
  });

  it("keeps its elbow when the successor sits on the same row", () => {
    const punten = arrowPath(
      { leftPct: 0, widthPct: 10, rij: 2 },
      { leftPct: 20, widthPct: 10, rij: 2 },
      opties,
    );
    expect(punten.map((p) => p.y)).toEqual([60, 60, 60, 60]);
    expect(punten.at(-1)?.x).toBe(200);
  });

  it("still draws when the successor starts too early, running backwards", () => {
    // Dat is precies het geval dat rood oplicht; verbergen zou de fout verhullen.
    const punten = arrowPath(
      { leftPct: 50, widthPct: 20, rij: 0 },
      { leftPct: 10, widthPct: 10, rij: 1 },
      opties,
    );
    expect(punten.at(-1)?.x).toBe(100);
    expect(punten[1].x).toBe(708);
  });

  it("uses a default stub when none is given", () => {
    const punten = arrowPath(
      { leftPct: 0, widthPct: 10, rij: 0 },
      { leftPct: 20, widthPct: 10, rij: 1 },
      { breedte: 1000, rijHoogte: 24 },
    );
    expect(punten[1].x).toBe(108);
  });
});
