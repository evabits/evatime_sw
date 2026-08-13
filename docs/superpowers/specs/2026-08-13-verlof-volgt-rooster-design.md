# Verlofaanvraag volgt het weekrooster

**Datum:** 2026-08-13

## Het probleem

Wie een hele week vrij vraagt krijgt 40 uur voorgesteld, ook als hij maandags
nooit werkt. Merlijn Kunst werkt 0/8/8/8/8 en zou 32 uur moeten opgeven; hij
moet dat nu elke keer zelf corrigeren, en vergeet hij het, dan schrijft de app
acht uur verlof af die hij niet had.

Bij goedkeuring loopt het daarna nog een keer mis, minder zichtbaar: het totaal
wordt gelijkmatig over álle werkdagen verdeeld. Zelfs een correct opgegeven 32
uur wordt dan 6,4 uur per dag, óók op de vrije maandag. Dat is fout in de
weekweergave en het maakt de standup-signalering troebel.

## Wat er al staat

Twee dingen die precies passen en niets extra's kosten:

- `WorkSchedule` — het vaste weekrooster per medewerker, uren per weekdag. Acht
  van de veertien actieve medewerkers hebben er een; de weekweergave op /time
  gebruikt hem al.
- `AbsencePattern` — het per-aanvraag patroon achter het vinkje "Herhaald per
  week", met `patternSummary` en `patternedEntries` eromheen. Dat rekent al
  precies zoals hier nodig is.

Er komt dus geen nieuwe berekening bij; het rooster gaat op twee plaatsen mee
waar het er nu niet is.

## Het ontwerp

### 1. Het rooster komt op het scherm

`/absence` laadt vandaag alleen `weeklyHours` van de ingelogde gebruiker. Dat
wordt het `WorkSchedule` van die gebruiker, en voor een admin de roosters van
alle actieve medewerkers — één query, acht rijen.

De dialoog kiest het rooster van de medewerker waar de aanvraag over gaat, niet
dat van de ingelogde gebruiker: de bewerkte aanvraag, anders de gekozen
medewerker, anders jezelf. Dat is dezelfde keuze die het vakantiesaldo in
diezelfde dialoog al maakt (`doelMedewerkerId`).

### 2. Het urenveld

Met rooster vult het veld het totaal in dat het rooster over de gekozen periode
oplevert: `patternSummary(rooster, van, tot).total`. Zonder rooster verandert er
niets — dan blijft `countWorkingHours` met `weeklyHours / 5` de bron.

Eronder komt een regel die zegt waar het getal vandaan komt, in de vorm die het
patroonvinkje al gebruikt: `Rooster: 4 dagen, 32,00 uur`. Zonder rooster staat
er niets extra's.

Het veld blijft bewerkbaar. Een halve dag vrij werkt precies als nu: datum
kiezen, 8 overtypen naar 4. Zet je het patroonvinkje aan, dan wint het patroon
zoals het dat nu ook doet — het rooster raakt het veld dan niet meer aan.

Levert het rooster nul uur op — Merlijn vraagt alleen een maandag aan — dan komt
er 0 in het veld te staan. De bestaande controle "Moet positief zijn" houdt het
tegen bij het opslaan en de regel eronder (`Rooster: 0 dagen, 0,00 uur`) zegt
waarom. Er komt geen aparte foutmelding bij.

### 3. De uren belanden op de juiste dagen

`absenceLines` verdeelt een aanvraag zonder patroon gelijkmatig over de
werkdagen van de periode. Dat wordt: gelijkmatig over de werkdagen die het
rooster als werkdag kent — een dag waarop het rooster meer dan nul uur staat.
De verdeling zelf (`splitHoursOverDays`, kwartieren, restje naar de eerste
dagen) blijft ongemoeid; alleen de lijst dagen die erin gaat wordt gefilterd.

- Merlijn (0/8/8/8/8), week vrij, 32 uur: vier dagen à 8 uur, niets op maandag.
- Paul (8/0/8/0/8), week vrij, 24 uur: maandag, woensdag, vrijdag à 8 uur.
- Merlijn, dinsdagmiddag vrij, 4 uur: 4 uur op die dinsdag.
- Iemand zonder rooster: onveranderd, alle werkdagen.

Laat het rooster geen enkele dag over, dan valt de verdeling terug op alle
werkdagen van de periode. Dat gebeurt wanneer iemand uitdrukkelijk verlof
opgeeft op een dag die hij volgens zijn rooster niet werkt: het veld stelt dan
0 voor, en wie daar toch een getal intypt bedoelt kennelijk dat hij die dag wél
vrij moet nemen. Uren mogen dan niet stilzwijgend verdwijnen, dus ze landen op
de dagen van de periode.

Een aanvraag mét patroon verandert niet. Het patroon is een uitdrukkelijke
keuze van de aanvrager en gaat vóór het rooster.

## Wat er verandert in de code

- `src/lib/absence-entries.ts` — `absenceLines` krijgt het rooster als extra
  argument (`WeekSchedule | null`, standaard `null`) en filtert daarmee de
  dagen vóór `splitHoursOverDays`. Pure functie, dus te testen zonder route.
- De drie aanroepers van `absenceLines` halen het rooster van de eigenaar van
  de aanvraag op: `POST /api/absence-requests` (admin maakt aan en keurt
  meteen goed), en in `PUT /api/absence-requests/[id]` zowel de
  goedkeuringstak als het bewerken van een goedgekeurde aanvraag.
- `src/app/(app)/absence/page.tsx` — laadt de roosters en geeft ze door in
  plaats van `weeklyHours` alleen.
- `src/components/vacation/absence-client.tsx` — kiest het rooster van de
  doelmedewerker, gebruikt het voor de voorinvulling en toont de regel eronder.
  `countWorkingHours` blijft staan als terugval.

Geen schemawijziging, dus geen migratie.

## Testen

Volgens de conventie van deze repo: pure functies, in `src/lib/*.test.ts`. De
nieuwe gevallen komen bij `absenceLines` in `src/lib/absence-entries.test.ts`:

- een rooster met een vrije maandag laat de maandag weg en verdeelt over de
  overige dagen;
- een rooster met twee vrije dagen houdt drie dagen over;
- een halve dag op een roosterdag blijft die dag met die uren;
- geen rooster (`null`) geeft exact wat het nu geeft;
- een rooster dat geen enkele dag overlaat valt terug op alle werkdagen;
- een aanvraag met patroon negeert het rooster.

De voorinvulling in de dialoog is React-gedrag en wordt niet automatisch
getest — deze repo heeft daar geen opzet voor. Die controleer je in de
draaiende app: een week aanvragen voor Merlijn Kunst hoort 32 te tonen, voor
Paul van Gelderen 24, en voor iemand zonder rooster onveranderd 40.
