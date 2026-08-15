import { getEffectiveContract, nextDay, rangeOverlaps, type ContractDates } from "./contracts";

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

const dag = (datum: string) => Date.parse(`${datum}T00:00:00Z`);

/**
 * Wat één contract tussen twee datums aan vakantie-uren opbouwt. `to` valt er
 * net buiten, zoals bij elk halfopen bereik.
 *
 * Het contract spreekt van uren *per jaar*, en dat jaar wordt gemeten vanaf de
 * contractstart — niet vanaf 1 januari. Een contract dat van 1 september tot
 * 31 augustus loopt levert daardoor exact zijn eigen uren, ook als er een
 * schrikkeldag in valt. Een contract dat korter of langer duurt krijgt zijn
 * evenredige deel.
 *
 * Zonder begindatum is er geen jubileumdatum om vanaf te meten; dan valt het
 * terug op het kalenderjaar.
 */
function contractOpbouw(c: ContractVacation, from: string, to: string): number {
  if (c.vacationHours == null) return 0;

  const start = c.startDate ? dag(c.startDate) : -Infinity;
  // De einddatum is de laatste dag die meetelt, dus het contract loopt tot en
  // met de dag erna om middernacht.
  const eind = c.endDate ? dag(c.endDate) + DAG : Infinity;
  const vanaf = Math.max(start, dag(from));
  const tot = Math.min(eind, dag(to));
  if (tot <= vanaf) return 0;

  const anker = c.startDate
    ? c.startDate.split("-").map(Number)
    : [Number(from.slice(0, 4)), 1, 1];
  const [ankerJaar, ankerMaand, ankerDag] = anker;

  let totaal = 0;
  for (let k = 0; ; k++) {
    const jaarStart = Date.UTC(ankerJaar + k, ankerMaand - 1, ankerDag);
    if (jaarStart >= tot) break;
    const jaarEind = Date.UTC(ankerJaar + k + 1, ankerMaand - 1, ankerDag);
    const vensterStart = Math.max(vanaf, jaarStart);
    const vensterEind = Math.min(tot, jaarEind);
    if (vensterEind > vensterStart) {
      totaal += (c.vacationHours * (vensterEind - vensterStart)) / (jaarEind - jaarStart);
    }
  }
  return totaal;
}

/**
 * Wat alle contracten samen tussen twee datums opbouwen. Binnen de module
 * wordt met het ongeronde getal gerekend en pas aan de rand afgerond: rond je
 * elke post apart af, dan tellen ze net niet op tot het saldo.
 */
function opbouwRuw(contracts: ContractVacation[], from: string, to: string): number {
  if (from >= to) return 0;
  return contracts.reduce((s, c) => s + contractOpbouw(c, from, to), 0);
}

/** Wat de contracten tussen twee datums opbouwen, afgerond op honderdsten. */
export function accruedBetween(contracts: ContractVacation[], from: string, to: string): number {
  return afgerond(opbouwRuw(contracts, from, to));
}

/** De eerste dag waarop er een contract begint, of null als er geen enkel is. */
function eersteContractdag(contracts: ContractVacation[]): string | null {
  const starts = contracts.map((c) => c.startDate).filter((d): d is string => d != null);
  return starts.length ? starts.reduce((a, b) => (a < b ? a : b)) : null;
}

/** Het kalenderjaar waar een datum in valt. */
function jaarVan(today: string): number {
  return Number(today.slice(0, 4));
}

/**
 * De horizon waar het saldo naartoe rekent: het einde van het contract dat
 * vandaag loopt.
 *
 * Dat is de periode waar het saldo over gaat — het contract belooft zoveel uur
 * over zijn eigen looptijd, en die houdt niet op bij oudjaar. Loopt er vandaag
 * geen contract of heeft het geen einddatum, dan is er geen periode om op te
 * eindigen en blijft het bij het kalenderjaar.
 *
 * Halfopen: de dag ná de laatste contractdag.
 */
