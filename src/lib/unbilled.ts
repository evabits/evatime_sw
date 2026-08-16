/**
 * Wat er nog te factureren staat, per klant.
 *
 * De grens ligt op de eerste van de lopende maand: wat deze maand is geboekt
 * wordt begin volgende maand gefactureerd en hoeft nu niet te knipperen. Alles
 * daarvóór wel — hoe ouder, hoe vergetener.
 */
export type UnbilledRow = {
  date: string | Date;
  project?: { customer?: { id?: string; name?: string } | null } | null;
};

export type UnbilledCustomer = {
  customerId: string;
  name: string;
  /** De oudste openstaande registratie, als YYYY-MM-DD. */
  since: string;
  count: number;
};

/** De eerste dag van de maand waarin `today` valt, als YYYY-MM-DD. */
export function firstOfMonth(today: string): string {
  return `${today.slice(0, 7)}-01`;
}

/**
 * De registraties gegroepeerd per klant, oudste klant eerst.
 *
 * Registraties zonder klant vallen weg: die kun je aan niemand sturen, en het
 * factuurscherm toont ze om dezelfde reden niet. Bij gelijke datum bepaalt de
 * naam de volgorde, zodat de lijst niet danst tussen twee vernieuwingen.
 */
export function unbilledByCustomer(rows: UnbilledRow[]): UnbilledCustomer[] {
  const perKlant = new Map<string, UnbilledCustomer>();

  for (const r of rows) {
    const klant = r.project?.customer;
    if (!klant?.id) continue;
    const datum = typeof r.date === "string" ? r.date.slice(0, 10) : r.date.toISOString().slice(0, 10);

    const bestaand = perKlant.get(klant.id);
    if (!bestaand) {
      perKlant.set(klant.id, { customerId: klant.id, name: klant.name ?? "", since: datum, count: 1 });
      continue;
    }
    bestaand.count += 1;
    if (datum < bestaand.since) bestaand.since = datum;
  }

  return [...perKlant.values()].sort(
    (a, b) => a.since.localeCompare(b.since) || a.name.localeCompare(b.name),
  );
}
