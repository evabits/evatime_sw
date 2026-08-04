# Ontwerp: goedgekeurde afwezigheid als boeking in de tijdlijn

Datum: 2026-08-04
Aanleiding: gebruikersfeedback. Goedgekeurde afwezigheid moet als boeking in de urenlijst
terugkomen, met de verlofsoort erbij.

**Dit is traject 1 van twee.** Het tweede — een sjabloon voor vaste afwezigheid per medewerker bij
contracten onder de 40 uur — krijgt een eigen spec en komt hierna. Die volgorde is nodig: een vaste
vrije dag moet dezelfde soort boeking opleveren als een goedgekeurde aanvraag, dus dat traject
bouwt op de machinerie uit dit traject voort.

Bij het uitzoeken bleek dat er **nergens in de app een begrip van een wekelijks patroon** bestaat:
geen dag-van-de-week, geen herhaalregel, en de drie cronjobs lezen alleen en schrijven nooit een
domeinrecord. Ook `Contract.contractHours` en `Contract.ftePercentage` staan wel in het schema maar
worden nergens gelezen — alle uren-versus-doel-berekeningen gebruiken `User.weeklyHours`. Beide
feiten raken vooral traject 2 en staan hier alleen genoteerd zodat ze niet opnieuw uitgezocht
hoeven te worden.

## Uitgangssituatie

`AbsenceRequest` (`prisma/schema.prisma:408-423`) heeft `userId`, `type`, `startDate`, `endDate`,
één totaal `hours` voor de hele periode, `status`, en de reviewvelden. Er is **geen relatie naar
`TimeEntry`**.

Goedkeuren gebeurt in `PUT /api/absence-requests/[id]` met `{ status: "APPROVED" }`, admin-only.
Die handler schrijft **uitsluitend** `status`, `reviewedBy` en `reviewedAt`
(`src/app/api/absence-requests/[id]/route.ts:34-45`). Er wordt geen urenregel gemaakt, geen
vakantiesaldo bijgewerkt en geen mail verstuurd.

`TimeEntry.projectId` is **verplicht** (`prisma/schema.prisma:175`). Er kan geen urenregel bestaan
zonder project, en er is nergens een verlofproject — niet in de code, niet in `prisma/seed.ts`.

`AbsenceType` kent vandaag `VACATION`, `SICK`, `SPECIAL_LEAVE` en `UNPAID_LEAVE`.
Ouderschapsverlof bestaat niet.

`/uren-overzicht` en `/api/cron/hours-reminder` tellen alle urenregels op zonder enig filter op
project of factureerbaarheid.

Sinds recente trajecten geldt bovendien: factureerbaarheid komt van het project
(`src/lib/billable.ts`), alleen deelnemers kunnen op een project boeken, en `Project.name` is uniek
in de hele app.

## Beslissingen

| Onderwerp | Keuze |
|---|---|
| Vorm | **Echte `TimeEntry`-regels**, geen weergave-truc. |
| Terugvinden | Een **`absenceRequestId`-kolom** op `TimeEntry`. |
| Project | **Eén project per verlofsoort**, handmatig aangemaakt. |
| Verdeling | Gelijk over de **werkdagen** in de periode, restant op de laatste dag. |
| Bewerken | Verlofregels zijn **niet** handmatig te wijzigen of te verwijderen. |
| Ouderschapsverlof | Nieuwe waarde `PARENTAL_LEAVE` in de enum. |
| Bestaande aanvragen | Backfill voor het lopende jaar, droog-draaiend script. |

## Deel 1: het datamodel

```prisma
enum AbsenceType {
  VACATION
  SICK
  PARENTAL_LEAVE
  SPECIAL_LEAVE
  UNPAID_LEAVE
}

model TimeEntry {
  // ... bestaande velden ongewijzigd
  absenceRequestId String?
  absenceRequest   AbsenceRequest? @relation(fields: [absenceRequestId], references: [id], onDelete: Cascade)
}

model AbsenceRequest {
  // ... bestaande velden ongewijzigd
  timeEntries TimeEntry[]
}
```

`onDelete: Cascade` doet het opruimen gratis: verwijdert iemand de aanvraag, dan verdwijnen de
gegenereerde urenregels mee. Dat is de enige variant die niet vergeten kan worden, en het scheelt
code in de `DELETE`-handler.

De kolom is nullable, want vrijwel elke urenregel is een gewone boeking. `absenceRequestId !== null`
is daarmee precies de definitie van "dit is een verlofregel".

### Waar `PARENTAL_LEAVE` overal opduikt

De enum-waarde erbij zetten is één regel; hem overal láten werken is vier plekken. Elk van deze
kent de soorten los van elkaar, en wie er één vergeet krijgt geen foutmelding maar stil verkeerd
gedrag:

| Plek | Wat er nu staat | Gevolg als je hem vergeet |
|---|---|---|
| `prisma/schema.prisma` | de enum | de waarde bestaat niet |
| `src/app/api/absence-requests/[id]/route.ts:9` | `employeeUpdateSchema` met de vier soorten | een medewerker kan zijn aanvraag niet op ouderschapsverlof zetten |
| `src/components/vacation/absence-client.tsx:23-25` | Nederlandse labels per soort | de keuzelijst mist de optie, en bestaande rijen tonen de ruwe enum-waarde |
| `src/app/api/standup/route.ts:12-13` | `ABSENCE_LABELS` voor het standupscherm | de standup toont `PARENTAL_LEAVE` in plaats van `ouderschapsverlof` |

Die laatste is de makkelijkst te missen: het standupscherm van gisteren heeft zijn eigen kopie van
de labels, en niets verbindt de twee lijsten. Ze samenvoegen tot één gedeelde tabel valt buiten dit
traject, maar beide moeten nu wel bijgewerkt worden.

## Deel 2: de vijf verlofprojecten

| Verlofsoort | Projectnaam |
|---|---|
| `VACATION` | `Vakantieverlof` |
| `SICK` | `Ziekteverlof` |
| `PARENTAL_LEAVE` | `Ouderschapsverlof` |
| `SPECIAL_LEAVE` | `Bijzonder verlof` |
| `UNPAID_LEAVE` | `Onbetaald verlof` |

Alle vijf: **geen klant**, **`billable: false`**, **geen deelnemers**.

De namen zijn bewust gelijk aan de bestaande labels in `ABSENCE_TYPE_LABELS`
(`src/components/vacation/absence-client.tsx:20-25`), op één na: daar heet `VACATION` "Vakantie",
terwijl het project **Vakantieverlof** heet. Dat is opzet — in de projectkolom van de urenlijst
staat het naast projectnamen als "Assemblage koffer", en dan leest "Vakantieverlof" eenduidiger dan
"Vakantie". De labels in het afwezigheidsscherm blijven zoals ze zijn; die staan in hun eigen
context.

`billable: false` betekent dat `isBillable` er `false` voor teruggeeft, en de factuuropbouw filtert
op `isBillable(e) === true`. Een verlofregel kan dus nooit op een factuur belanden.

**Geen deelnemers is het interessante deel.** Sinds het deelnemerstraject kan niemand boeken op een
project waar hij niet op staat, en de invoerformulieren tonen zulke projecten niet eens. Een
verlofproject zonder deelnemers is daarmee onbereikbaar voor handmatige invoer: de enige weg naar
een verlofregel is goedkeuring. Dat is geen bijwerking maar het gewenste gedrag.

De koppeling soort → projectnaam staat als tabel in `src/lib/absence-entries.ts`, samen met de
verdeelfunctie uit deel 3 — één module voor "hoe een aanvraag urenregels wordt". De projecten
worden **niet automatisch aangemaakt**: ontbreekt er één, dan weigert de goedkeuring met
`Het project "Ziekteverlof" bestaat nog niet` (status 400, met de werkelijke naam ingevuld). Een
project dat uit het niets verschijnt is later moeilijk te doorgronden; een weigering die zegt wat
je mist niet.

Omdat `Project.name` uniek is in de hele app, is opzoeken op naam eenduidig.

## Deel 3: de uren over de dagen verdelen

Een aanvraag draagt één totaal voor een periode. Vijf dagen vakantie is één regel van 40 uur; de
tijdlijn heeft per dag een getal nodig.

De uren worden gelijk verdeeld over de **werkdagen** in de periode — weekenden overgeslagen — met
het restant op de laatste werkdag, zodat de som exact het aangevraagde totaal blijft. 40 uur over
vijf werkdagen wordt vijf keer 8,00. 10 uur over drie werkdagen wordt 3,33 + 3,33 + 3,34.

De regel precies: elke dag behalve de laatste krijgt het totaal gedeeld door het aantal dagen,
naar beneden afgerond op twee decimalen; de laatste dag krijgt het totaal minus de som van de
voorgaande. `TimeEntry.hours` is `Decimal(5,2)`, dus twee decimalen is ook wat de kolom aankan —
afronden op meer zou de database alsnog laten afkappen en de som stilzwijgend laten afwijken.

Feestdagen worden niet overgeslagen, net als bij de standup: die staan nergens in de app, en wie
verlof opneemt rond Pasen heeft daar ook verlofuren voor opgegeven.

Valt de hele periode in een weekend — een onmogelijke maar niet ondenkbare invoer — dan zijn er nul
werkdagen. De goedkeuring weigert dan met `Deze periode bevat geen werkdagen`, in plaats van te
delen door nul of stilzwijgend niets te maken.

