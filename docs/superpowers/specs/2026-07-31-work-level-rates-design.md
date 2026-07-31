# Ontwerp: werkniveaus met tarieven per klant en per project

Datum: 2026-07-31
Aanleiding: gebruikersfeedback — een werkniveau per medewerker, en uurtarieven per werkniveau
die per klant worden ingesteld en per project overruled kunnen worden.

## Uitgangssituatie

Het uurtarief van een urenregel komt vandaag tot stand via
`rateOverride ?? activityType.defaultRate ?? project.defaultHourlyRate ?? 0`. Dat staat op drie
plekken uitgeschreven: `src/lib/report-totals.ts:19`, `src/components/invoices/new-invoice-client.tsx:84`,
en `getEffectiveRate` in `src/components/time/time-entries-client.tsx`.

Die drie lopen uit elkaar. Er bestaat een tabel `ProjectActivityRate` — een tarief per project
per activiteit — en `getEffectiveRate` gebruikt hem wél, terwijl de rapportberekening en de
factuuropbouw hem overslaan. Het urenformulier toont dus een tarief dat afwijkt van wat er
gefactureerd wordt. Die tabel is bovendien bereikbaar via `/api/projects/[id]/rates`, een route
zonder enkele rolcontrole: elke ingelogde medewerker kan er projecttarieven mee zetten.

`InvoiceLine` legt `unitPrice` en `total` vast, dus alles wat al gefactureerd is behoudt zijn
bedrag ongeacht wat er aan de tariefzijde verandert.

## Beslissingen

| Onderwerp | Keuze |
|---|---|
| Verhouding tot activiteitstarieven | Het werkniveau **vervangt** ze. Activiteiten blijven bestaan voor rapportage en voor factureerbaar ja/nee, maar bepalen geen tarief meer. |
| Bij promotie | Het niveau wordt als momentopname op de urenregel vastgelegd. Oude regels houden hun niveau; een tariefwijziging bij de klant werkt wél door op nog niet gefactureerde regels. |
| Terugval | **Geen.** Is er geen niveautarief, dan is er geen tarief. Geen terugval op het activiteitstarief en geen op het projecttarief. |
| Opruimen | `ActivityType.defaultRate` en de tabel `ProjectActivityRate` gaan eruit, met hun invoervelden en de route `/api/projects/[id]/rates`. |
| `Project.defaultHourlyRate` | Gaat in dezelfde beweging weg. Hij zat in de oude keten als laatste terugval en die terugval bestaat niet meer. |
| Ritten | Ongemoeid. `Project.defaultKmRate` en de km-tariefketen veranderen niet. |

Het gevolg van "geen terugval" is expliciet aanvaard: op de dag van uitrol is elk nog niet
gefactureerd uur zonder ingevuld niveautarief € 0 waard. Om te voorkomen dat dat stil gebeurt,
maakt dit ontwerp een onbepaalbaar tarief zichtbaar in plaats van het als € 0,00 te tonen — zie
"Markering".

## Deel 1: datamodel

Nieuwe enum:

```prisma
enum WorkLevel {
  PRODUCTION
  JUNIOR
  MEDIOR
  SENIOR
}
```

Nederlandse labels, in deze volgorde in elke keuzelijst: Productie, Junior Engineer,
Medior Engineer, Senior Engineer.

Toevoegingen:

- `User.workLevel WorkLevel?` — nullable; bestaande medewerkers hebben er nog geen.
- `TimeEntry.workLevel WorkLevel?` — momentopname, gevuld bij het aanmaken vanuit het niveau van
  de **eigenaar** van de regel, niet van de admin die hem invoert. Wijst een admin een bestaande
  regel toe aan een andere medewerker, dan wordt het niveau bijgewerkt naar het huidige niveau
  van de nieuwe eigenaar. Bij het bewerken van een regel zonder de eigenaar te wijzigen blijft
  het niveau staan zoals het was — ook als de eigenaar inmiddels een ander niveau heeft.

  Heeft de eigenaar op het moment van boeken zelf nog geen niveau, dan blijft de kolom leeg en
  gedraagt die regel zich als een regel van vóór deze wijziging: hij leunt op het actuele niveau
  van de eigenaar zodra dat gezet wordt. De bevriezing geldt dus alleen voor regels die bij het
  boeken een niveau hadden. Dat is bewust: een regel bevriezen op "geen niveau" zou hem
  permanent onfactureerbaar maken.
