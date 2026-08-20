import { weeksInMonth } from "./payroll";

/**
 * Het doorlopende urensaldo: welke maanden meetellen, wat de target van een
 * maand is, en hoe de opsomming eruitziet.
 *
 * Het saldo wordt uitgerekend en niet opgeslagen. In deze app worden uren met
 * terugwerkende kracht gecorrigeerd; een vastgelegd maandsaldo van drie maanden
 * terug klopt dan niet meer. Met dertien medewerkers en een handvol maanden is
 * doorrekenen goedkoop.
 *
 * Geen React en geen Prisma, zodat het te testen is zonder database en zonder
 * scherm.
 */

/** Een kalendermaand als `"2026-09"`. */
export type MonthKey = string;

function toKey(jaar: number, maand1: number): MonthKey {
  return `${jaar}-${String(maand1).padStart(2, "0")}`;
}

/**
 * De maanden die meetellen: vanaf de maand van de peildatum tot en met de
 * vórige maand.
 *
 * De lopende maand telt bewust niet mee. Wie halverwege de maand zit heeft nog
 * niet zijn hele target gewerkt en zou anders tot de laatste dag tientallen uren
 * in de min staan.
 */
export function monthsToSettle(peildatum: string, vandaag: Date): MonthKey[] {
  const [jaar, maand] = peildatum.split("-").map(Number);
  const eindJaar = vandaag.getFullYear();
  const eindMaand = vandaag.getMonth() + 1;

  const maanden: MonthKey[] = [];
  let j = jaar;
  let m = maand;
  while (j < eindJaar || (j === eindJaar && m < eindMaand)) {
    maanden.push(toKey(j, m));
    m += 1;
    if (m > 12) {
      m = 1;
      j += 1;
    }
  }
  return maanden;
}

/**
 * De geboekte uren per kalendermaand.
 *
 * "Geboekt" is letterlijk alles wat er in `TimeEntry` staat, werk én verlof:
 * verlof is daar gewoon een urenregel met een verwijzing naar de
 * verlofaanvraag. Zonder verlof zou iedereen die op vakantie gaat een tekort
 * opbouwen van tientallen uren, en meet het saldo vakantie in plaats van
 * overwerk.
 */
export function bucketHoursByMonth(
  entries: { date: string | Date; hours: number | string }[],
): Record<MonthKey, number> {
  const per: Record<MonthKey, number> = {};
  for (const e of entries) {
    const d = new Date(e.date);
    const key = toKey(d.getFullYear(), d.getMonth() + 1);
    // Number() is dragend: Prisma levert Decimal als string, en optellen zonder
    // omzetting plakt ze aan elkaar.
    per[key] = Math.round(((per[key] ?? 0) + Number(e.hours)) * 100) / 100;
  }
  return per;
}

/**
 * De target van één maand: contracturen × weken in die maand.
 *
 * `weeksInMonth` is `dagen ÷ 7`, dezelfde formule die de loonverwerking al
 * gebruikt. Juli komt zo op 4,43 weken uit en niet op 4; over een jaar telt dat
 * op tot 52,14 weken.
 *
 * `null` zonder contract of bij een nul-urencontract: dan is er geen target en
 * telt die maand als niets, niet als tekort.
 */
export function monthTarget(contracturen: number | null, key: MonthKey): number | null {
  if (contracturen == null || contracturen <= 0) return null;
  const [jaar, maand] = key.split("-").map(Number);
  return Math.round(contracturen * weeksInMonth(jaar, maand) * 10) / 10;
}

/**
 * Keurt de peildatum. Nederlandse melding, of `null` als het mag.
 *
 * Hij moet op de eerste van een maand liggen. Anders is die eerste maand half en
 * moet er naar rato gerekend worden — een extra regel die alleen vragen oproept.
 * Leeg mag: dat betekent dat deze medewerker geen saldo heeft.
 */
export function validateOpeningDate(datum: string | null | undefined): string | null {
  if (!datum) return null;
  if (!datum.endsWith("-01")) return "De peildatum moet op de eerste van een maand liggen";
  return null;
}

export type OvertimeAdjustmentLine = {
  id: string;
  date: string;
  hours: number;
  reason: string;
};

/** Eén regel uit de opsomming. `hours` is telkens wat die regel bij het saldo optelt. */
export type LedgerLine =
  | { kind: "opening"; date: string; hours: number }
  | { kind: "month"; key: MonthKey; geboekt: number; target: number | null; hours: number }
  | { kind: "adjustment"; id: string; date: string; hours: number; reason: string };

/** Waarop een regel chronologisch sorteert. */
function sorteerDatum(line: LedgerLine): string {
  // Een maandregel sorteert op de éérste van die maand, zodat een mutatie
  // halverwege oktober ná de oktoberregel komt te staan en niet ervóór.
  if (line.kind === "month") return `${line.key}-01`;
  return line.date;
}

/**
 * De opsomming en het saldo.
 *
 * De lopende maand komt apart terug in `lopend` en telt niet mee in `saldo` —
 * hij is nog niet af, en meerekenen zou iedereen tot de laatste dag van de maand
 * in de min zetten.
 */
export function overtimeLedger(opts: {
  openingDate: string | null;
  openingHours: number;
  months: MonthKey[];
  hoursByMonth: Record<MonthKey, number>;
  contractHoursByMonth: Record<MonthKey, number | null>;
  adjustments: OvertimeAdjustmentLine[];
  vandaag: Date;
  lopendeUren: number;
  lopendContract: number | null;
}): {
  lines: LedgerLine[];
  saldo: number;
  lopend: { key: MonthKey; geboekt: number; target: number | null } | null;
} {
  if (!opts.openingDate) return { lines: [], saldo: 0, lopend: null };

  const lines: LedgerLine[] = [
    { kind: "opening", date: opts.openingDate, hours: opts.openingHours },
  ];

  for (const key of opts.months) {
    const geboekt = opts.hoursByMonth[key] ?? 0;
    const target = monthTarget(opts.contractHoursByMonth[key] ?? null, key);
    lines.push({
      kind: "month",
      key,
      geboekt,
      target,
      // Zonder target telt de maand als niets. Vóór indiensttreding of ná
      // vertrek is er geen doel om tegen af te rekenen.
      hours: target == null ? 0 : Math.round((geboekt - target) * 10) / 10,
    });
  }

  for (const m of opts.adjustments) {
    lines.push({ kind: "adjustment", id: m.id, date: m.date, hours: m.hours, reason: m.reason });
  }

  lines.sort((a, b) => sorteerDatum(a).localeCompare(sorteerDatum(b)));

  const saldo = Math.round(lines.reduce((som, l) => som + l.hours, 0) * 10) / 10;

  const lopendeKey = toKey(opts.vandaag.getFullYear(), opts.vandaag.getMonth() + 1);
  return {
    lines,
    saldo,
    lopend: {
      key: lopendeKey,
      geboekt: opts.lopendeUren,
      target: monthTarget(opts.lopendContract, lopendeKey),
    },
  };
}
