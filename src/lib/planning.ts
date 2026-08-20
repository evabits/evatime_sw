import {
  addDays, differenceInCalendarDays, max, min,
  eachMonthOfInterval, eachWeekOfInterval, eachQuarterOfInterval,
  endOfMonth, endOfQuarter, getISOWeek, getQuarter,
} from "date-fns";
import { ZONDER_KLANT } from "./project-picker";
import { MAANDEN } from "./utils";

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
  /** Waar deze taak op wacht. Alleen gevuld op het planningsscherm. */
  waitsOn?: { dependsOnId: string }[];
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

/** Lucht links en rechts van het geplande werk, zodat balken niet tegen de rand plakken. */
const VENSTER_MARGE_DAGEN = 7;
/** Het venster als er nog niets gepland is: genoeg verleden om te zien wat liep, genoeg toekomst om in te plannen. */
const LEEG_VENSTER_TERUG = 30;
const LEEG_VENSTER_VOORUIT = 90;

/**
 * Het venster dat de tijdlijn beslaat.
 *
 * Neemt projectbalken én taakdatums mee. Een taak mag buiten de datums van
 * zijn eigen project vallen — dat is toegestaan en juist de waarschuwing dat de
 * planning niet klopt — en dan moet die taak wel zichtbaar blijven.
 */
export function timelineWindow(projects: PlanningProject[], vandaag: Date): DateRange {
  const datums: Date[] = [];
  for (const project of projects) {
    const bar = projectBar(project);
    if (bar) datums.push(bar.start, bar.end);
    for (const taak of project.tasks) {
      datums.push(new Date(taak.startDate), new Date(taak.endDate));
    }
  }

  if (datums.length === 0) {
    return {
      start: addDays(vandaag, -LEEG_VENSTER_TERUG),
      end: addDays(vandaag, LEEG_VENSTER_VOORUIT),
    };
  }

  return {
    start: addDays(min(datums), -VENSTER_MARGE_DAGEN),
    end: addDays(max(datums), VENSTER_MARGE_DAGEN),
  };
}

/** Plek en breedte van een balk, als percentage van het venster. */
export type BarGeometry = { leftPct: number; widthPct: number };

/**
 * Waar een balk in het venster staat.
 *
 * Alles telt in hele dagen en einddatums zijn inclusief, vandaar de `+ 1` op
 * beide lengtes: zonder die op de duur krijgt een taak van één dag breedte nul
 * en verdwijnt hij uit beeld.
 */
export function barGeometry(
  start: string | Date,
  end: string | Date,
  venster: DateRange,
): BarGeometry {
  const vensterDagen = differenceInCalendarDays(venster.end, venster.start) + 1;
  const vanaf = differenceInCalendarDays(new Date(start), venster.start);
  const duur = differenceInCalendarDays(new Date(end), new Date(start)) + 1;
  return {
    leftPct: (vanaf / vensterDagen) * 100,
    widthPct: (duur / vensterDagen) * 100,
  };
}

/**
 * De plek van de vandaag-streep, of `null` als vandaag buiten het venster valt.
 * Dat gebeurt echt: plan je alleen werk voor volgend jaar, dan hoort er geen
 * streep te staan in plaats van eentje tegen de rand geplakt.
 */
export function todayOffsetPct(vandaag: Date, venster: DateRange): number | null {
  if (vandaag < venster.start || vandaag > venster.end) return null;
  const vensterDagen = differenceInCalendarDays(venster.end, venster.start) + 1;
  return (differenceInCalendarDays(vandaag, venster.start) / vensterDagen) * 100;
}

export type OrderedTask = { id: string; sortOrder: number };

/**
 * Wisselt een taak met zijn buur en nummert de hele lijst opnieuw van nul af.
 *
 * Hernummeren in plaats van alleen twee waarden omruilen, omdat de nummering
 * niet te vertrouwen is: na een samenvoeging lopen twee reeksen door elkaar en
 * kunnen taken dezelfde `sortOrder` delen. Omruilen zou dan niets doen.
 *
 * Een lege lijst betekent "er valt niets te verplaatsen" — de taak staat al
 * boven- of onderaan, of bestaat niet.
 */