- `CustomerLevelRate { id, customerId, level, rate }` met `@@unique([customerId, level])`.
- `ProjectLevelRate { id, projectId, level, rate }` met `@@unique([projectId, level])`.

Beide tarieftabellen gebruiken `Decimal @db.Decimal(10, 2)`, zoals de bestaande tariefvelden, en
`onDelete: Cascade` op hun bovenliggende record.

Verwijderingen: `ActivityType.defaultRate`, het model `ProjectActivityRate` inclusief de relatie
`Project.activityRates` en `ActivityType.projectRates`, en `Project.defaultHourlyRate`.

Een tarief moet positief zijn. Nul is niet op te slaan, zodat "geen tarief" en "gratis" nooit
door elkaar kunnen lopen.

## Deel 2: tariefresolutie

Nieuw bestand `src/lib/rates.ts` met één functie die overal de enige bron wordt:

```ts
export type LevelRate = { level: WorkLevel; rate: number | string };

export function resolveHourRate(entry: {
  rateOverride?: number | string | null;
  workLevel?: WorkLevel | null;
  user?: { workLevel?: WorkLevel | null } | null;
  project?: {
    levelRates?: LevelRate[];
    customer?: { levelRates?: LevelRate[] } | null;
  } | null;
}): number | null;
```

De tarieven komen mee op de entry zelf, via de Prisma-`include`, in plaats van als losse
lookup-tabellen. Dat past bij hoe de rest van deze codebase werkt en scheelt een tweede
plumbing-laag. De keerzijde is dat elke query die een tarief moet tonen de rates moet
meeladen — dat betekent `project: { include: { levelRates: true, customer: { include: {
levelRates: true } } } }` toevoegen aan de urenqueries in `GET /api/reports`, `GET /api/time`,
en de serverpagina's van `/time` en `/reports`. Een vergeten `include` levert `null` op en dus
een zichtbare "Geen tarief"-badge, geen stil verkeerd bedrag.

De keten:

1. `entry.rateOverride` als die gezet is.
2. Het `ProjectLevelRate` van `entry.projectId` voor het geldende niveau.
3. Het `CustomerLevelRate` van de klant van dat project voor het geldende niveau.
4. Anders `null`.

Het geldende niveau is `entry.workLevel ?? entry.user?.workLevel ?? null`. Is het `null`, dan
levert de functie meteen `null` — er valt zonder niveau geen tarief te bepalen.

De tweede helft van die uitdrukking is de overgangsregel, zie "De overgang". Een project zonder
klant kan alleen een projecttarief hebben; ontbreekt dat, dan is er geen tarief.

**`null` betekent onbepaalbaar, niet nul.** De huidige code rekent overal met `?? 0` en kan die
twee daarom niet onderscheiden. Aanroepers van `resolveHourRate` tonen `null` als "Geen tarief"
en tellen zo'n regel niet mee in de omzet.

Deze functie vervangt de drie uiteenlopende plekken uit de uitgangssituatie. Daarna kan het
urenformulier per definitie geen ander bedrag meer tonen dan wat gefactureerd wordt.

## Deel 3: invoer

**Medewerker** — `src/components/users/users-client.tsx` heeft een aanmaak- en een
bewerkformulier met "uren per week". Daarnaast komt een keuzelijst **Werkniveau** met de vier
niveaus plus een lege optie voor "nog niet ingesteld". De tabel krijgt een kolom Werkniveau,
zodat zichtbaar is wie er nog geen heeft — dat is met deze keten immers direct niet-factureerbare
tijd.

