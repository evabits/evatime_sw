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
 * Het saldo waarmee een medewerker EVAtime binnenkomt: wat hij op `date` nog
 * had staan. Wat daarvóór is opgenomen zit erin verwerkt en wordt niet meer
 * apart geteld — de app kent dat verleden niet.
 */
export type VacationOpening = { date: string; hours: number };

/** Het recht over één jaar: een budgetrij gaat vóór het contract. */
function jaarrecht(
  contracts: ContractVacation[],
  budgets: Array<{ year: number; hours: number }>,
  year: number,
): number {
  const rij = budgets.find((b) => b.year === year);
  return rij ? rij.hours : (contractVacationHours(contracts, year) ?? 0);
}

/**
 * Het opgebouwde vakantierecht t/m `year`: het beginsaldo plus het recht van
 * elk jaar vanaf de peildatum.
 *
 * Het jaar waarin de peildatum valt telt naar rato van de dagen die er nog van
 * over zijn — het deel ervóór zit al in het beginsaldo. Elk jaar daarna telt
 * heel mee, en een jaar dat geen contract meer raakt levert vanzelf nul op,
 * zodat de opbouw stopt zodra iemand uit dienst is.
 *
 * Zonder beginsaldo blijft het bij het recht van het lopende jaar, zoals het
 * altijd was. Zo verspringt het getal van niemand voordat de peildatum is
 * ingevuld.
 */
export function accruedVacationHours(
  contracts: ContractVacation[],
  budgets: Array<{ year: number; hours: number }>,
  opening: VacationOpening | null,
  year: number,
): number {
  if (!opening) return jaarrecht(contracts, budgets, year);

  const vanaf = Date.parse(`${opening.date}T00:00:00Z`);
  const startJaar = Number(opening.date.slice(0, 4));

  let totaal = opening.hours;
  for (let y = startJaar; y <= year; y++) {
    const jaarStart = Date.UTC(y, 0, 1);
    const jaarEind = Date.UTC(y + 1, 0, 1);
    const deel = (jaarEind - Math.max(vanaf, jaarStart)) / (jaarEind - jaarStart);
    if (deel <= 0) continue;
    totaal += jaarrecht(contracts, budgets, y) * deel;
  }
  return Math.round(totaal * 100) / 100;
}

/**
 * De datum vanaf wanneer er geteld wordt: de peildatum van het beginsaldo, of
 * anders 1 januari van het lopende jaar. Alles ervóór zit in het beginsaldo of
 * valt buiten het jaar.
 */
export function vacationCountFrom(opening: VacationOpening | null, year: number): string {
  return opening ? opening.date : `${year}-01-01`;
}

/**
 * De beginsaldovelden van een Prisma-gebruiker naar de vorm die `vacationBalance`
 * verwacht. Zonder peildatum is er geen beginsaldo, ook al staat er een getal.
 */
export function toVacationOpening(
  user: { vacationOpeningDate: Date | null; vacationOpeningHours: unknown } | null,
): VacationOpening | null {
  if (!user?.vacationOpeningDate) return null;
  return {
    date: user.vacationOpeningDate.toISOString().slice(0, 10),
    hours: Number(user.vacationOpeningHours ?? 0),
  };
}

export type VacationBalance = { entitled: number; used: number; remaining: number };

/**
 * Het vakantiesaldo van één medewerker: wat hij heeft opgebouwd, wat hij ervan
 * heeft opgenomen en wat er overblijft. Beide kanten tellen vanaf dezelfde
 * datum, anders trek je opgenomen uren af van een recht dat ze niet dekt.
 */
export function vacationBalance(
  contracts: ContractVacation[],
  budgets: Array<{ year: number; hours: number }>,
  approved: Array<{ date: string; hours: number }>,
  opening: VacationOpening | null,
  year: number,
): VacationBalance {
  const vanaf = vacationCountFrom(opening, year);
  const entitled = accruedVacationHours(contracts, budgets, opening, year);
  const used = approved.filter((a) => a.date >= vanaf).reduce((s, a) => s + a.hours, 0);
  return { entitled, used, remaining: Math.round((entitled - used) * 100) / 100 };
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
