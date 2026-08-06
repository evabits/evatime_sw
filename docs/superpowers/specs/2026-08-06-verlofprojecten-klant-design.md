# Verlofprojecten mogen een klant hebben

**Datum:** 2026-08-06

## Waarom

Het dashboard toont admins een waarschuwing: *"5 projecten zonder klant — Koppel
een klant zodat ze gefactureerd kunnen worden."* Die vijf projecten zijn op dit
moment **exact** de vijf verlofprojecten: Vakantieverlof, Ziekteverlof,
Bijzonder verlof, Ouderschapsverlof en Onbetaald verlof. De waarschuwing is dus
volledig vals alarm.

Erger dan nutteloos: de instructie eronder is precies de handeling die de
verlofgoedkeuring sloopt. `findAbsenceProject` zoekt vandaag op
`{ name, billable: false, customerId: null }`, dus zodra een admin het advies
opvolgt en er een klant op zet, vindt de goedkeuring dat project niet meer en
weigert hij met *"Het project … bestaat nog niet"* — over een project dat er
gewoon staat.

Dat is geen theoretisch risico. Het staat als aanbeveling op het startscherm van
iedere admin.

## De kern

**`Project.name` is `@unique` in het schema.** De naam alleen identificeert een
verlofproject dus al met zekerheid. De filters op klant en factureerbaarheid
voegen niets toe aan die zekerheid — ze zijn alleen twee knoppen waarmee iemand
het per ongeluk kan breken.

Van die twee gaat er één weg en blijft er één staan, en dat onderscheid is het
hele ontwerp:

- **`customerId: null` verdwijnt uit de opzoeking.** Dat is precies het veld dat
  we bewust gaan wijzigen. Daarna is een klant koppelen onschadelijk.
- **`billable: false` blijft staan.** Dat is wat verlofuren van facturen
  weghoudt: de factuurbouwer filtert op `isBillable(e) === true`, niet op de
  klant. Zet iemand een verlofproject ooit op factureerbaar, dan is weigeren om
  goed te keuren de júiste uitkomst — stilzwijgend iemands ziekteverlof
  factureerbaar maken is een veel ergere fout dan een geblokkeerde goedkeuring.

## Een melding die zegt wat er mis is

Met `billable: false` nog in het filter zou dat geval de bestaande melding
opleveren — *"Het project 'Vakantieverlof' bestaat nog niet"* — over een project
dat wél bestaat. Dat is onbegrijpelijk op precies het moment dat iemand snapt
wat er misgaat.

Dus in twee stappen: zoek het project op naam. Bestaat het niet, dan de
bestaande melding, woordelijk ongewijzigd:

```
Het project "<naam>" bestaat nog niet
```

Bestaat het wél maar staat het op factureerbaar, dan een eigen melding die zegt
wát er mis is, zodat degene die hem leest weet welke knop terug moet:

```
Het project "<naam>" staat op factureerbaar; verlofuren horen niet op een factuur
```

## De koppeling zelf

De vijf verlofprojecten gaan met de hand naar de bestaande klant
**EVAbits B.V.** via `/projects`. Geen script en geen migratie: het zijn vijf
handelingen, eenmalig, en een script daarvoor is meer code dan klikken.

Een aparte klant "Verlof" is overwogen en afgevallen — `Intern` hangt al onder
EVAbits B.V., dus intern werk daar onderbrengen is consistent.

**Het aanvaarde gevolg:** rapportages filteren op klant, en het
factureerbaar-filter is daar optioneel. Vandaag vallen verlofuren buiten elk
klantgefilterd rapport omdat ze geen klant hebben. Straks tellen ze mee zodra
iemand op EVAbits B.V. filtert — vandaag 99 uur (45 ouderschapsverlof, 54
vakantieverlof), en dat groeit met elke goedgekeurde aanvraag. Dit is bewust
geaccepteerd. De facturatie blijft ongemoeid, want die filtert hard op
`billable`.

## De volgorde bij de uitrol

**Code eerst, data daarna** — omgekeerd aan een schemamigratie.

Koppel je de klant terwijl de oude code nog draait, dan eist die nog steeds
`customerId: null` en vindt hij géén enkel verlofproject meer. Elke goedkeuring
weigert dan, tot de deploy binnen is.

1. Deployen.
2. Pas daarna de vijf projecten op EVAbits B.V. zetten.

## Wat er niet verandert

- **De dashboardtelling.** Die blijft `{ customerId: null, archivedAt: null }`
  tellen en komt vanzelf op nul zodra de projecten een klant hebben. Hij blijft
  daarmee gewoon werken voor échte klantloze projecten, wat het punt van die
  waarschuwing is.
- **`billable: false` en nul deelnemers op de verlofprojecten.** Dat laatste is
  wat ze onbereikbaar houdt voor handmatige invoer: het urenformulier toont
  alleen projecten waarvan je deelnemer bent. De klant speelt daar geen rol in.
- **De rest van de app.** Er zijn precies twee plekken die op klantloosheid
  leunen — de dashboardtelling en de opzoeking — en alleen de tweede verandert.

Wel bij te werken: het commentaar boven `ABSENCE_PROJECT_NAMES` in
`src/lib/absence-entries.ts` zegt nu dat een admin verlofprojecten "zonder
klant" klaarzet. Dat wordt onwaar.

## Testbaarheid

Geen nieuwe tests. `findAbsenceProject` doet een databasequery en deze repo test
uitsluitend pure functies in `src/lib/*.test.ts`. Er valt hier niets af te
splitsen dat die naam verdient; een pure functie verzinnen om iets te kunnen
testen zou slechter zijn dan eerlijk vaststellen dat de verificatie handmatig
gaat.

Verificatie is `npx tsc --noEmit`, de bestaande suite, en met de hand nalopen.

## Handmatig na te lopen

Vóór het koppelen, direct na de deploy:

- [ ] Een verlofaanvraag goedkeuren werkt nog gewoon — de projecten hebben dan
      nog geen klant, en de opzoeking mag daar niet meer op filteren.

Ná het koppelen van de vijf projecten aan EVAbits B.V.:

- [ ] De waarschuwing "projecten zonder klant" is van het dashboard verdwenen.
- [ ] Een verlofaanvraag goedkeuren werkt nog steeds, en de urenregels staan op
      hetzelfde project als voorheen.
- [ ] Een goedgekeurde aanvraag intrekken haalt die regels weer weg.
- [ ] Een factuur opstellen voor EVAbits B.V. toont **geen** verlofregels.
- [ ] Het urenformulier biedt de verlofprojecten nog steeds niet aan, ook niet
      wanneer je EVAbits B.V. als klant kiest.
- [ ] Zet één verlofproject tijdelijk op factureerbaar en probeer goed te keuren
      → de melding zegt dat het project op factureerbaar staat, niet dat het niet
      bestaat. Zet hem daarna terug.