function opbouwTot(contracts: ContractVacation[], today: string): string {
  const huidig = getEffectiveContract(contracts, today);
  return huidig?.endDate ? nextDay(huidig.endDate) : `${jaarVan(today) + 1}-01-01`;
}

/**
 * Het vakantierecht dat iemand t/m het einde van zijn lopende contract heeft
 * opgebouwd: alles wat zijn contracten sinds de eerste contractdag hebben
 * opgeleverd. Een periode zonder contract levert vanzelf nul op, zodat de
 * opbouw stopt zodra iemand uit dienst is.
 *
 * Met een peildatum bepalen de contracten de opbouw en telt een handmatige
 * budgetrij niet mee: die gaat over een kalenderjaar en dat is dan niet meer de
 * eenheid. Zonder peildatum blijft alles zoals het was — het recht van het
 * lopende jaar, waarbij een budgetrij wél voorgaat. De opbouw over eerdere
 * jaren zegt namelijk niets zolang er geen getal tegenover staat voor wat er in
 * die jaren is opgenomen, en dat getal is precies wat de peildatum meebrengt.
 */
export function accruedVacationHours(
  contracts: ContractVacation[],
  budgets: Array<{ year: number; hours: number }>,
  opening: VacationOpening | null,
  today: string,
): number {
  if (!opening) {
    const jaar = jaarVan(today);
    const rij = budgets.find((b) => b.year === jaar);
    return rij ? rij.hours : (contractVacationHours(contracts, jaar) ?? 0);
  }

  const eerste = eersteContractdag(contracts);
  if (!eerste) return 0;
  return afgerond(opbouwRuw(contracts, eerste, opbouwTot(contracts, today)));
}

/**
 * De datum vanaf wanneer de geregistreerde vakantie meetelt: de peildatum, of
 * anders 1 januari van het lopende jaar. Alles ervóór zit in het ingevulde
 * totaal of valt buiten de periode.
 */
