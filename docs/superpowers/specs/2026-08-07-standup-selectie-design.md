# Wie er in beeld staat bij de standup

**Datum:** 2026-08-07

## Waarom

Het standupscherm toont één kaart per actieve medewerker — veertien stuks — elk
met de uren van de vorige werkdag, de vorige notitie en een invoerveld. Wie de
standup leidt scrollt daar elke ochtend doorheen, langs mensen die niet in zijn
team zitten.

De standup wordt niet altijd door dezelfde persoon geleid: vijf mensen mogen het
(vier admins en één teamleider), en soms neemt een ander het over. Een vaste
indeling helpt dus niet; de leider van vandaag moet zelf kunnen bepalen wie hij
voor zich heeft.

## Wat het niet wordt

**Geen team in het datamodel.** Er is vandaag geen enkel teambegrip in deze app,
en een `Team`-tabel met een beheerscherm zou betekenen dat iemand eerst teams
moet inrichten voordat er ook maar iets verbetert. De standup is tot nu toe één
keer gehouden; dat is te vroeg om organisatiestructuur vast te leggen om een
scrolprobleem op te lossen.

Wat er wél komt is een schermvoorkeur van degene die leidt.

## Waar de voorkeur staat

In `localStorage`, onder de sleutel `standup-hidden:<userId>`.

Dat volgt het patroon dat het urenscherm al gebruikt voor zijn filters
(`time-filters:<userId>` in `src/components/time/time-entries-client.tsx`):
gehydrateerd in een mount-effect zodat er geen SSR-mismatch ontstaat, en met
`try/catch` om **zowel lezen als schrijven**. Dat laatste is geen sier: het
lezen van `localStorage` gooit een `SecurityError` in een browser die site-data
blokkeert, en dat mag dit scherm niet omleggen.

De sleutel draagt het gebruikers-id omdat vijf mensen de standup mogen leiden en
er meer dan één op dezelfde computer kan inloggen. Daarvoor moet
`StandupClient` weten wie er kijkt: het component krijgt nu geen props, dus
`src/app/(app)/standup/page.tsx` gaat `session.user.id` doorgeven.

## Opgeslagen wordt wie is weggeklikt

Niet wie zichtbaar is, maar wie verborgen is. Het verschil telt bij een nieuwe
collega: die staat er dan vanzelf bij, in plaats van onzichtbaar te blijven tot
iemand eraan denkt hem toe te voegen. In een dagelijks ritueel valt zo'n
ontbrekende persoon lang niet op, en iemand zien die je niet nodig had is de
goedkopere fout.

Niets opgeslagen betekent dus: iedereen zichtbaar, precies zoals het scherm zich
vandaag gedraagt. Er verandert niets tot een leider zelf iemand wegklikt.

## Het scherm

Een knop in de kop, naast de datumkiezer, met als tekst exact:

```
In beeld: 11 van 14
```

De getallen zijn het aantal zichtbare en het totaal. De knop staat er altijd,
ook wanneer niemand verborgen is (`In beeld: 14 van 14`) — hij is de enige weg
naar de keuze, dus hem verbergen zolang er niets verborgen is, verbergt ook de
functie.

Hij opent een dialoog met een vinkje per medewerker, in dezelfde vorm als het
tag-dialoog op het projectenscherm
(`src/components/projects/projects-client.tsx`): `Dialog`, een lijst, en een
voettekst met knoppen. De titel luidt `Wie in beeld`.

In dat dialoog staat ook **Toon iedereen**, dat de selectie wist. Een andere
teamleider die vandaag leidt, vinkt gewoon andere mensen aan — er is geen apart
mechanisme voor "iemand anders leidt".

Er komt geen popover-component bij. `@radix-ui/react-popover` is wel een
dependency maar heeft geen wrapper in `src/components/ui/`, en een dialoog doet
hier hetzelfde werk met wat er al ligt.

## De API blijft ongemoeid

`GET /api/standup` geeft nog steeds iedereen terug, met hun uren en notities.
Het filteren gebeurt in het scherm.

Twee redenen. Wie verborgen is houdt zo gewoon zijn notities — die worden alleen
niet getoond, niet weggegooid. En een serverparameter zou betekenen dat een
schermvoorkeur bepaalt wélke gegevens er opgehaald worden, wat later moeilijk te
doorgronden is. Bij veertien mensen is client-side filteren bovendien triviaal.

## Wat er getest wordt

Eén pure functie in `src/lib/`:

```ts
readHiddenIds(raw: string | null): string[]
```

Hij leest wat er in `localStorage` stond. Ontbrekend, onleesbaar, geen lijst, of
een lijst met iets anders dan strings erin → een lege lijst, dus iedereen
zichtbaar. **Dat is de kant om fout te zitten:** een stukgelopen voorkeur mag
nooit stilzwijgend mensen uit de standup laten verdwijnen.

Zelfde vorm en zelfde reden als `readStoredTheme` in `src/lib/theme.ts`. Te
testen: niets opgeslagen, geldige lijst, kapotte JSON, een JSON-waarde die geen
array is, en een array met niet-strings ertussen.

De rest is schermtoestand; deze repo test uitsluitend pure functies en dat
blijft zo.

## Eén rand die blijft liggen

Typ je een notitie bij iemand en klik je hem daarna weg zonder eerst het veld te
verlaten, dan is die notitie niet opgeslagen: dat gebeurt bij `onBlur`, en de
kaart verdwijnt. Zeldzaam genoeg om niet tegen te bouwen, maar het staat hier
zodat niemand er later over struikelt zonder uitleg.

## Uitrol

Geen migratie, geen schemawijziging, geen API-wijziging. Pushen naar `main`
volstaat.

Handmatig na te lopen:

- [ ] Het standupscherm opent met iedereen in beeld, precies zoals nu.
- [ ] Iemand wegklikken laat hem verdwijnen; de knop telt mee (`13 van 14`).
- [ ] Herladen houdt die selectie vast.
- [ ] **Toon iedereen** zet alles terug.
- [ ] Uitloggen en als een andere leider inloggen op dezelfde browser geeft
      diens eigen selectie, niet die van de vorige.
- [ ] Een verborgen medewerker die al een notitie had: die notitie is er nog
      zodra hij weer in beeld komt.
