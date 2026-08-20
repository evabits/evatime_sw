import { describe, it, expect } from "vitest";
import { cycleThrough, shiftPlan, type DependencyLink, type SchedulableTask } from "./task-dependencies";

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
