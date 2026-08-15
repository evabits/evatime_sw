/**
 * Bonnetjes van uitgaven die als bijlage op de factuur horen.
 *
 * De factuurbijlage wijst naar hetzelfde bestand als het bonnetje; er wordt
 * niets gekopieerd. Dat mag omdat een gefactureerde uitgave niet meer te
 * wijzigen is, dus er kan naderhand niets onder de factuur vandaan veranderen.
 * De keerzijde staat in de verwijderroute van bijlagen: die mag het bestand
 * alleen echt wissen als geen enkele uitgave er nog naar wijst.
 */
export type ExpenseWithReceipt = {
  receiptUrl?: string | null;
  description?: string | null;
  category?: { name: string } | null;
};

export type ReceiptAttachment = { filename: string; url: string };

/**
 * De bestandsnaam die bij een blob-URL hoort.
 *
 * Het laatste stuk van het pad, zonder queryparameters en met de
 * URL-codering eruit — een bon met een spatie in de naam komt binnen als
 * `bon%20juli.pdf` en hoort in de mail als `bon juli.pdf` aan te komen.
 * Levert het pad niets bruikbaars op, dan draagt `terugval` de naam.
 */
export function receiptFilename(url: string, terugval = "bon.pdf"): string {
  // Via het pad en niet via een kale split op "/": zonder pad zou de hostnaam
  // als bestandsnaam achterblijven.
  let pad: string;
  try {
    pad = new URL(url).pathname;
  } catch {
    pad = url.split(/[?#]/)[0];
  }
  const laatste = pad.split("/").filter(Boolean).pop() ?? "";
  if (!laatste) return terugval;
  try {
    return decodeURIComponent(laatste) || terugval;
  } catch {
    // Een losse % maakt decodeURIComponent boos; dan is de kale naam beter dan
    // helemaal geen naam.
    return laatste;
  }
}

/**
 * De bijlagen die deze uitgaven opleveren. Een uitgave zonder bon levert
 * niets, en hetzelfde bestand twee keer aanhangen heeft geen zin — dat komt
 * voor zodra twee uitgaven naar dezelfde bon verwijzen.
 */
export function receiptAttachments(expenses: ExpenseWithReceipt[]): ReceiptAttachment[] {
  const gezien = new Set<string>();
  const bijlagen: ReceiptAttachment[] = [];

  for (const e of expenses) {
    const url = e.receiptUrl?.trim();
    if (!url || gezien.has(url)) continue;
    gezien.add(url);
    bijlagen.push({ filename: receiptFilename(url), url });
  }
  return bijlagen;
}
