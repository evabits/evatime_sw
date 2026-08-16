/**
 * Het adresblok van een klant, zoals het op een factuur of offerte hoort.
 *
 * Op één plek, want dit blok staat in de PDF, in de printweergave en op het
 * scherm. Drie keer dezelfde regels opschrijven is precies hoe de printweergave
 * jarenlang de straatnaam achter "T.a.v." kon zetten zonder dat de PDF dat deed.
 */
export type CustomerForAddress = {
  name?: string | null;
  attention?: string | null;
  address?: string | null;
  postalCode?: string | null;
  city?: string | null;
  country?: string | null;
};

/**
 * De regels van het blok, van boven naar beneden. Lege velden leveren geen
 * lege regel op — een gat in een adres leest als een fout.
 *
 * De t.a.v.-regel staat direct onder de naam en alleen als er iemand is
 * ingevuld. Postcode en plaats delen een regel, zoals op een envelop.
 */
export function customerAddressLines(customer: CustomerForAddress | null | undefined): string[] {
  if (!customer) return [];

  const schoon = (v: string | null | undefined) => v?.trim() || "";
  const regels = [schoon(customer.name)];

  const tav = schoon(customer.attention);
  if (tav) regels.push(`T.a.v. ${tav}`);

  regels.push(schoon(customer.address));

  const postcodePlaats = [schoon(customer.postalCode), schoon(customer.city)]
    .filter(Boolean)
    .join(" ");
  regels.push(postcodePlaats);
  regels.push(schoon(customer.country));

  return regels.filter(Boolean);
}
