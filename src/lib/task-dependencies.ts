import { addDays, differenceInCalendarDays } from "date-fns";
import { formatDate } from "./utils";

/**
 * Afhankelijkheden tussen taken van hetzelfde project: welke koppeling een
 * kringloop zou sluiten, en hoe de planning eruitziet als je ze allemaal
 * respecteert.
 *
 * Apart van `planning.ts`, dat met bijna driehonderd regels lang genoeg is en
 * over de tijdlijn zelf gaat. Geen React en geen Prisma, zodat het te testen is
 * zonder database en zonder scherm.
 *
 * De vorm van een koppeling is overal `{ taskId, dependsOnId }` en betekent:
 * `taskId` wacht op `dependsOnId`. In de tijd komt `dependsOnId` dus eerst.
 */
export type DependencyLink = { taskId: string; dependsOnId: string };

export type SchedulableTask = {
  id: string;
  name: string;
  startDate: string | Date;
  endDate: string | Date;
};

/** Wat er van een taak wacht op wie, als opzoektabel. */
function wachtOpTabel(links: DependencyLink[]): Map<string, string[]> {
  const tabel = new Map<string, string[]>();
  for (const link of links) {
    const bestaand = tabel.get(link.taskId);
    if (bestaand) bestaand.push(link.dependsOnId);
    else tabel.set(link.taskId, [link.dependsOnId]);
  }
  return tabel;
}

/**
 * De keten die je zou sluiten door `taskId` op `dependsOnId` te laten wachten,
 * of `null` als het gewoon mag.
 *
 * De keten komt terug als lijst van id's die begint en eindigt bij `taskId`,
 * zodat de foutmelding kan tonen wélke ring je maakt in plaats van alleen dát
 * er een ring is. Zoeken doen we vanaf `dependsOnId` over bestaande
 * wacht-op-koppelingen: bereiken we `taskId`, dan is de ring rond.
 */
export function cycleThrough(
  links: DependencyLink[],
  taskId: string,
  dependsOnId: string,
): string[] | null {
  if (taskId === dependsOnId) return [taskId, taskId];

  const wachtOp = wachtOpTabel(links);
  const pad = [taskId, dependsOnId];
  const bezocht = new Set<string>();

  function zoek(huidig: string): boolean {
    if (huidig === taskId) return true;
    // Al gezien betekent: langs deze kant komen we niet uit bij taskId, en
    // nogmaals kijken zou bij een diamant of een ring nooit stoppen.
    if (bezocht.has(huidig)) return false;
    bezocht.add(huidig);
    for (const volgende of wachtOp.get(huidig) ?? []) {
      pad.push(volgende);
      if (zoek(volgende)) return true;
      pad.pop();
    }
    return false;
  }

  return zoek(dependsOnId) ? pad : null;
}

/**
 * De volgorde waarin je de taken kunt doorrekenen: elke taak komt ná alles waar
 * hij op wacht. `null` als dat niet kan, dus bij een kringloop.
 */
function topologischeVolgorde(
  taken: SchedulableTask[],
  links: DependencyLink[],
): string[] | null {
  const bekend = new Set(taken.map((t) => t.id));
  // Koppelingen naar taken buiten deze lijst tellen niet mee; die kunnen we
  // niet doorrekenen en mogen de volgorde niet blokkeren.
  const geldig = links.filter((l) => bekend.has(l.taskId) && bekend.has(l.dependsOnId));

  const openstaand = new Map<string, number>();
  for (const t of taken) openstaand.set(t.id, 0);
  for (const l of geldig) openstaand.set(l.taskId, (openstaand.get(l.taskId) ?? 0) + 1);

  const klaar = taken.filter((t) => openstaand.get(t.id) === 0).map((t) => t.id);
  const volgorde: string[] = [];

  while (klaar.length > 0) {
    const id = klaar.shift() as string;
    volgorde.push(id);
    for (const l of geldig) {
      if (l.dependsOnId !== id) continue;
      const rest = (openstaand.get(l.taskId) ?? 0) - 1;
      openstaand.set(l.taskId, rest);
      if (rest === 0) klaar.push(l.taskId);
    }
  }

  return volgorde.length === taken.length ? volgorde : null;
}