export function vacationCountFrom(opening: VacationOpening | null, today: string): string {
  return opening ? opening.date : `${jaarVan(today)}-01-01`;
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
 * Beide kanten beslaan hetzelfde venster — vanaf de peildatum tot de horizon
 * waar de opbouw op eindigt. Anders zou vakantie die al voor ná die horizon is
 * vastgelegd worden afgetrokken van een recht dat pas daarna wordt opgebouwd,
 * of andersom.
 */
export function vacationBalance(
  contracts: ContractVacation[],
  budgets: Array<{ year: number; hours: number }>,
  approved: Array<{ date: string; hours: number }>,
  opening: VacationOpening | null,
  today: string,
): VacationBalance {
  const vanaf = vacationCountFrom(opening, today);
  const tot = opening ? opbouwTot(contracts, today) : `${jaarVan(today) + 1}-01-01`;
  const entitled = accruedVacationHours(contracts, budgets, opening, today);
  const used = afgerond(
    (opening?.used ?? 0) +
      approved.filter((a) => a.date >= vanaf && a.date < tot).reduce((s, a) => s + a.hours, 0),
  );
  return { entitled, used, remaining: afgerond(entitled - used) };
}

/**
 * Het saldo uitgesplitst naar het lopende contractjaar: wat er uit de vorige
 * contracten is meegenomen, wat dit contract erbij geeft, wat er sinds de
 * contractstart is opgenomen en wat er tot de einddatum overblijft.
 */
export type ContractYearBalance = {
  carriedOver: number;
  contractTotal: number;
  used: number;
  remaining: number;
  endDate: string | null;
};

/**
 * De uitsplitsing hierboven, of null wanneer ze niet te maken is.
 *
 * Het `remaining` dat eruit komt is per constructie hetzelfde getal als
 * `balance.remaining`; de drie posten erboven verdelen dat alleen. Daarom komt
 * `contractTotal` uit het verschil en niet rechtstreeks uit het contract: zo
 * kan een handmatige budgetrij het totaal niet stiekem laten afwijken van wat
 * het verlofscherm toont.
 *
 * Splitsen lukt niet als er vandaag geen contract loopt, als dat contract geen
 * begindatum heeft, of als de peildatum ná de contractstart ligt — dan valt een
 * deel van het lopende contractjaar in het handmatig ingevulde totaal en is de
 * grens niet meer te trekken.
 */
export function contractYearBalance(
  contracts: ContractVacation[],
  approved: Array<{ date: string; hours: number }>,
  balance: VacationBalance,
  opening: VacationOpening,
  today: string,
): ContractYearBalance | null {
  const huidig = getEffectiveContract(contracts, today);
  if (!huidig?.startDate || opening.date > huidig.startDate) return null;

  const eerste = eersteContractdag(contracts);
  if (!eerste) return null;

  // Alles wat vóór dit contract is opgenomen: het handmatige totaal, plus wat
  // er tussen de peildatum en de contractstart alsnog is geregistreerd.
  const opgenomenDavoor = afgerond(
    opening.used +
      approved
        .filter((a) => a.date >= opening.date && a.date < huidig.startDate!)
        .reduce((s, a) => s + a.hours, 0),
  );
  const opgebouwdDavoor = opbouwRuw(contracts, eerste, huidig.startDate);

  return {
    carriedOver: afgerond(opgebouwdDavoor - opgenomenDavoor),
    contractTotal: afgerond(balance.entitled - opgebouwdDavoor),
    used: afgerond(balance.used - opgenomenDavoor),
    remaining: balance.remaining,
    endDate: huidig.endDate,
  };
}

/**
 * Eén regel uit de opsomming die het saldo verklaart. De tekst wordt in het
 * scherm gemaakt; hier staat alleen wat voor soort mutatie het is, waar hij bij
 * hoort en hoeveel uur hij optelt of aftrekt.
 */
export type VacationLedgerLine = {
  kind: "contract" | "opening" | "leave";
  /** Begin van de periode; hier wordt ook chronologisch op gesorteerd. */
  date: string;
  /** Eind van de periode, of null bij een contract zonder einddatum. */
  until: string | null;
  hours: number;
};

/**
 * Alle mutaties die samen het saldo vormen, op volgorde van datum: wat elk
 * contract opbouwt, het handmatig ingevulde totaal van vóór de peildatum, en
 * elke goedgekeurde vakantie daarna.
 *
 * De regels tellen op tot `vacationBalance(...).remaining` — daar is de
 * opsomming voor. Contracten die niets bijdragen blijven weg; een regel van nul
 * uur verklaart niets.
 */
export function vacationLedger(
  contracts: ContractVacation[],
  approved: Array<{ date: string; until?: string | null; hours: number }>,
  opening: VacationOpening,
  today: string,
): VacationLedgerLine[] {
  const eerste = eersteContractdag(contracts);
  if (!eerste) return [];
  const tot = opbouwTot(contracts, today);

  const regels: VacationLedgerLine[] = [];
  for (const c of contracts) {
    const uren = afgerond(contractOpbouw(c, eerste, tot));
    if (uren === 0) continue;
    regels.push({ kind: "contract", date: c.startDate ?? eerste, until: c.endDate, hours: uren });
  }

  if (opening.used !== 0) {
    regels.push({ kind: "opening", date: opening.date, until: null, hours: -opening.used });
  }

  for (const a of approved) {
    if (a.date < opening.date || a.date >= tot) continue;
    regels.push({ kind: "leave", date: a.date, until: a.until ?? null, hours: -a.hours });
  }

  // Valt de peildatum samen met een contractstart — en dat hoort zo — dan komt
  // het handmatige totaal eerst: het vat de periode ervóór samen.
  const volgorde = { opening: 0, contract: 1, leave: 2 };
  return regels.sort(
    (a, b) => a.date.localeCompare(b.date) || volgorde[a.kind] - volgorde[b.kind],
  );
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
