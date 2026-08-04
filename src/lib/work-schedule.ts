/**
 * Het vaste weekrooster van een medewerker: hoeveel uur hij op elke weekdag
 * werkt. Nul betekent nul, niet "niet ingevuld" — één rij per persoon bestaat
 * of bestaat niet, en dat onderscheid draagt het hele ontwerp: geen rooster
 * betekent overal "reken zoals je nu rekent".
 *
 * Er wordt uitsluitend in UTC gerekend, met `YYYY-MM-DD` in. De productieserver
 * draait op UTC en de gebruikers zitten in Amsterdam; `getDay()` rekent lokaal
 * en verschuift dan een dag zonder dat er iets klaagt.
 *
 * Weekend staat niet in het model: niemand werkt hier op zaterdag of zondag.
 */
export type WeekSchedule = {
  monday: number;
  tuesday: number;
  wednesday: number;
  thursday: number;
  friday: number;
};

/** Ruwe rij zoals Prisma hem geeft: Decimal-objecten, geen getallen. */
export type ScheduleRow = {
  monday: unknown;
  tuesday: unknown;
  wednesday: unknown;
  thursday: unknown;
  friday: unknown;
};

const DAGEN: Array<keyof WeekSchedule> = ["monday", "tuesday", "wednesday", "thursday", "friday"];

/** Index gelijk aan getUTCDay(): 0 = zondag. Weekend heeft geen veld. */
const PER_WEEKDAG: Array<keyof WeekSchedule | null> = [
  null, "monday", "tuesday", "wednesday", "thursday", "friday", null,
];

/** Sommen van Decimal(4,2)-waarden kunnen net naast een rond getal landen. */
function rond(n: number): number {
  return Math.round(n * 100) / 100;
}

/** De geroosterde uren voor een datum. Zaterdag en zondag geven altijd 0. */
export function scheduledHoursOn(schedule: WeekSchedule, date: string): number {
  const veld = PER_WEEKDAG[new Date(`${date}T00:00:00Z`).getUTCDay()];
  return veld ? schedule[veld] : 0;
}

/**
 * De som van de geroosterde uren van de verstreken weekdagen van deze week,
 * de dag zelf meegerekend.
 *
 * In het weekend is de hele week voorbij: zaterdag en zondag geven het
 * weektotaal. Zondag is `getUTCDay() === 0`, en dat mag niet als "nog geen
 * enkele weekdag verstreken" gelezen worden.
 */
export function targetSoFar(schedule: WeekSchedule, today: string): number {
  const dag = new Date(`${today}T00:00:00Z`).getUTCDay();
  const verstreken = dag === 0 ? 5 : Math.min(dag, 5);
  return rond(DAGEN.slice(0, verstreken).reduce((som, d) => som + schedule[d], 0));
}

/** Het weektotaal. Voor het scherm en om met weeklyHours te vergelijken. */
export function weekTotal(schedule: WeekSchedule): number {
  return rond(DAGEN.reduce((som, d) => som + schedule[d], 0));
}

/**
 * Zet een Prisma-rij om naar getallen, of geeft null wanneer er geen rij is.
 * Alle consumenten rekenen met getallen; de omzetting hoort één keer te
 * gebeuren, hier.
 */
export function toWeekSchedule(row: ScheduleRow | null | undefined): WeekSchedule | null {
  if (!row) return null;
  return {
    monday: Number(row.monday),
    tuesday: Number(row.tuesday),
    wednesday: Number(row.wednesday),
    thursday: Number(row.thursday),
    friday: Number(row.friday),
  };
}