### Werkdagen krijgen hun eigen module

`previousWorkingDay` woont sinds het standup-traject in `src/lib/standup.ts`. Hij is niet langer
iets van de standup, en twee werkdagfuncties in twee bestanden gaan op termijn uit elkaar lopen.

Daarom verhuist hij naar een nieuw `src/lib/working-days.ts`, samen met de nieuwe functie:

```ts
export function previousWorkingDay(date: string): string;
export function workingDaysBetween(from: string, to: string): string[];
```

Beide nemen en geven `YYYY-MM-DD` en rekenen uitsluitend in UTC (`getUTCDay`, `setUTCDate`,
`new Date(\`${d}T00:00:00Z\`)`), om dezelfde reden als in het standup-traject: de productieserver
draait op UTC en de gebruikers zitten in Amsterdam, en `getDay()`/`setDate()` rekenen lokaal.

`workingDaysBetween` geeft de werkdagen van `from` tot en met `to`, in oplopende volgorde, en een
lege lijst wanneer er geen zijn of `to` vóór `from` ligt.

De verhuizing raakt `src/lib/standup.test.ts`, `src/lib/standup.ts` en de import in
`src/app/api/standup/route.ts`. `src/lib/standup.ts` verdwijnt daarmee.

## Deel 4: wat er bij goedkeuring gebeurt

In `PUT /api/absence-requests/[id]`, in de admintak die vandaag alleen de status wegschrijft, komt
één transactie bij:

1. `deleteMany` op alle `TimeEntry`-regels met deze `absenceRequestId`.
2. Bij `status === "APPROVED"`: bereken de werkdagen, verdeel de uren, en maak per werkdag een
   regel aan.

Verwijderen-en-opnieuw-maken in plaats van bijwerken. Zo komen gewijzigde datums vanzelf goed, en
er is één codepad in plaats van drie.

Elke andere status — `REJECTED`, of terug naar `PENDING` — laat het bij stap 1. De tijdlijn kan
daarmee niet uit de pas lopen met de aanvraag.

De gegenereerde regels krijgen:

| Veld | Waarde |
|---|---|
| `userId` | de aanvrager, niet de goedkeurder |
| `projectId` | het project van de verlofsoort |
| `date` | de werkdag |
| `hours` | het aandeel van die dag |
| `description` | de omschrijving van de aanvraag, of leeg |
| `absenceRequestId` | de aanvraag |
| `rateOverride`, `workLevel` | leeg |

`workLevel` blijft leeg omdat verlof geen tarief heeft; het project is niet-factureerbaar, dus er
valt niets te berekenen.

Er wordt **geen** deelnemerscontrole gedaan: die zit in de API-routes voor handmatige invoer, en
deze schrijfactie is juist de uitzondering waarvoor de projecten geen deelnemers hebben.

## Deel 5: verlofregels zijn niet handmatig te bewerken

Zonder dit deel haalt de rest zichzelf onderuit. Een medewerker ziet de verlofregels in zijn
urenlijst staan en kan er vandaag gewoon op klikken: uren wijzigen, of verwijderen. Dan klopt de
tijdlijn niet meer met de aanvraag en is er niets dat dat herstelt.

`PUT /api/time/[id]` en `DELETE /api/time/[id]` weigeren daarom een regel waarop `absenceRequestId`
staat, met status 400 en `Verlofregels wijzig je via de afwezigheidsaanvraag`.

Datzelfde geldt voor `POST /api/entries/bulk`: verplaatsen naar een ander project, toewijzen aan een
andere medewerker en bulk verwijderen moeten verlofregels overslaan. Die route weigert al in zijn
geheel bij een overtreding, dus dit wordt dezelfde vorm: bevat de selectie verlofregels, dan wordt
de hele actie geweigerd met dezelfde tekst.

In `src/components/time/time-entries-client.tsx` zijn de bewerk- en verwijderknoppen bij zo'n regel
uitgeschakeld, met die reden als tooltip. De servercontrole staat daar los van en blijft in alle
gevallen gelden.

## Deel 6: het gevolg voor de urenoverzichten

`/uren-overzicht` en `/api/cron/hours-reminder` tellen alle urenregels op zonder filter. Verlofuren
gaan dus meetellen als geboekte uren.

Dat is gewenst: wie een week op vakantie is, hoort geen tekort van 40 uur te tonen en hoort geen
herinnering te krijgen dat hij moet boeken. Maar het is een betekenisverandering van die twee
schermen — na de uitrol zien de getallen er anders uit dan de week ervoor, en dat is geen fout.

Er verandert niets aan de code van die twee plekken. Dit staat hier omdat het een bewuste uitkomst
is en niet iets dat later als bug gemeld moet worden.

