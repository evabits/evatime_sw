# Mensen uitzetten in de loonverwerking

**Datum:** 2026-08-08

## Waarom

Het loonverwerkingsscherm toont iedereen: alle actieve medewerkers plus
gearchiveerde medewerkers die in die maand nog uren of kilometers hebben. Daar
zitten regels tussen die voor de salarisadministratie niets betekenen — de
systeemaccounts `Admin` en `employee` staan er gewoon bij — en wie de
loonverwerking doet, scrolt daar elke maand langs.

Op de standup is dit al opgelost: een knop `In beeld: N van M` en een dialoog
met vinkjes. Dezelfde methode, nu op de loonverwerking.

## De keuze: een schermvoorkeur, geen eigenschap van de persoon

De selectie komt in `localStorage`, per ingelogde admin, en bewaart wie is
**weggeklikt** — niet wie zichtbaar is.

Dat verschil draagt het ontwerp. Een nieuwe medewerker staat er dan vanzelf bij,
in plaats van onzichtbaar te blijven tot iemand eraan denkt hem toe te voegen.
Bij een maandelijkse loonronde valt zo iemand lang niet op, en iemand zien die
je niet nodig had is de goedkopere fout. Om dezelfde reden levert een
onleesbare opgeslagen waarde een lege lijst op: iedereen in beeld.

Het alternatief was een vinkje op de medewerker zelf — "doet niet mee aan de
loonverwerking" — gedeeld door alle admins en onafhankelijk van de browser. Dat
is verdedigbaar, want of iemand op de loonlijst staat is eerder een feit over
die persoon dan een kijkvoorkeur. Het is niet gekozen omdat het een
schemawijziging plus een migratie op productie kost, en omdat er expliciet om de
standup-methode gevraagd is.

**Het gevolg staat hier met open ogen:** er zijn vier admins (`Admin`, Arjen
Bogerman, Erik Kallen, Jan Stegenga) en die kunnen straks een verschillend
overzicht zien. De selectie zit bovendien per browser, dus wie op een andere
computer inlogt begint weer met iedereen in beeld. Doet één persoon de
loonverwerking, dan is dat geen probleem; wordt het gedeeld werk, dan is dit het
eerste wat herzien moet worden.

## Wat er gedeeld wordt met de standup

De bestaande code is al bijna generiek. `src/lib/standup-visibility.ts` bevat
twee functies, en alleen de sleutel is schermspecifiek:

- `hiddenStorageKey(userId)` geeft `standup-hidden:<userId>`
- `readHiddenIds(raw)` leest de opgeslagen lijst, tolerant

Het bestand gaat daarom `src/lib/hidden-members.ts` heten en de sleutelfunctie
krijgt er een scope bij: `hiddenStorageKey(scope, userId)` geeft
`<scope>-hidden:<userId>`. De standup blijft `"standup"` doorgeven en houdt dus
letterlijk dezelfde sleutel — niemand raakt zijn bestaande selectie kwijt. De
loonverwerking geeft `"payroll"` door.

De keuzedialoog zelf wordt een gedeeld onderdeel,
`src/components/shared/member-picker.tsx`. Dit is de tweede gebruiker; zouden
het twee kopieën blijven, dan drijven ze uit elkaar zodra er één iets
bijkrijgt. Dat is dezelfde route als `week-grid.tsx` eerder dit jaar.

Het onderdeel krijgt de leden als `{ id, name }` aangereikt. De standup noemt
die velden nu `userId` en `userName` en de loonverwerking `userId` en `name`;
die vertaling gebeurt op de aanroepplek, zodat het gedeelde onderdeel niet twee
vormen hoeft te kennen.

## Wat het loonverwerkingsscherm krijgt

Naast het maandveld in de kaartkop komt de knop `In beeld: N van M`, die
dezelfde dialoog opent: één vinkje per medewerker, plus een knop *Toon iedereen*
en een knop *Klaar*. De tabel toont alleen wie aanstaat. De knop verschijnt
alleen wanneer er medewerkers zijn, net als op de standup — tijdens het laden of
bij een lege maand valt er niets te kiezen.

`PayrollClient` krijgt het gebruikers-id mee vanuit `page.tsx`, net zoals
`StandupClient` dat doet — zonder id zou de ene admin de selectie van de andere
erven op een gedeelde computer.

Staat iedereen uit, dan komt er een regel in de tabel in plaats van een lege
body, in de stijl van de bestaande *Geen medewerkers gevonden*.

## Wat niet verandert

- Geen schemawijziging en geen migratie.
- `GET /api/payroll` blijft precies teruggeven wat het nu teruggeeft. Het
  filteren gebeurt in het scherm, zodat wegklikken nooit invloed heeft op wat er
  berekend wordt.
- Er staan geen totalen onder de tabel, dus er is niets dat stilzwijgend kan
  gaan afwijken van wat er zichtbaar is.
- De maandkeuze, de kolommen en de berekening blijven zoals ze zijn.

## Wat er getest wordt

`hiddenStorageKey` krijgt er een geval bij: dat `"standup"` nog steeds
`standup-hidden:<id>` oplevert — de sleutel die al bij gebruikers in de browser
staat — en dat `"payroll"` een eigen sleutel geeft. `readHiddenIds` is al getest
en verandert niet.

Het gedeelde dialoogonderdeel is React en valt buiten de testconventie van deze
repo, die uitsluitend pure functies in `src/lib/*.test.ts` test.

## Uitrol

Geen migratie, geen backfill. Pushen naar `main` volstaat.

Handmatig na te lopen:

- [ ] De standup onthoudt een selectie die vóór deze wijziging is gemaakt.
- [ ] Op de loonverwerking verdwijnt een weggeklikte medewerker uit de tabel en
      blijft dat na herladen.
- [ ] De standup- en loonverwerkingsselectie staan los van elkaar.
- [ ] *Toon iedereen* zet de tabel terug op alle medewerkers.
- [ ] Iedereen uitgezet geeft een leesbare regel, geen lege tabel.
- [ ] Een maand met een gearchiveerde medewerker toont die persoon nog steeds,
      tenzij hij zelf is weggeklikt.
