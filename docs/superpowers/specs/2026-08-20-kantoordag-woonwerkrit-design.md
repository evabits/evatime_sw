# Op kantoor geweest — automatisch de woon-werkrit

**Datum:** 20-AUG-2026
**Status:** ontwerp vastgesteld, klaar voor een implementatieplan

## Waarom

Wie op kantoor is geweest, heeft die dag zijn woon-werkrit gereden. Nu moet
iedereen die rit met de hand toevoegen op het km-scherm, elke keer opnieuw,
terwijl het sjabloon met de juiste afstand al klaarstaat. Dat wordt vergeten, en
vergeten kilometers zijn geld dat niet vergoed wordt.

Dit ontwerp zet één vinkje per dag op het urenscherm: aan betekent dat de
woon-werkrit van die dag klaarstaat.

## Wat er al is

Het woon-werksjabloon **bestaat al**: een `KmTemplate` met `managedByAdmin: true`,
per medewerker ingesteld onder `/personeel/[id]`. Elf van de vijftien medewerkers
hebben er een, van 11 km tot 225 km. Dit ontwerp voegt daar niets aan toe; het
gebruikt het alleen.

Het urenscherm heeft een weekoverzicht met een gedeeld `WeekGrid`-component, dat
ook het km-scherm gebruikt.

## Reikwijdte

**Wel:**

- Eén vinkje per dag in het weekoverzicht van het urenscherm.
- Aanvinken zet de woon-werkrit van die dag klaar; uitvinken haalt hem weg.
- Ritten die uit het woon-werksjabloon komen worden als zodanig herkenbaar,
  waar ze ook aangemaakt zijn.

**Niet, en waarom:**

| Buiten scope | Reden |
|---|---|
| Een aparte registratie "op kantoor geweest" | Zie "Afwegingen". |
| Terugwerkende kracht op bestaande ritten | Oude woon-werkritten zijn niet te onderscheiden van andere ritten naar hetzelfde project met hetzelfde aantal kilometers. Het vinkje van vorige weken hoeft niet met terugwerkende kracht te kloppen. |
| Automatisch invullen op basis van het weekrooster | Niet gevraagd. Een rooster zegt wanneer je wérkt, niet waar. |
| Een beheerder die de kantoordagen van iemand anders zet | Zie "Randgevallen". |
| Het vinkje in de lijstweergave | Bewust één plek; zie "Afwegingen". |

## Afwegingen

### De vink ís de rit — geen aparte registratie

Overwogen: een eigen tabel die per persoon per dag vastlegt dat iemand op
kantoor was, die daarnaast de rit aanmaakt. Dat zou ook toelaten vast te leggen
dat iemand op kantoor was zónder kilometers — gefietst, meegereden, met de trein.

Afgevallen omdat het twee dingen zijn die synchroon moeten blijven, en dat is
precies waar dit soort automatismen op stukloopt: iemand verwijdert de rit op het
km-scherm, het vinkje blijft aan, en niemand weet meer wat waar is.

**Gekozen:** er is één waarheid, de kilometerregistratie. Het vinkje staat aan
omdat er een woon-werkrit voor die dag staat, en uit omdat die er niet is.

### In het weekoverzicht, niet bij de dagkop

Mensen vullen dit achteraf per week in, niet elke ochtend apart. In het
weekoverzicht zet je je kantoordagen in één blik; bij een dagkop in de lijst zie
je dat overzicht niet, en voor een dag zonder uren is er geen kop om het aan te
hangen.

### Een eigen rij onder het weekraster

`WeekGrid` (`src/components/shared/week-grid.tsx`) is gedeeld met het km-scherm,
en elke dag is er al een `<button>`. Een vinkje daarin nestelen levert geneste
klikgebieden op — en het km-scherm heeft niets aan kantoordagen. De rij komt dus
eronder, uitgelijnd op hetzelfde raster van acht kolommen.

## Datamodel

### `KmEntry` — één veld erbij

```prisma
  /// Deze rit is de woon-werkrit van die dag, aangemaakt vanuit het beheerde
  /// woon-werksjabloon. Nodig omdat het vinkje op het urenscherm moet weten
  /// wélke rit de zijne is: herkennen op project en afstand breekt zodra iemand
  /// zijn rit aanpast of een tweede rit naar dezelfde plek maakt.
  commute        Boolean       @default(false)
```

Additief en met een standaardwaarde, dus veilig vóór de codedeploy te pushen.

### Welk sjabloon het woon-werksjabloon is

Het `KmTemplate` van die medewerker met `managedByAdmin: true` — hetzelfde
sjabloon dat `/personeel/[id]` toont en beheert. Heeft iemand er per ongeluk
twee, dan wint de laatst gewijzigde: dat is een datafout die zichzelf zo niet
verergert.

### De vlag wordt overal gezet — en waarom dat een extra veld kost

Maakt iemand op het km-scherm handmatig een rit vanuit zijn woon-werksjabloon,
dan hoort die rit óók `commute: true` te krijgen. Anders staat het vinkje uit
terwijl de rit er wel is, en maakt aanvinken een tweede rit.

**Dat kan de server nu niet weten.** Het km-scherm kiest een sjabloon, vult
daarmee de formuliervelden, en stuurt alleen die waarden op; `POST /api/km`
krijgt geen sjabloon mee. De aanmaakroute krijgt er daarom een optioneel
`templateId` bij. Is dat het beheerde woon-werksjabloon van de aanvrager, dan
zet de server `commute: true` — de server beslist dat zelf, op grond van het
sjabloon dat hij zelf opzoekt, en gelooft geen `commute`-vlag van de client.

