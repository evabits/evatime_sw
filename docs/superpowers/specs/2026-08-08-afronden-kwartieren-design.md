# Ingevoerde uren automatisch afronden op kwartieren

**Datum:** 2026-08-08

## Waarom

Uren gaan in stappen van een kwartier. Wie op de minuut invult — 9:00 tot 17:07,
of 7,67 in het uren-veld — krijgt nu een foutmelding en moet zelf uitrekenen wat
het dichtstbijzijnde kwartier is. Dat kan het scherm doen.

## Waar de regel staat, en waar hij blijft

De kwartierregel wordt op zeven plekken afgedwongen: vier API-routes en drie
formulieren. Dat onderscheid draagt dit ontwerp.

**De API-routes blijven weigeren.** `POST`/`PUT /api/time` en
`POST`/`PUT /api/absence-requests` houden hun `refine(isQuarter, NOT_A_QUARTER)`.
Afronden is invoergemak; de server bewaakt de regel. Zou de server ook afronden,
dan kan een verzoek met 7,67 stilzwijgend als 7,75 landen — een gegeven dat
verandert zonder dat iemand erom vroeg. De weigering blijft bestaan als vangnet
en de schermen sturen er nooit meer een naartoe.

**Twee formulieren gaan afronden:** de urenregistratie
(`src/components/time/time-entries-client.tsx`, beide invoerwegen) en het
bewerkingsvenster in de rapportage (`src/components/reports/entry-edit-dialog.tsx`),
want dat is dezelfde handeling op dezelfde soort regel.

**Het verlofscherm niet** (`src/components/vacation/absence-client.tsx`). Daar is
het aantal uren een aanvraag die over werkdagen verdeeld wordt en op een
verlofsaldo drukt. Stilzwijgend afronden van andermans verlof is een andere
beslissing dan deze; dat scherm blijft weigeren zoals het nu doet.

## De regel

Eén pure functie in `src/lib/quarter-hours.ts`:

```ts
toQuarter(hours: number): number
```

Naar het dichtstbijzijnde kwartier, precies op de helft naar boven. Het resultaat
wordt op twee decimalen afgerond, want het belandt in een `Decimal(5,2)`-kolom.

Rondt een waarde naar nul af — iemand typt 0,1 — dan komt daar gewoon 0 uit en
laat de bestaande melding *"Moet positief zijn"* het werk doen. Er wordt geen
minimum van een kwartier opgelegd: er een kwartier van maken is tijd verzinnen
die niet gewerkt is, en dat is erger dan een melding.

Een waarde die al een kwartier is, komt er onveranderd uit.

## Je ziet wat er opgeslagen wordt, vóór je opslaat

Dit is de kern, en het verschil tussen afronden en stiekem aanpassen.

**Het uren-veld rondt af zodra de focus eruit gaat** (`onBlur`), en de afgeronde
waarde blijft in beeld staan. Type je 7,67 en klik je verder, dan staat er 7,75.
Zou er pas bij het opslaan afgerond worden, dan verstuur je een getal en krijg je
een ander terug — precies wat dit ontwerp wil vermijden.

**Van-tot rondt het uitgerekende getal af, niet de tijden.** Van 9:00 tot 17:07
wordt 8 uur. De eindtijd blijft 17:07 staan: die tijden zijn wat er werkelijk
gewerkt is, en die aanpassen zou liegen over de dag. Alleen het afgeleide getal
gaat naar het dichtstbijzijnde kwartier, en dat verschijnt meteen in het
uren-veld — daar valt niets te missen.

De hulptekst onder van-tot vermeldt dat er afgerond wordt.

## De pauzemelding over kwartieren vervalt

Die bestond omdat je hem zelf moest corrigeren. Nu rondt het resultaat toch af:
20 minuten pauze op 9:00–17:00 geeft 7,67 en dus 7,75. De melding zou de
gebruiker vragen iets op te lossen wat het scherm al oplost.

De melding over een pauze die even lang is als of langer dan het tijdvak
**blijft** — dat is geen afrondingskwestie maar onzin-invoer, en er valt geen
zinnig aantal uren uit af te leiden.

Ook de controle op een negatieve pauze blijft: die zou uren bíjtellen.

## Wat er getest wordt

`toQuarter`:

- een waarde die al een kwartier is, blijft gelijk (7,75 → 7,75; 8 → 8)
- naar boven wanneer dat het dichtstbij is (7,67 → 7,75)
- naar beneden wanneer dát het dichtstbij is (7,60 → 7,50)
- precies op de helft gaat naar boven (7,625 → 7,75)
- nul blijft nul
- een waarde die naar nul afrondt (0,1 → 0), zodat de aanroeper hem kan weigeren
- de uitkomst is altijd zelf een kwartier — gecontroleerd met `isQuarter`, zodat
  de twee regels niet uiteen kunnen lopen

De twee schermen zijn React en vallen buiten de testconventie van deze repo, die
uitsluitend pure functies in `src/lib/*.test.ts` test.

## Wat niet verandert

- Geen schemawijziging, geen migratie, geen API-wijziging.
- `isQuarter` en `NOT_A_QUARTER` blijven bestaan en blijven in gebruik op de
  server en op het verlofscherm.
- `hoursBetween` blijft ongeafgerond rekenen. Het afronden is een aparte stap bij
  de aanroeper, zodat één functie niet twee dingen doet.

## Uitrol

Geen migratie. Pushen naar `main` volstaat.

Handmatig na te lopen:

- [ ] 7,67 in het uren-veld wordt 7,75 zodra je verder klikt.
- [ ] 9:00 tot 17:07 vult 8 uur, en 17:07 blijft in het veld staan.
- [ ] 20 minuten pauze geeft geen melding meer en levert een afgerond getal.
- [ ] Een pauze langer dan het tijdvak geeft nog steeds een melding.
- [ ] 0,1 invullen geeft nog steeds *"Moet positief zijn"*.
- [ ] Het bewerkingsvenster in de rapportage rondt op dezelfde manier af.
- [ ] Het verlofscherm weigert een niet-kwartier nog steeds.
