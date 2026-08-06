# Weekweergave voor het kilometerscherm

**Datum:** 2026-08-06

## Waarom

Het urenscherm heeft twee weergaven: een weekraster met een kolom per dag, en
een lijst per maand. Het kilometerscherm heeft alleen de lijst. Wie tussen de
twee schermen wisselt moet dus omschakelen, en wie wil zien op welke dagen er
gereden is moet dat uit een tabel halen.

De data rechtvaardigt het raster: 76 ritten over drie maanden, en in de laatste
acht weken is er op 32 van de 56 dagen gereden. Opvallend genoeg boekt niemand
twee ritten op één dag — per persoon staat elke rit op een eigen datum. De dagen
met meerdere ritten zijn steeds verschillende mensen.

## Eén gedeeld weekraster

Het raster komt in twee schermen te staan, dus het wordt één component:
`src/components/shared/week-grid.tsx`.

Hij krijgt de zeven dagen, per dag een getal, een functie om dat getal op te
maken, de geselecteerde dag en een `onSelect`. De totaalkolom hoort erbij — die
zit in hetzelfde raster en heeft dezelfde opmaak nodig.

**Eén ding verschilt echt tussen de twee schermen.** Het urenscherm zet `vrij`
in plaats van een getal op een vaste vrije dag uit het weekrooster van de
medewerker. Kilometers kennen zoiets niet. Dat gaat als optionele prop mee: een
functie die per dag een vervangende tekst mag teruggeven, of niets. Zo blijft de
kennis van weekroosters in het urenscherm, waar hij hoort, in plaats van dat een
gedeeld raster ervan moet weten.

De rest is gelijk en hoort dus in het component: de dagafkorting met het
dagnummer, de onderstreping van vandaag, de markering van de geselecteerde dag,
en de totaalkolom rechts.

## Het urenscherm gaat hem gebruiken

Dit is de riskante helft van het werk: `src/components/time/time-entries-client.tsx`
is werkende code die deze week nog gereviewd is. **Er mag geen enkele zichtbare
verandering optreden** — dezelfde kolommen, dezelfde markering voor vandaag,
dezelfde `vrij`, hetzelfde totaal, dezelfde klikbaarheid.

De voorwaarden waaronder `vrij` verschijnt blijven ongewijzigd en blijven in het
urenscherm staan: alleen op een werkdag, alleen wanneer het raster de eigen uren
van de ingelogde medewerker toont, alleen als er een weekrooster is, alleen als
dat rooster nul uur zegt, en alleen als er die dag ook werkelijk niets geboekt
is.

## Het kilometerscherm krijgt weekmodus

Dezelfde toestand en dezelfde knoppen als bij de uren, zodat wie wisselt niets
nieuws hoeft te leren:

- Een schakelaar week/lijst, met **week als standaard**.
- Pijltjes vooruit en terug door de weken.
- Een knop om terug naar de huidige week te springen, zichtbaar zodra je er niet
  op staat.
- Klikken op een dag filtert de lijst eronder op die dag **en** zet het
  datumveld van het formulier op die datum. Nogmaals klikken heft de selectie op.

Elke cel toont de kilometers van die dag met `toFixed(1)`, gelijk aan wat de
tabel al doet. De totaalkolom telt de week op.

**Een dag zonder ritten toont `0.0`, gedempt weergegeven** — niet leeg. Dat is
hoe het urenscherm het al doet: nul is een antwoord, en een lege cel laat je
raden of er niets is of dat het scherm iets niet weet. De gedempte opmaak doet
het onderscheid met een dag waarop wél gereden is.

Het ophalen gebruikt `from` en `to` op `/api/km` — die parameters bestaan al,
precies zoals bij `/api/time`. Er verandert dus niets aan de API.

## Wat in weekmodus niet wordt aangeboden

De maand- en projectfilters worden alleen in lijstmodus gerenderd, precies zoals
in het urenscherm. Een weekvenster en een maandfilter tegelijk aanbieden levert
twee dingen op die elkaar tegenspreken.

Het medewerkerfilter voor admins blijft in beide weergaven staan: dat werkt
orthogonaal aan de periode en wordt in beide ophaalpaden meegestuurd.

## Wat er getest wordt

Eén pure functie in `src/lib/`, die per dag de registraties optelt:

```ts
perDayTotals(entries: Array<{ date: string | Date; value: number }>, days: string[]): number[]
```

Hij telt geen veld met een vaste naam op. Het urenscherm sommeert `hours` en het
kilometerscherm `km`, dus de aanroeper zet zijn registraties eerst om naar
`{ date, value }`. Dat is één `map` per scherm en scheelt een callback-parameter
die alleen bestaat om twee veldnamen te overbruggen.

Dat dit een pure functie wordt is meer dan netheid: er zit datumparsing en
-formattering in, en dat is precies waar een tijdzonefout binnensluipt die je op
het scherm pas veel later opmerkt.

Minstens te testen: een dag zonder registraties, een dag met er één, een dag met
meerdere, registraties buiten de gegeven dagen die niet meetellen, en dat een
datum met een tijdcomponent op de juiste dag valt.

Het raster zelf en de schermtoestand zijn JSX; deze repo test uitsluitend pure
functies en dat blijft zo.

## Wat niet verandert

- Geen API-wijziging en geen schemawijziging.
- Het kilometerformulier, de sjablonen en de tabel blijven zoals ze zijn.
- Het urenscherm verandert alleen van binnen, niet van buiten.

## Uitrol

Geen migratie, geen backfill. Pushen naar `main` volstaat.

Handmatig na te lopen na de deploy:

- [ ] Het urenscherm ziet er in weekmodus **exact** uit als voorheen, inclusief
      de `vrij`-markering op een vaste vrije dag en de onderstreping van vandaag.
- [ ] Het kilometerscherm opent in weekmodus.
- [ ] Klikken op een dag filtert de lijst en zet het datumveld; nogmaals klikken
      heft het op.
- [ ] Vooruit en terug bladeren haalt de juiste week op, en de "vandaag"-knop
      verschijnt zodra je van de huidige week af bent.
- [ ] In weekmodus zijn de maand- en projectfilters niet zichtbaar; in lijstmodus
      wel.
- [ ] Als admin: het medewerkerfilter werkt in beide weergaven.
- [ ] Een dag zonder ritten toont `0.0` in gedempte opmaak, en de totaalkolom
      klopt met de som van de zeven dagen.
