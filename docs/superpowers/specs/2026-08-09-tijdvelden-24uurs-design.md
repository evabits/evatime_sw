# 24-uurs tijdvelden met een keuzelijst

**Datum:** 2026-08-09

## Waarom

Bij het invullen van uren staan de van-tot-velden in Amerikaanse notatie, met
AM/PM. Dat hoort 24-uurs te zijn. En bij zowel de tijden als het aantal uren wil
je kunnen klikken in plaats van typen, zonder dat typen verdwijnt.

## Waarom `type="time"` eruit moet

`<html lang="nl">` staat er al, en de velden tonen tóch AM/PM. Dat is meteen het
bewijs: `<input type="time">` rendert volgens de taal van de brówser, niet van
het document, en er is geen attribuut waarmee je 24-uurs afdwingt.

Om de notatie vast te zetten moeten de tijdvelden dus zelf gerenderd worden. Dat
levert de keuzelijst gratis op — één wijziging lost beide vragen op.

**Wat er ingeleverd wordt:** de native tijdkiezer op mobiel. Op een telefoon was
dat een wieltje; straks is het een keuzelijst met een numeriek toetsenbord. Voor
een app die vooral op een laptop wordt ingevuld is dat de goede ruil, maar het is
een echte achteruitgang voor wie hem op zijn telefoon gebruikt.

## De tijdvelden

`type="text"` met `inputMode="numeric"`, een `list` die naar een `datalist`
wijst, en `placeholder="09:00"`. De keuzelijst bevat alle 96 kwartieren van het
etmaal, van `00:00` tot `23:45`. De waarde blijft `HH:MM`, dus `hoursBetween`
verandert niet.

## Typen moet soepeler, want het wordt de gewone weg

`hoursBetween` accepteert alleen `HH:MM` met twee cijfers. Wie `9:00` intikt zou
nu de melding *"De eindtijd moet ná de begintijd liggen"* krijgen — een leugen
over wat er misging, en met een tekstveld wordt dat een dagelijks probleem in
plaats van een randgeval.

Daarom een normalisatie bij het verlaten van het veld:

```ts
normalizeTime(raw: string): string
```

- `9:00` → `09:00`, `9:5` → `09:05`, `09:00` → `09:00`
- leeg blijft leeg
- alles wat niet op `u:m` lijkt blijft staan zoals het getypt is, zodat de
  bestaande melding zijn werk doet

Bewust geen parser: `930` of `9u30` wordt niet omgezet. De keuzelijst is er voor
wie niet wil typen, en een half-slimme parser die soms iets anders begrijpt dan
je bedoelde is erger dan er geen.

Hij oordeelt niet over het bereik: `25:00` blijft `25:00` en wordt verderop door
`hoursBetween` geweigerd. Eén plek die over geldigheid gaat.

## Het uren-veld

Blijft `type="number"` met `step="0.25"`, en krijgt er een keuzelijst bij met
kwartieren van 0,25 tot 12 uur. Het afronden uit het vorige ontwerp verandert
niet — kiezen uit de lijst levert per definitie al een kwartier op.

Ook het uren-veld in het bewerkingsvenster van de rapportage
(`src/components/reports/entry-edit-dialog.tsx`) krijgt die lijst. Dat is
dezelfde handeling op dezelfde soort regel; dat venster heeft geen van-tot, dus
daar verandert verder niets.

Beide schermen renderen hun eigen `datalist` met een eigen id. Twee elementen met
hetzelfde id op één pagina is ongeldige HTML, en de twee schermen zitten weliswaar
op verschillende routes, maar dat is geen garantie die je in de opmaak wilt
vastleggen.

## De lijsten komen uit de kwartierregel

Twee exports in `src/lib/quarter-hours.ts`:

```ts
TIME_CHOICES: string[]   // "00:00" t/m "23:45", 96 stuks
HOUR_CHOICES: number[]   // 0.25 t/m 12, 48 stuks
```

Ze worden berekend uit `QUARTER` en niet met de hand uitgeschreven, en er komt
een test op dat elke waarde ook echt een kwartier is. Anders kan de keuzelijst op
termijn iets aanbieden dat het formulier vervolgens afrondt — een lijst die je
een waarde laat kiezen die daarna verandert, is erger dan geen lijst.

## Wat er getest wordt

`normalizeTime`: eencijferig uur, eencijferige minuut, beide, een waarde die al
goed staat, leeg, en iets wat er niet op lijkt (dat onveranderd terug moet komen).

`TIME_CHOICES` en `HOUR_CHOICES`: de lengte, de eerste en laatste waarde, en dat
elke waarde een kwartier is — voor de tijden gecontroleerd via `hoursBetween`
vanaf middernacht, voor de uren via `isQuarter`.

De schermen zijn React en vallen buiten de testconventie van deze repo, die
uitsluitend pure functies in `src/lib/*.test.ts` test.

## Wat niet verandert

- Geen schemawijziging, geen migratie, geen API-wijziging.
- `hoursBetween` blijft de enige plek die over een geldig tijdvak oordeelt.
- Het afronden op kwartieren blijft precies zoals het is.
- De pauze blijft een getalveld in minuten, zonder keuzelijst: daar zijn maar een
  paar zinnige waarden en die typ je sneller dan je ze zoekt.

## Uitrol

Geen migratie. Pushen naar `main` volstaat.

Handmatig na te lopen:

- [ ] De tijdvelden tonen 24-uurs notatie, ook in een browser die op Engels staat.
- [ ] De keuzelijst bij van-tot toont kwartieren en filtert mee tijdens typen.
- [ ] `9:00` intikken en wegklikken maakt er `09:00` van.
- [ ] `25:00` intikken geeft nog steeds de bestaande melding.
- [ ] De keuzelijst bij Uren werkt, en typen van 7,67 rondt nog steeds af naar
      7,75.
- [ ] Het bewerkingsvenster in de rapportage heeft de keuzelijst bij Uren.
