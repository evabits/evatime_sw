# Zien wie er uren mist, en waar iemand het laatst aan werkte

**Datum:** 2026-08-07

## Waarom

Tijdens de standup wil de leider twee dingen weten die het scherm nu niet geeft.

**Waar werkte deze persoon het laatst aan?** Het scherm toont de uren van de
vorige werkdag. Was iemand toen vrij of ziek, dan staat er niets, terwijl de
vraag "waar was je mee bezig" gewoon een antwoord heeft — van de dag daarvóór.

**En: is deze persoon vergeten te boeken?** Dat is iets anders dan afwezig zijn,
en alleen het eerste vraagt om een duwtje. Nu vallen beide gevallen op één
regel — `geen uren geboekt` — die niets zegt over de vraag of dat erg is.

Daar komt bij dat het duwtje beter vóór de standup kan komen dan erin: wie het
's ochtends op het dashboard ziet, kan zijn uren nog invullen voordat de
bijeenkomst begint.

De oorspronkelijke vraag was om dagen terug te kunnen bladeren. Dat was de omweg:
je wilde niet bláderen, je wilde weten waar iemand het laatst aan werkte. Het
datumveld dat er al zit blijft staan — een oudere standup opzoeken kan dus nog
steeds — maar er komt geen bladermechaniek bij die niets toevoegt.

## De kern: één functie

Alle drie de onderdelen leunen op dezelfde vraag, dus die wordt één pure functie
in `src/lib/`:

```ts
missingHours(scheduled: number | null, booked: number, absent: boolean): number
```

Hij geeft het tekort in uren, of nul wanneer er niets mist. Nul in vier gevallen:

| Situatie | Waarom nul |
|---|---|
| `absent` is waar | Verlof of ziekte is geen vergeten boeking |
| `scheduled` is `0` | Vaste vrije dag; die dag hoort leeg te zijn |
| `scheduled` is `null` | Geen weekrooster: er is niets om tegen af te zetten |
| `booked >= scheduled` | Genoeg, of meer dan gepland |

Anders `scheduled − booked`.

Zowel het standupscherm als de dashboardkaart rekenen hiermee, zodat ze niet
kunnen verschillen over wie er tekortkomt.

**Tekort is minder dan het rooster, niet alleen nul.** Wie 4 van zijn 8 uur
boekte mist er vier. Dat is een bewuste keuze: onvolledig is onvolledig.

## De zes zonder weekrooster

Acht van de veertien actieve medewerkers hebben een weekrooster; zes niet,
waaronder twee echte parttimers. Zonder rooster valt een tekort niet te
berekenen, en die zes **blijven bewust buiten elke telling en elke markering**.

Dat is met open ogen gekozen: de kaart weet dus niets over bijna de helft van
het team, en wie geen rooster heeft valt nooit op. Het scherm blijft over hen
zeggen wat het nu al zegt — `geen uren geboekt` — wat feitelijk klopt en geen
vals alarm is. De echte oplossing is die roosters invullen; dit ontwerp dwingt
dat niet af.

## Het standupscherm

Per persoon zijn er straks vier toestanden, in deze volgorde van voorrang:

1. **Afwezig** — ongewijzigd, en het wint van al het andere. Wie vakantie heeft
   mist per definitie geen uren.
2. **Vaste vrije dag** — de bestaande tekst `werkt niet op <weekdag>`, voor wie
   volgens zijn rooster die dag nul uur werkt. Ook hier geen markering.
3. **Mist uren** — een zichtbare markering met het tekort erbij, in de vorm
   `mist 8:00`, opgemaakt met `formatHours` zoals overal elders.
4. **Compleet** — de urenregels zoals nu, zonder markering.

Daarnaast, en los van die vier: staan er op de getoonde dag **geen urenregels**
(nul stuks, niet nul uur), dan komt eronder te staan waar hij het laatst wél aan
werkte, met datum:

```
laatst gewerkt: vr 3 aug
  8:00 Medusa Radiometrics / MCA — programming
```

Dat zijn de urenregels van die dag, in dezelfde opmaak als de gewone lijst — dus
alle regels van die dag, niet één samenvatting. Alleen bij een lege dag; heeft
iemand die dag wel geboekt, dan is de regel ruis.

Deze regel en de markering uit punt 3 kunnen samen voorkomen, en dat is de
bedoeling: iemand die niets boekte mist uren én heeft een laatste werkdag. De
markering zegt dat er iets moet gebeuren, de regel eronder geeft de context die
de leider nodig heeft om het gesprek te voeren.

## Wat de API erbij moet leveren

`GET /api/standup` geeft per lid één veld erbij: de meest recente dag met uren
vóór de getoonde dag, met de regels van die dag.

Onbegrensd terug in de tijd. Een lange afwezigheid levert dan een oude datum op,
en dat is nog steeds het juiste antwoord op "waar werkte hij het laatst aan".
Twee query's volstaan: de laatste datum per gebruiker, en de urenregels van die
datums.

## De dashboardkaart

In de vorm van de bestaande waarschuwingen op `src/app/(app)/page.tsx` — dezelfde
kaart met amberrand als "projecten zonder klant" — met een link naar `/standup`:

```
2 medewerkers misten uren op maandag 6 augustus
```

De kaart kijkt naar dezelfde dag als de standup: de vorige werkdag ten opzichte
van vandaag.

**Zichtbaar voor wie de standup mag leiden**, dus via `canLeadStandup` uit
`src/lib/roles.ts` en niet via `isAdmin`. De bestaande kaarten gebruiken
`isAdmin`; deze niet, want dan zou de enige teamleider hem niet zien — en juist
hij leidt de standup.

Verschijnt alleen wanneer het aantal groter dan nul is, net als de andere
waarschuwingen.

## Wat er getest wordt

`missingHours`, met al zijn randen: afwezig, vaste vrije dag, geen rooster,
precies genoeg geboekt, te weinig geboekt, en meer geboekt dan gepland. Dat is
de functie waar een fout iemand ten onrechte aanspreekt, of juist stil laat
wegkomen.

De "laatst gewerkt"-opzoeking is een databasequery en valt buiten de
testconventie van deze repo, die uitsluitend pure functies in `src/lib/*.test.ts`
test.

## Wat niet verandert

- Geen migratie en geen schemawijziging.
- De notitievelden en het opslaan daarvan blijven zoals ze zijn.
- Het datumveld op de standup blijft staan.
- De selectie "wie in beeld" blijft werken zoals hij werkt; wie verborgen is
  telt nog steeds mee in de dashboardkaart, want die gaat over het hele bedrijf
  en niet over de selectie van één leider.

## Uitrol

Geen migratie, geen backfill. Pushen naar `main` volstaat.

Handmatig na te lopen:

- [ ] Iemand die gisteren niets boekte en niet afwezig was: de standup toont
      `mist <uren>` en daaronder de laatste dag waarop hij wél werkte.
- [ ] Iemand die de helft boekte: `mist` toont het verschil, niet het hele
      rooster.
- [ ] Iemand met verlof: geen markering, alleen de bestaande afwezig-badge.
- [ ] Iemand op zijn vaste vrije dag: `werkt niet op <weekdag>`, geen markering.
- [ ] Iemand zonder weekrooster: geen markering, en hij telt niet mee op het
      dashboard.
- [ ] De dashboardkaart toont het juiste aantal en de juiste dag, en verdwijnt
      zodra iedereen bij is.
- [ ] De kaart is zichtbaar voor de teamleider, niet alleen voor admins.