/** Eén regel uit het verschuif-overzicht. */
export type ShiftedTask = {
  id: string;
  name: string;
  vanStart: Date;
  vanEind: Date;
  naarStart: Date;
  naarEind: Date;
};

/**
 * Welke taken zouden verschuiven als je alle koppelingen respecteert.
 *
 * Kijkt naar de **hele toestand** van een project en niet naar één wijziging:
 * een nieuwe koppeling kan net zo goed een schending opleveren als een
 * verschoven datum, en zo dekt één functie allebei de gevallen zonder dat ze
 * uit de pas kunnen lopen.
 *
 * Schuift alleen vooruit. Naar voren trekken zou betekenen dat je een taak
 * vervroegt en er ineens werk op je scherm staat dat je niet hebt aangeraakt.
 *
 * Bij een kringloop komt er een lege lijst terug in plaats van een oneindige
 * lus. De koppelroute weigert kringlopen, dus dit hoort niet voor te komen —
 * maar vastlopen op onverwachte gegevens is erger dan niets doen.
 */
export function shiftPlan(taken: SchedulableTask[], links: DependencyLink[]): ShiftedTask[] {
  const volgorde = topologischeVolgorde(taken, links);
  if (!volgorde) return [];

  const opNaam = new Map(taken.map((t) => [t.id, t]));
  const nu = new Map(
    taken.map((t) => [t.id, { start: new Date(t.startDate), eind: new Date(t.endDate) }]),
  );
  const wachtOp = wachtOpTabel(links);

  const verschoven: ShiftedTask[] = [];

  for (const id of volgorde) {
    const voorgangers = (wachtOp.get(id) ?? []).filter((v) => nu.has(v));
    if (voorgangers.length === 0) continue;

    const huidig = nu.get(id) as { start: Date; eind: Date };
    // Einddatums zijn inclusief, dus de opvolger mag pas de dag erna beginnen.
    const laatsteEind = voorgangers
      .map((v) => (nu.get(v) as { eind: Date }).eind)
      .reduce((a, b) => (b > a ? b : a));
    const vereisteStart = addDays(laatsteEind, 1);
    if (huidig.start >= vereisteStart) continue;

    const dagen = differenceInCalendarDays(vereisteStart, huidig.start);
    const naarStart = addDays(huidig.start, dagen);
    const naarEind = addDays(huidig.eind, dagen);

    verschoven.push({
      id,
      name: (opNaam.get(id) as SchedulableTask).name,
      vanStart: huidig.start,
      vanEind: huidig.eind,
      naarStart,
      naarEind,
    });
    // Bijwerken, zodat wat áchter deze taak hangt met de nieuwe datum rekent en
    // niet met de oude.
    nu.set(id, { start: naarStart, eind: naarEind });
  }

  return verschoven;
}

/**
 * Eén markering op een taak, met de uitleg die bij hover verschijnt.
 *
 * De uitleg staat in gewone taal en niet als code: een kleur die je moet
 * onthouden is geen signaal maar een raadsel.
 */
export type TaakSignaal = {
  soort: "te-vroeg" | "buiten-project" | "verlopen";
  uitleg: string;
};

export type ProjectPeriode = {
  plannedStart?: string | Date | null;
  plannedEnd?: string | Date | null;
};

