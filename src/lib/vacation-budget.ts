import { getEffectiveContract, rangeOverlaps, type ContractDates } from "./contracts";

/**
 * Het vakantiesaldo komt uit twee bronnen, en die moeten niet uit elkaar
 * lopen. Een `VacationBudget`-rij is de uitzondering voor één jaar; het
 * contract is de gewone gang van zaken. Deze module bepaalt op één plek welke
 * van de twee geldt, zodat het dashboard en het verlofscherm hetzelfde getal
 * tonen.
 */
export type ContractVacation = ContractDates & { vacationHours: number | null };

/**
 * Een budgetregel zoals het verlofscherm hem kent. `id` is null wanneer de
 * regel uit een contract is afgeleid en er dus geen rij in de database staat —
 * daaraan hangt in het scherm de tekst "uit contract" en het ontbreken van de
 * verwijderknop.
 */
export type BudgetRow = {
  id: string | null;
  userId: string;
  year: number;
  hours: number;
  user: { id: string; name: string };
};

/**
 * De vakantie-uren die de contracten voor een jaar opleveren, of null.
 *
 * Het contract dat op 31 december geldt is leidend. Zwijgt dat over
 * vakantie-uren, dan is er geen afspraak en wordt er niet verder gezocht: een
 * ouder contract erbij halen zou een verlopen afspraak laten doorwerken.
 *
 * Is er op die datum géén contract, dan telt het laatste contract dat het jaar
 * nog overlapte. Zonder die stap zou iemand van wie het contract in augustus
 * afliep over dat jaar geen budget hebben, terwijl hij er de halve tijd wel
 * een had.
 */
export function contractVacationHours(contracts: ContractVacation[], year: number): number | null {
  const eind = `${year}-12-31`;
  const geldend = getEffectiveContract(contracts, eind);
  if (geldend) return geldend.vacationHours;

  const overlappend = contracts
    .filter((c) => rangeOverlaps(c.startDate, c.endDate, `${year}-01-01`, eind))
    .sort((a, b) => (a.startDate ?? "").localeCompare(b.startDate ?? ""));
  const laatste = overlappend[overlappend.length - 1];
  return laatste ? laatste.vacationHours : null;
}

/**
 * De streep die het handgeschreven verleden van de registratie scheidt.
 * `used` is het totaal dat de medewerker tot `date` had opgenomen — dat weet
 * de app niet, want zo ver gaat de administratie niet terug. Vanaf `date` telt
 * ze zelf.
 */
export type VacationOpening = { date: string; used: number };

const DAG = 86_400_000;

function afgerond(getal: number): number {
  return Math.round(getal * 100) / 100;
}

/**
 * Wat de contracten over één jaar aan vakantie-uren opleveren, naar rato van de
 * dagen die ze van dat jaar beslaan. Wie in november in dienst kwam bouwt over
 * dat jaar geen heel jaar vakantie op, en een jaar waarin twee contracten
 * elkaar opvolgen levert van allebei het eigen deel.
 *
 * Een budgetrij voor dat jaar vervangt de contracten volledig: die is met de
 * hand gezet en gaat voor.
 */
export function proRataYearHours(
  contracts: ContractVacation[],
  budgets: Array<{ year: number; hours: number }>,
  year: number,
): number {
  const rij = budgets.find((b) => b.year === year);
  if (rij) return rij.hours;

  const jaarStart = Date.UTC(year, 0, 1);
  const jaarEind = Date.UTC(year + 1, 0, 1);
  let totaal = 0;
  for (const c of contracts) {
    if (c.vacationHours == null) continue;
    const start = c.startDate ? Date.parse(`${c.startDate}T00:00:00Z`) : -Infinity;
    // De einddatum is de laatste dag die meetelt, dus het contract loopt tot
    // en met de dag erna om middernacht.
    const eind = c.endDate ? Date.parse(`${c.endDate}T00:00:00Z`) + DAG : Infinity;
    const overlap = Math.min(eind, jaarEind) - Math.max(start, jaarStart);
    if (overlap <= 0) continue;
    totaal += (c.vacationHours * overlap) / (jaarEind - jaarStart);
  }
  return afgerond(totaal);
}

/**
 * Het vakantierecht dat iemand t/m `year` heeft opgebouwd: elk jaar vanaf zijn
 * eerste contract, naar rato van de contractdagen. Een jaar zonder contract
 * levert vanzelf nul op, zodat de opbouw stopt zodra iemand uit dienst is.
 *
 * Zonder peildatum blijft het bij het recht van het lopende jaar, zoals het
 * altijd was. De opbouw over eerdere jaren zegt namelijk niets zolang er geen
 * getal tegenover staat voor wat er in die jaren is opgenomen — en dat getal
 * is precies wat de peildatum meebrengt.
 */
