import { docCopy, type Taal } from "./document-copy";

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
 *
 * Een document mag zijn eigen t.a.v. meegeven: een offerte gaat soms naar een
 * andere contactpersoon dan de klantgegevens zeggen, en daarvoor horen die
 * gegevens niet aangepast te worden. Het onderscheid is opzet — `null` of
 * `undefined` betekent "niets ingevuld, neem die van de klant", een lege string
 * betekent "op dit document geen t.a.v.-regel". Zonder dat onderscheid zou elk
 * bestaand document zijn t.a.v.-regel kwijtraken of hem nooit kwijt kunnen.
 */
export function customerAddressLines(
  customer: CustomerForAddress | null | undefined,
  attention?: string | null,
  taal: Taal = "NL",
): string[] {
  if (!customer) return [];

  const schoon = (v: string | null | undefined) => v?.trim() || "";
  const regels = [schoon(customer.name)];

  const tav = schoon(attention === null || attention === undefined ? customer.attention : attention);
  if (tav) regels.push(`${docCopy(taal).tav} ${tav}`);

  regels.push(schoon(customer.address));

  const postcodePlaats = [schoon(customer.postalCode), schoon(customer.city)]
    .filter(Boolean)
    .join(" ");
  regels.push(postcodePlaats);
  regels.push(schoon(customer.country));

  return regels.filter(Boolean);
}

/** De velden waarmee één factuur het adresblok van de klant kan overschrijven. */
export type InvoiceAddressOverride = {
  customerName?: string | null;
  attention?: string | null;
  address?: string | null;
  postalCode?: string | null;
  city?: string | null;
  country?: string | null;
  customerVatNumber?: string | null;
};

type KlantMetBtw = CustomerForAddress & { vatNumber?: string | null };

/**
 * De klant zoals hij op deze factuur staat: wat de factuur zelf heeft ingevuld,
 * en voor de rest de klantkaart.
 *
 * Null betekent "niets ingevuld, neem die van de klant". Daardoor volgen alle
 * facturen van vóór deze velden gewoon de klantkaart, zoals ze altijd deden.
 * De t.a.v. zit hier bewust niet in: die gaat als eigen parameter naar
 * `customerAddressLines`, dat het onderscheid tussen null en een lege string
 * al kent.
 */
export function invoiceCustomer<K extends KlantMetBtw>(
  klant: K | null | undefined,
  factuur: InvoiceAddressOverride,
): K & KlantMetBtw {
  const k = (klant ?? {}) as K;
  const of = <T,>(eigen: T | null | undefined, uitKaart: T) => (eigen ?? uitKaart);
  return {
    ...k,
    name: of(factuur.customerName, k.name ?? null),
    address: of(factuur.address, k.address ?? null),
    postalCode: of(factuur.postalCode, k.postalCode ?? null),
    city: of(factuur.city, k.city ?? null),
    country: of(factuur.country, k.country ?? null),
    vatNumber: of(factuur.customerVatNumber, k.vatNumber ?? null),
  };
}

/**
 * Wat er van een bewerkt adresblok opgeslagen moet worden.
 *
 * Het scherm vult de velden voor met wat er nu staat. Sla je dat ongewijzigd
 * op, dan hoort de factuur de klantkaart te blijven volgen — en niet ineens
 * vast te zitten aan een adres dat je nooit hebt aangeraakt. Daarom wordt een
 * veld dat gelijk is aan de klantkaart null.
 */
export function addressOverrideToSave(
  klant: KlantMetBtw | null | undefined,
  ingevuld: Required<InvoiceAddressOverride>,
): Required<InvoiceAddressOverride> {
  const k = klant ?? {};
  const alleenAfwijkend = (waarde: string | null, uitKaart: string | null | undefined) =>
    (waarde ?? "").trim() === (uitKaart ?? "").trim() ? null : (waarde ?? "").trim();
  return {
    customerName: alleenAfwijkend(ingevuld.customerName, k.name),
    attention: alleenAfwijkend(ingevuld.attention, k.attention),
    address: alleenAfwijkend(ingevuld.address, k.address),
    postalCode: alleenAfwijkend(ingevuld.postalCode, k.postalCode),
    city: alleenAfwijkend(ingevuld.city, k.city),
    country: alleenAfwijkend(ingevuld.country, k.country),
    customerVatNumber: alleenAfwijkend(ingevuld.customerVatNumber, k.vatNumber),
  };
}
