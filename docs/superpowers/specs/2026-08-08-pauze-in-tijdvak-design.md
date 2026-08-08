# Pauze opgeven binnen een van-tot-tijdvak

**Datum:** 2026-08-08

## Waarom

Bij het registreren van uren kun je een tijdvak opgeven — van 9:00 tot 17:00 —
en dan vult het scherm het aantal uren voor je in. Wie tussendoor pauze houdt,
moet dat nu zelf van het getal aftrekken. Van 9:00 tot 17:00 met een half uur
pauze is 7,5 uur, en die aftrek hoort het scherm te doen.

## Waar dit leeft

Het van-tot-veld staat op één scherm, `src/components/time/time-entries-client.tsx`,
en is puur invoerhulp: het vult het uren-veld en er wordt niets van opgeslagen.
De pauze blijft in diezelfde laag. Er verandert daarom niets aan de database,
aan `POST /api/time`, of aan wat er over een urenregel bekend is.

Het bewerkingsscherm in de rapportage (`entry-edit-dialog.tsx`) heeft geen
van-tot en krijgt dus ook geen pauze.

## Het veld

Naast `Van — tot` komt `Pauze (min)`: een getalveld met `step={15}` en
`min={0}`, standaard leeg.

Minuten, en geen tweede tijdvak van-tot. Niemand houdt bij wánneer hij pauze
had — alleen hoe lang. Een tweede tijdvak zou twee velden extra kosten en niets
extra's opleveren.

## De rekenregel

`hoursBetween(from, to)` in `src/lib/quarter-hours.ts` krijgt een derde
parameter:

```ts
hoursBetween(from: string, to: string, pauseMinutes?: number): number | null
```

Standaard 0, zodat bestaande aanroepen ongemoeid blijven. De regel gaat
hierbinnen en niet in een tweede functie ernaast: dan blijft er één plek waar
een tijdvak uren wordt, en kan een volgend scherm niet de verkeerde kiezen.

Hij geeft `null` — dus "geen bruikbaar tijdvak" — in alle gevallen waarin hij
dat nu al doet, en daarnaast wanneer de pauze het tijdvak opeet.

## Wat er misgaat, en wat de gebruiker dan ziet

**Pauze langer dan of gelijk aan het tijdvak.** Van 9:00 tot 9:30 met een uur
pauze is geen negatieve dag maar een typefout. Zelfde behandeling als een
eindtijd vóór de begintijd: een melding onder het veld, en het uren-veld blijft
staan zoals het stond.

**Een pauze die geen kwartier is.** Uren moeten een veelvoud van 0,25 zijn. Een
pauze van 20 minuten maakt van een dag van acht uur 7,67, en dat levert nu de
bestaande melding *"Uren moeten in stappen van 15 minuten (0,25 uur)"* op — bij
het uren-veld, terwijl de fout in het pauze-veld zit. De pauze krijgt daarom zijn
eigen melding, bij het veld waar je hem moet corrigeren.

`step={15}` laat de browser dit al grotendeels afvangen, maar niet betrouwbaar
genoeg om erop te leunen: een getypte waarde wordt in verschillende browsers pas
bij het versturen tegen de stap gehouden, en dit formulier stuurt het uren-veld
door en niet het pauze-veld.

## De pauze wordt niet onthouden tussen invoeren

Bewust, en dit is de enige keuze hier met een addertje.

Wie zijn dag in twee regels boekt — 9:00–12:00 op project A, 13:00–17:00 op
project B — heeft de pauze al in het gat tussen de twee tijdvakken zitten. Zou
het veld zich vullen met de 30 uit de vorige regel, dan gaat die pauze er een
tweede keer af en klopt de dag niet meer, zonder dat iets klaagt. Leeg beginnen
kost een handeling bij wie zijn dag in één regel boekt, en dat is de goedkopere
kant om fout te zitten.

## Wat er getest wordt

`hoursBetween`, met de pauze erbij:

- een pauze die eraf gaat (9:00–17:00 met 30 → 7,5)
- geen pauze meegegeven: gelijk aan wat de functie nu geeft
- pauze 0: idem
- een pauze die het tijdvak precies opeet → `null`
- een pauze die langer is dan het tijdvak → `null`
- een pauze die geen kwartier is → een getal dat geen kwartier is, zodat de
  aanroeper het kan weigeren (de functie oordeelt niet zelf over de stap, net
  zomin als hij dat nu over het tijdvak doet)
- een negatieve pauze → `null`, want dat is invoer die uren zou bíjtellen

Het scherm zelf is React en valt buiten de testconventie van deze repo, die
uitsluitend pure functies in `src/lib/*.test.ts` test.

## Wat niet verandert

- Geen schemawijziging, geen migratie, geen API-wijziging.
- Het uren-veld blijft leidend: dat is wat verstuurd wordt, en de pauze is
  alleen een manier om het in te vullen.
- De bestaande kwartiercontrole op het uren-veld blijft precies zoals hij is —
  de pauzemelding komt ernaast, niet in de plaats.

## Uitrol

Geen migratie. Pushen naar `main` volstaat.

Handmatig na te lopen:

- [ ] 9:00 tot 17:00 met 30 minuten pauze vult 7,5 uur.
- [ ] Hetzelfde tijdvak zonder pauze vult nog steeds 8 uur.
- [ ] Een pauze van 20 minuten geeft een melding bij het pauze-veld.
- [ ] Een pauze langer dan het tijdvak geeft een melding en laat het uren-veld
      staan.
- [ ] Het pauze-veld leegmaken vult het volle tijdvak weer in.
- [ ] Een nieuwe invoer begint met een leeg pauze-veld.