/**
 * Welke markeringen elke taak krijgt, en of de projectbalk zelf oplicht.
 *
 * "verlopen" is met opzet het stille signaal. Zonder "gereed" — dat komt pas in
 * deelproject C — is een afgelopen taak meestal gewoon afgerond werk, en een
 * scherm vol rood ga je negeren; dan is de rode markering die er wél toe doet
 * ook niets meer waard.
 *
 * Een project zonder eigen datums kan niets uitsteken: daar spant de balk zich
 * om de taken. Dan vervallen "buiten-project" en het uitlopen van het project.
 */
export function planningWarnings(
  project: ProjectPeriode,
  taken: SchedulableTask[],
  links: DependencyLink[],
  vandaag: Date,
): { perTaak: Record<string, TaakSignaal[]>; projectLooptUit: boolean } {
  const opNaam = new Map(taken.map((t) => [t.id, t]));
  const wachtOp = wachtOpTabel(links);

  const heeftPeriode = Boolean(project.plannedStart && project.plannedEnd);
  const periodeStart = heeftPeriode ? new Date(project.plannedStart as string) : null;
  const periodeEind = heeftPeriode ? new Date(project.plannedEnd as string) : null;

  const perTaak: Record<string, TaakSignaal[]> = {};
  let projectLooptUit = false;

  for (const t of taken) {
    const start = new Date(t.startDate);
    const eind = new Date(t.endDate);
    const signalen: TaakSignaal[] = [];

    // Een voorganger die op of ná de startdag van deze taak eindigt, is nog
    // bezig — einddatums zijn inclusief.
    for (const voorgangerId of wachtOp.get(t.id) ?? []) {
      const voorganger = opNaam.get(voorgangerId);
      if (!voorganger) continue;
      if (start <= new Date(voorganger.endDate)) {
        signalen.push({
          soort: "te-vroeg",
          uitleg: `Begint voordat '${voorganger.name}' klaar is`,
        });
        break;
      }
    }

    if (periodeStart && periodeEind) {
      if (start < periodeStart || eind > periodeEind) {
        signalen.push({
          soort: "buiten-project",
          uitleg: `Valt buiten de projectperiode (${formatDate(periodeStart)} t/m ${formatDate(periodeEind)})`,
        });
      }
      if (eind > periodeEind) projectLooptUit = true;
    }

    if (eind < vandaag) {
      signalen.push({ soort: "verlopen", uitleg: "De einddatum is voorbij" });
    }

    if (signalen.length > 0) perTaak[t.id] = signalen;
  }

  return { perTaak, projectLooptUit };
}

/** Een knikpunt van een pijl, in pixels binnen de tijdlijnstrook. */
export type ArrowPoint = { x: number; y: number };

export type ArrowEnd = { leftPct: number; widthPct: number; rij: number };

/** Hoever de pijl rechtdoor gaat voordat hij afbuigt. */
const STUB_PX = 8;

/**
 * De knikpunten van de pijl tussen twee taakbalken: uit de rechterrand van de
 * voorganger, een stukje rechtdoor, dan verticaal naar de rij van de opvolger,
 * en zo naar diens linkerrand.
 *
 * Hier en niet in het component, omdat dit rekenwerk is en dus te testen hoort
 * te zijn. Loopt de opvolger te vroeg, dan wijst het laatste stuk naar links —
 * dat is precies het geval dat rood oplicht, en verbergen zou de fout verhullen.
 */
export function arrowPath(
  van: ArrowEnd,
  naar: ArrowEnd,
  opties: { breedte: number; rijHoogte: number; stub?: number },
): ArrowPoint[] {
  const stub = opties.stub ?? STUB_PX;
  const vanX = ((van.leftPct + van.widthPct) / 100) * opties.breedte;
  const vanY = (van.rij + 0.5) * opties.rijHoogte;
  const naarX = (naar.leftPct / 100) * opties.breedte;
  const naarY = (naar.rij + 0.5) * opties.rijHoogte;

  return [
    { x: vanX, y: vanY },
    { x: vanX + stub, y: vanY },
    { x: vanX + stub, y: naarY },
    { x: naarX, y: naarY },
  ];
}