Het vakantiesaldo verandert niet mee. Dat is vandaag een berekening in de client op basis van
goedgekeurde `AbsenceRequest`-uren (`src/components/vacation/absence-client.tsx:686-697`) en dat
blijft zo — die telt de aanvraag, niet de urenregels, dus er ontstaat geen dubbeltelling.

## Deel 7: bestaande goedgekeurde aanvragen

Er staan goedgekeurde aanvragen in productie zonder urenregels. Een script
`prisma/backfill-absence-entries.ts` genereert die alsnog, voor het **lopende kalenderjaar**, naar
het model van de eerdere backfills: standaard droog, schrijft alleen met `--write`, en draait in één
`$transaction`.

Het script slaat aanvragen over die al regels hebben, zodat het herhaalbaar is zonder schade. Het
meldt expliciet welke aanvragen het overslaat omdat het bijbehorende verlofproject ontbreekt, in
plaats van ze stil te laten vallen.

Alleen het lopende jaar, omdat oudere periodes al zijn afgerekend en het achteraf toevoegen van
uren daar de historische urenoverzichten zou verschuiven zonder dat iemand daarom vroeg.

## Testen

Volgens het patroon van de repo: pure functies in `src/lib/` met vitest, geen component- of
API-tests.

`src/lib/working-days.test.ts` — de bestaande acht tests voor `previousWorkingDay` verhuizen mee en
blijven ongewijzigd. Erbij, voor `workingDaysBetween`:

- Maandag tot en met vrijdag van dezelfde week → vijf datums.
- Een periode van één dag die op een werkdag valt → één datum.
- Een periode van één dag die op een zaterdag valt → lege lijst.
- Een periode die een weekend overspant → alleen de werkdagen, in oplopende volgorde.
- Een periode waarvan `to` vóór `from` ligt → lege lijst.
- Een periode over een maandgrens → de juiste werkdagen aan beide kanten.

`src/lib/absence-entries.test.ts`, voor de pure verdeelfunctie:

```ts
export function splitHoursOverDays(totalHours: number, days: string[]):
  Array<{ date: string; hours: number }>;
```

- 40 uur over 5 dagen → vijf keer 8.
- 10 uur over 3 dagen → 3.33, 3.33, 3.34; de som is exact 10.
- 8 uur over 1 dag → één keer 8.
- 0 dagen → lege lijst, geen deling door nul.
- 7,5 uur over 2 dagen → 3.75 en 3.75.
- De som van de uitkomst is in elk geval exact gelijk aan het totaal.

Handmatig na te lopen:

- Een aanvraag van vijf dagen goedkeuren en de vijf regels in `/time` zien staan, met de
  projectnaam van de verlofsoort.
- Diezelfde aanvraag afkeuren en zien dat de regels verdwijnen.
- Een aanvraag over een weekend goedkeuren en zien dat zaterdag en zondag overgeslagen worden.
- Als medewerker een verlofregel proberen te bewerken en te verwijderen → geweigerd, knoppen uit.
- Op `/reports` een reeks met een verlofregel erin bulksgewijs verplaatsen → de hele actie
  geweigerd.
- Een aanvraag verwijderen en zien dat de urenregels meegaan.
- Een verlofsoort goedkeuren waarvan het project niet bestaat → weigering die het project noemt.
- `/uren-overzicht` voor een week met verlof: de geboekte uren tellen het verlof mee.
- Controleren dat een verlofproject niet in de projectkeuzelijst van `/time` staat.
- Controleren dat een verlofregel niet in de factuuropbouw verschijnt.

## Uitrol

1. In `/projects` de vijf verlofprojecten aanmaken: geen klant, niet-factureerbaar, geen
   deelnemers.
2. `prisma migrate diff` draaien en de volledige lijst lezen — er hoort alleen een enum-waarde en
   een nullable kolom met een foreign key bij te komen.
3. `npm run db:push`.
4. Deployen.
5. `npm run backfill:absence-entries` droog draaien, de uitvoer controleren, dan met `--write`.

Stap 1 kan vooraf omdat een project zonder deelnemers voor de huidige code gewoon een leeg project
is. Stap 5 komt ná de deploy omdat het script de nieuwe kolom nodig heeft.

## Buiten scope

- Het sjabloon voor vaste afwezigheid per medewerker. Traject 2.
- Het vakantiesaldo automatisch afboeken bij goedkeuring.
- Feestdagen.
- Een goedgekeurde aanvraag laten wijzigen door de medewerker; dat kan nu ook niet.
- Verlofuren apart tonen of uitsluiten in `/uren-overzicht` en de urenherinnering.
- Halve dagen als expliciet begrip. Een halve dag is nu een aanvraag van vier uur over één dag, en
  dat werkt.