export function swapOrder(
  taken: OrderedTask[],
  id: string,
  richting: "up" | "down",
): OrderedTask[] {
  // Op id als tweede sleutel, zodat gelijke nummers toch een vaste volgorde
  // hebben en het resultaat voorspelbaar is.
  const gesorteerd = [...taken].sort(
    (a, b) => a.sortOrder - b.sortOrder || a.id.localeCompare(b.id),
  );

  const van = gesorteerd.findIndex((t) => t.id === id);
  if (van === -1) return [];
  const naar = richting === "up" ? van - 1 : van + 1;
  if (naar < 0 || naar >= gesorteerd.length) return [];

  const nieuw = [...gesorteerd];
  [nieuw[van], nieuw[naar]] = [nieuw[naar], nieuw[van]];
  return nieuw.map((t, index) => ({ id: t.id, sortOrder: index }));
}

export type TimelineSegment = { key: string; label: string; leftPct: number; widthPct: number };
export type TimelineHeader = { boven: TimelineSegment[]; onder: TimelineSegment[] };

/**
 * Bouwt één kalenderrij (maanden, weken of kwartalen) van segmenten die samen
 * het venster dekken, elk afgeknipt op de vensterranden zodat het eerste en
 * laatste segment niet buiten de balken eronder uitsteken.
 *
 * `periodeStart`/`periodeEind` geven van een datum in de rij het volledige
 * kalenderblok terug (bv. de hele maand); de geometrie knipt dat blok daarna
 * op het venster af via dezelfde barGeometry als de balken gebruiken.
 */
function segmentRij(
  data: Date[],
  periodeEind: (d: Date) => Date,
  label: (d: Date) => string,
  key: (d: Date) => string,
  venster: DateRange,
): TimelineSegment[] {
  return data.map((d) => {
    const start = max([d, venster.start]);
    const eind = min([periodeEind(d), venster.end]);
    const geo = barGeometry(start, eind, venster);
    return { key: key(d), label: label(d), leftPct: geo.leftPct, widthPct: geo.widthPct };
  });
}

const maandLabelMetJaar = (d: Date) => `${MAANDEN[d.getMonth()]} ${d.getFullYear()}`;
const maandKey = (d: Date) => `${d.getFullYear()}-${d.getMonth()}`;

/**
 * De tijdas boven de balken: bij weken maanden met weeknummers eronder, bij
 * maanden alleen maanden, bij kwartalen kwartalen met maanden eronder.
 *
 * Puur rekenwerk, geen React — zodat het zonder scherm te testen is, net als
 * de rest van dit bestand.
 */
export function timelineHeader(venster: DateRange, zoom: "weken" | "maanden" | "kwartalen"): TimelineHeader {
  const maanden = eachMonthOfInterval({ start: venster.start, end: venster.end });

  if (zoom === "maanden") {
    return {
      boven: segmentRij(maanden, endOfMonth, maandLabelMetJaar, maandKey, venster),
      onder: [],
    };
  }

  if (zoom === "weken") {
    const weken = eachWeekOfInterval({ start: venster.start, end: venster.end }, { weekStartsOn: 1 });
    return {
      boven: segmentRij(maanden, endOfMonth, maandLabelMetJaar, maandKey, venster),
      onder: segmentRij(
        weken,
        (d) => addDays(d, 6),
        (d) => `${getISOWeek(d)}`,
        (d) => `w-${d.toISOString()}`,
        venster,
      ),
    };
  }

  const kwartalen = eachQuarterOfInterval({ start: venster.start, end: venster.end });
  return {
    boven: segmentRij(
      kwartalen,
      endOfQuarter,
      (d) => `Q${getQuarter(d)} ${d.getFullYear()}`,
      (d) => `${d.getFullYear()}-Q${getQuarter(d)}`,
      venster,
    ),
    onder: segmentRij(maanden, endOfMonth, (d) => MAANDEN[d.getMonth()], maandKey, venster),
  };
}