**Klant en project** — dezelfde kaart op beide plekken: vier regels, één per niveau, met een
prijsveld. Leeg betekent niet ingesteld. Op het project staat erbij dat een leeg veld terugvalt
op de klant. De waarden gaan mee in de bestaande PUT van klant respectievelijk project, als
`levelRates: { level, rate }[]`, en worden server-side in één transactie weggeschreven: upsert
voor elke ingevulde regel, delete voor elke leeggemaakte. Er komen dus geen aparte routes, in
tegenstelling tot de huidige projecttarieven.

**Markering** — in het rapportoverzicht krijgt een urenregel zonder bepaalbaar tarief een badge
"Geen tarief" op de plek van het bedrag, en telt niet mee in de omzet. Bij het opstellen van een
factuur worden zulke regels ook gemarkeerd en kunnen ze niet op een factuurregel worden gezet;
eerst moet het tarief ingevuld worden of een handmatig tarief op de regel gezet.

## De overgang

Bestaande urenregels hebben `workLevel = null` en houden dat, ook nadat alle medewerkers een
niveau hebben gekregen — de momentopname heeft voor die regels nooit bestaan. Zonder maatregel
zou elk historisch, nog niet gefactureerd uur permanent "Geen tarief" zijn.

Daarom valt de resolutie bij een lege `workLevel` terug op het **huidige** niveau van de
eigenaar. Nieuwe regels zijn bevroren zoals afgesproken; alleen regels van vóór deze wijziging
leunen op het actuele niveau. Dat lost de overgang op zonder migratiescript, en dooft vanzelf uit
naarmate die regels gefactureerd raken.

De migratie voegt de enum, de twee kolommen en de twee tabellen toe en laat
`ActivityType.defaultRate`, `ProjectActivityRate` en `Project.defaultHourlyRate` vallen. Dat is
onomkeerbaar: die tarieven zijn daarna weg. Alles wat al gefactureerd is behoudt zijn bedrag.

## Testen

Volgens het patroon van de repo: pure functies in `src/lib/` met vitest ernaast, geen component-
of API-tests.

`src/lib/rates.test.ts`:

- `rateOverride` wint van elk niveautarief.
- Projecttarief wint van klanttarief voor hetzelfde niveau.
- Klanttarief wordt gebruikt als het project voor dat niveau niets heeft.
- `null` als noch project noch klant iets heeft voor dat niveau.
- `null` als er geen niveau te bepalen is: regel zonder `workLevel` en eigenaar zonder
  `workLevel`.
- De overgangsregel: regel zonder `workLevel` pakt het huidige niveau van de eigenaar.
- Een project zonder klant valt niet terug op een klanttarief.
- Een tarief voor een ánder niveau dan dat van de regel wordt niet gebruikt.
- Ontbrekende `levelRates` op de meegeladen relatie levert `null`, niet een crash — dat is het
  vangnet voor een vergeten Prisma-`include`.

`src/lib/report-totals.test.ts` uitbreiden: een regel waarvoor `resolveHourRate` `null` geeft
telt niet mee in de omzet en niet in de omzet per medewerker — dus niet als 0 en niet als
overgeslagen fout.

Handmatig na te lopen bij oplevering:

- Een medewerker een niveau geven, tarieven bij een klant zetten, uren boeken, en controleren dat
  het urenformulier, het rapport en de factuur hetzelfde bedrag tonen.
- Een projecttarief voor hetzelfde niveau invullen en zien dat het het klanttarief overruled.
- Het projecttarief weer leegmaken en zien dat het terugvalt op de klant.
- Een medewerker zonder niveau laten boeken en de markering "Geen tarief" krijgen in plaats van
  € 0,00, in zowel het rapport als de factuuropbouw.
- Controleren dat een bestaande, al gefactureerde regel zijn oorspronkelijke bedrag houdt.

## Buiten scope

- Tarieven per niveau per activiteit (de matrix). Het niveau vervangt de activiteit als
  tariefbron; ze combineren niet.
- Historische tarieftabellen met geldigheidsdatums. Een tariefwijziging bij een klant werkt door
  op alle nog niet gefactureerde regels.
- Kilometertarieven en onkosten.
- Het bevriezen van het uitgerekende tarief op de urenregel.