## Scherm

Onder het weekraster op `/time` komt een rij **"Op kantoor"** met zeven vakjes,
uitgelijnd op dezelfde acht kolommen als het raster erboven. Aanvinken zet de rit
klaar, uitvinken haalt hem weg, en het scherm meldt kort wat er gebeurd is —
bijvoorbeeld *"WoonWerk 77,7 km toegevoegd"*.

**De rij verschijnt alleen als je naar één persoon kijkt.** Staat het
medewerkersfilter op "alle medewerkers", dan telt het raster ieders uren bij
elkaar op en is er geen zinnige eigenaar voor een vinkje.

**Zonder woon-werksjabloon is het vakje uitgegrijsd**, met de reden erbij: dat
moet een beheerder eerst instellen onder Personeel. Vier van de vijftien
medewerkers zitten nu in die situatie.

## Randgevallen

| Geval | Gedrag |
|---|---|
| Geen woon-werksjabloon | Vakje uitgegrijsd met de reden. De server weigert het ook, met een Nederlandse melding. |
| Dag staat al aan, wordt opnieuw aangevinkt | Niets doen. Twee keer aanvinken maakt geen tweede rit. |
| Dag staat al uit, wordt opnieuw uitgevinkt | Niets doen. |
| De rit is al gefactureerd | Uitvinken geweigerd, met dezelfde melding als elders in de app. |
| De rit is met de hand aangepast | Uitvinken haalt hem alsnog weg — het blijft de woon-werkrit van die dag. Niet gefactureerd is de enige voorwaarde. |
| Weekend of verlofdag | Toegestaan. Rijdt iemand op zaterdag naar kantoor, dan is dat een rit. |
| Twee beheerde sjablonen | De laatst gewijzigde wint. |
| Er staat al een woon-werkrit zonder de vlag | Het vinkje staat uit en aanvinken maakt een tweede rit. Dat is de prijs van geen terugwerkende kracht: oude ritten zijn niet te herkennen. Het scherm waarschuwt daarom bij het aanvinken als er die dag al een rit staat op hetzelfde project met hetzelfde aantal kilometers, en vraagt of je die bedoelde. |
| Beheerder kijkt naar iemand anders | Hij ziet de vinkjes, maar kan ze niet zetten. Een beheerder mag andermans kilometers wél wijzigen op het km-scherm zelf; deze snelknop blijft bewust bij de eigen dagen, zodat er geen twijfel is wie wat heeft aangezet. |

## Koppelvlakken

Eén nieuw routebestand, `/api/km/commute`, met twee methodes:

| Methode | Doel |
|---|---|
| `GET ?from=&to=` | Welke dagen in dat venster al een woon-werkrit hebben. |
| `POST` | `{ date, present: boolean }` — zet die dag aan of uit. |

`POST` is altijd voor de eigen dagen van de ingelogde gebruiker; de route
leidt de eigenaar af uit de sessie en niet uit de aanvraag. `GET` honoreert
daarnaast een optionele `userId` voor wie andermans registraties mag inzien —
uitsluitend lezend: een beheerder ziet zo de vinkjes van een medewerker, maar
zet ze niet (zie "Beheerder kijkt naar iemand anders" hierboven).

`POST /api/km` krijgt een optioneel `templateId` erbij. Is dat het beheerde
woon-werksjabloon van de aanvrager, dan zet de server zelf `commute: true`. De
client stuurt die vlag nooit rechtstreeks mee.

## Pure functies

Nieuw bestand `src/lib/commute.ts`, tests in `src/lib/commute.test.ts`.

| Functie | Verantwoordelijkheid |
|---|---|
| `pickCommuteTemplate(sjablonen)` | Het beheerde sjabloon van een medewerker, of `null`. Bij meerdere: de laatst gewijzigde. |
| `commuteDates(ritten)` | Welke dagen aanstaan, als `yyyy-MM-dd`. |
| `commuteEntryData(sjabloon)` | Wat er weggeschreven wordt: het project en de kilometers van het sjabloon, en als omschrijving de omschrijving van het sjabloon, of anders de naam ervan. Zo staat er nooit een lege regel in de kilometerlijst. |
| `commuteToggleDenial(...)` | De weigeringen uit de tabel hierboven, als Nederlandse melding of `null`. |

## Uitrol

Additief — één kolom met een standaardwaarde — dus in de gebruikelijke volgorde:
`prisma migrate diff` lezen, `db:push` naar de productiedatabase, en pas daarna
de code deployen. De draaiende code merkt niets van de nieuwe kolom.

## Klaar wanneer

- Een medewerker ziet onder het weekraster op `/time` een rij "Op kantoor" met
  zeven vakjes, en kan daarmee per dag zijn woon-werkrit klaarzetten en weghalen.
- Het vinkje weerspiegelt altijd wat er in de kilometerregistratie staat, ook na
  een wijziging op het km-scherm.
- Wie geen woon-werksjabloon heeft, krijgt een uitgegrijsd vakje met de reden.
- Een gefactureerde rit kan niet via het vinkje verdwijnen.
- De pure functies zijn gedekt door tests, inclusief de randgevallen hierboven.
- `npx tsc --noEmit` is schoon, `npm run build` geeft exitcode 0 en de volledige
  vitest-suite is groen.
