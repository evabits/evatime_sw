/**
 * Het klantnummer dat als voorstel in een nieuw klantformulier komt te staan.
 *
 * Alleen nummers die volledig uit cijfers bestaan tellen mee. Een eigen schema
 * als `ACQ-01` blijft buiten beschouwing: bij `ACQ-01` naast `ZON-05` zou deze
 * functie moeten kiezen welke reeks hij doortelt, en elke keuze daar is fout.
 * Dan liever geen voorstel dan een verkeerd voorstel.
 *
 * De breedte van het hoogste nummer blijft behouden — staat er `007`, dan komt
 * er `008` — behalve wanneer het getal daar niet meer in past: na `99` volgt
 * `100` en niet `00`.
 *
 * Het is een voorstel, geen toewijzing. Wie het overtypt naar een bestaand
 * nummer loopt alsnog tegen de unieke sleutel aan.
 */
export function nextCustomerNumber(bestaande: Array<string | null | undefined>): string {
  const cijferreeksen = bestaande
    .map((n) => n?.trim() ?? "")
    .filter((n) => /^\d+$/.test(n));

  if (cijferreeksen.length === 0) return "1";

  let hoogste = cijferreeksen[0];
  for (const n of cijferreeksen) {
    // Op getalwaarde vergelijken, niet als tekst: "9" is groter dan "10" zodra
    // je ze naast elkaar legt als woorden.
    if (Number(n) > Number(hoogste)) hoogste = n;
  }

  return String(Number(hoogste) + 1).padStart(hoogste.length, "0");
}
