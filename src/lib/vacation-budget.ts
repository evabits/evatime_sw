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
