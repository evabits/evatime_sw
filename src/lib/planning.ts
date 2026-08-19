import { max, min } from "date-fns";
import { ZONDER_KLANT } from "./project-picker";

/**
 * De rekenkunde achter de projecttijdlijn: welke balk een project krijgt, welk
 * venster de tijdlijn beslaat en waar een balk daarbinnen staat.
 *
 * Geen React en geen Prisma, zodat het te testen is zonder database en zonder
 * scherm — de conventie van dit project.
 */
export type PlanningTask = {
  id: string;
  name: string;
  startDate: string | Date;
  endDate: string | Date;
  sortOrder: number;
};

export type PlanningProject = {
  id: string;
  name: string;
  plannedStart?: string | Date | null;
  plannedEnd?: string | Date | null;
  customer?: { name: string } | null;
  tasks: PlanningTask[];
};

/** Start en eind, allebei inclusief. */
export type DateRange = { start: Date; end: Date };

/**
 * De balk van een project: zijn eigen datums als je die hebt ingevuld, anders
 * de omhullende van zijn taken, anders `null` — dat laatste betekent "nog niet
 * gepland" en hoort in de lijst onderaan het scherm.
 *
 * Allebei de eigen datums moeten gevuld zijn. De API weigert een halve
 * invulling al, maar één losse datum levert geen balk op en mag hier dus nooit
 * tot een gok leiden.
 */
export function projectBar(project: PlanningProject): DateRange | null {
  if (project.plannedStart && project.plannedEnd) {
    return { start: new Date(project.plannedStart), end: new Date(project.plannedEnd) };
  }
  if (project.tasks.length === 0) return null;
  return {
    start: min(project.tasks.map((t) => new Date(t.startDate))),
    end: max(project.tasks.map((t) => new Date(t.endDate))),
  };
}

/** De projecten zonder balk. Zonder deze lijst verdwijnen ze uit beeld. */
export function unplannedProjects(projects: PlanningProject[]): PlanningProject[] {
  return projects.filter((p) => projectBar(p) === null);
}

/**
 * Keurt een ingevoerd datumbereik. Geeft een leesbare Nederlandse melding
 * terug, of `null` als het mag.
 *
 * Allebei leeg is goed: bij een project betekent dat "volg de taken". Half
 * ingevuld is fout, want daar valt geen balk uit te tekenen.
 */
export function validateDateRange(
  start: string | null | undefined,
  end: string | null | undefined,
): string | null {
  const heeftStart = Boolean(start);
  const heeftEind = Boolean(end);
  if (!heeftStart && !heeftEind) return null;
  if (heeftStart !== heeftEind) return "Vul een startdatum én een einddatum in, of allebei niet";
  if (new Date(end as string) < new Date(start as string)) return "De einddatum ligt vóór de startdatum";
  return null;
}

export type PlanningGroup = { customerName: string; projects: PlanningProject[] };

/**
 * Per klant gegroepeerd, in dezelfde volgorde als de projectkiezer: klantnaam
 * en dan projectnaam, Nederlands vergeleken zodat hoofdletters en accenten
 * vallen zoals je verwacht. Projecten zonder klant staan achteraan; tussen de
 * klanten zouden ze bovenaan belanden puur omdat hun klantnaam leeg is.
 */
export function groupByCustomer(projects: PlanningProject[]): PlanningGroup[] {
  const perKlant = new Map<string, PlanningProject[]>();
  for (const p of projects) {
    const klant = p.customer?.name?.trim() || ZONDER_KLANT;
    const bestaande = perKlant.get(klant);
    if (bestaande) bestaande.push(p);
    else perKlant.set(klant, [p]);
  }

  return [...perKlant.entries()]
    .sort(([a], [b]) => {
      const aLos = a === ZONDER_KLANT;
      const bLos = b === ZONDER_KLANT;
      if (aLos !== bLos) return aLos ? 1 : -1;
      return a.localeCompare(b, "nl", { sensitivity: "base" });
    })
    .map(([customerName, groep]) => ({
      customerName,
      projects: [...groep].sort((a, b) => a.name.localeCompare(b.name, "nl", { sensitivity: "base" })),
    }));
}