export function accruedVacationHours(
  contracts: ContractVacation[],
  budgets: Array<{ year: number; hours: number }>,
  opening: VacationOpening | null,
  year: number,
): number {
  if (!opening) {
    const rij = budgets.find((b) => b.year === year);
    return rij ? rij.hours : (contractVacationHours(contracts, year) ?? 0);
  }

  const jaren = contracts
    .map((c) => (c.startDate ? Number(c.startDate.slice(0, 4)) : year))
    .filter((y) => y <= year);
  const eersteJaar = jaren.length ? Math.min(...jaren) : year;

  let totaal = 0;
  for (let y = eersteJaar; y <= year; y++) totaal += proRataYearHours(contracts, budgets, y);
  return afgerond(totaal);
}

/**
 * De datum vanaf wanneer de geregistreerde vakantie meetelt: de peildatum, of
 * anders 1 januari van het lopende jaar. Alles ervóór zit in het ingevulde
 * totaal of valt buiten het jaar.
 */
export function vacationCountFrom(opening: VacationOpening | null, year: number): string {
  return opening ? opening.date : `${year}-01-01`;
}

/**
 * De peildatumvelden van een Prisma-gebruiker naar de vorm die `vacationBalance`
 * verwacht. Zonder datum is er geen peildatum, ook al staat er een getal.
 */
export function toVacationOpening(
  user: { vacationOpeningDate: Date | null; vacationOpeningUsed: unknown } | null,
): VacationOpening | null {
  if (!user?.vacationOpeningDate) return null;
  return {
    date: user.vacationOpeningDate.toISOString().slice(0, 10),
    used: Number(user.vacationOpeningUsed ?? 0),
  };
}

export type VacationBalance = { entitled: number; used: number; remaining: number };

/**
 * Het vakantiesaldo van één medewerker: wat hij heeft opgebouwd, wat hij ervan
 * heeft opgenomen en wat er overblijft.
 *
 * Beide kanten beslaan hetzelfde venster — vanaf de peildatum t/m het eind van
 * `year`. Anders zou vakantie die al voor volgend jaar is vastgelegd worden
 * afgetrokken van een recht dat pas volgend jaar wordt opgebouwd.
 */
export function vacationBalance(
  contracts: ContractVacation[],
  budgets: Array<{ year: number; hours: number }>,
  approved: Array<{ date: string; hours: number }>,
  opening: VacationOpening | null,
  year: number,
): VacationBalance {
  const vanaf = vacationCountFrom(opening, year);
  const tot = `${year}-12-31`;
  const entitled = accruedVacationHours(contracts, budgets, opening, year);
  const used = afgerond(
    (opening?.used ?? 0) +
      approved.filter((a) => a.date >= vanaf && a.date <= tot).reduce((s, a) => s + a.hours, 0),
  );
  return { entitled, used, remaining: afgerond(entitled - used) };
}

/**
 * De budgetlijst aangevuld met wat de contracten opleveren.
 *
 * Een bestaande rij blijft ongemoeid — die is met de hand gezet en gaat vóór
 * het contract. Wie geen rij heeft en wél een contractgetal, krijgt een regel
 * zonder id. Wie geen van beide heeft komt er niet in voor: geen budget is
 * iets anders dan een budget van nul.
 *
 * Er wordt op naam gesorteerd omdat de bestaande query dat ook doet; zonder
 * die sortering zouden de afgeleide regels als klomp onderaan belanden.
 */
export function fillBudgets(
  budgets: BudgetRow[],
  users: Array<{ id: string; name: string }>,
  contracts: Array<ContractVacation & { userId: string }>,
  year: number,
): BudgetRow[] {
  const heeftRij = new Set(budgets.map((b) => b.userId));
  const afgeleid: BudgetRow[] = [];

  for (const u of users) {
    if (heeftRij.has(u.id)) continue;
    const uren = contractVacationHours(contracts.filter((c) => c.userId === u.id), year);
    if (uren === null) continue;
    afgeleid.push({ id: null, userId: u.id, year, hours: uren, user: { id: u.id, name: u.name } });
  }

  return [...budgets, ...afgeleid].sort((a, b) => a.user.name.localeCompare(b.user.name));
}

/**
 * Prisma-rijen naar de vorm die de functies hierboven verwachten: datums als
 * `YYYY-MM-DD` en `Decimal` als getal. Twee pagina's doen deze omzetting, dus
 * hij hoort één keer te bestaan.
 */
export function toContractVacation<
  T extends { userId: string; startDate: Date | null; endDate: Date | null; vacationHours: unknown },
>(rows: T[]): Array<ContractVacation & { userId: string }> {
  return rows.map((r) => ({
    userId: r.userId,
    startDate: r.startDate ? r.startDate.toISOString().slice(0, 10) : null,
    endDate: r.endDate ? r.endDate.toISOString().slice(0, 10) : null,
    vacationHours: r.vacationHours != null ? Number(r.vacationHours) : null,
  }));
}
