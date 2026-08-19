# Projectplanning A — tijdlijn en taken

**Datum:** 19-AUG-2026
**Status:** ontwerp vastgesteld, klaar voor een implementatieplan

## Waarom

Er is nu geen enkel beeld van wanneer een project loopt. Projecten hebben een
status en een archiefdatum, maar geen start, geen eind en geen doorlooptijd.
Een beheerder kan dus niet zien wat er deze maand speelt, wat er aankomt, of
welke projecten elkaar in de weg zitten.

Dit ontwerp levert het eerste van drie deelprojecten:

- **A — tijdlijn en taken** (dit document): projecten en hun taken als balken op
  een tijdlijn, met invoer.
- **B — afhankelijkheden en bewaking**: taken die aan elkaar hangen, pijlen,
  meeschuiven, kringloopdetectie, signaleren van overschrijdingen.
- **C — voortgang en uren**: percentage gereed en geboekte uren per taak.

A is bewust de basis: B en C kunnen er niet zonder, en A is op zichzelf al
bruikbaar. **C raakt het hele team** — uren gaan dan aan een taak hangen, dus
elke medewerker moet bij het boeken een taak kiezen. A en B blijven binnen het
beheerdersscherm. Die volgorde is een bewuste keuze, geen gevolg van techniek.

## Reikwijdte

**Wel:**

- Geplande start- en einddatum op een project.
- Een nieuw taakmodel onder een project: naam, start, eind, volgorde.
- Een beheerdersscherm `/planning` met de tijdlijn.
- Taken en projectdatums aanmaken, wijzigen, verwijderen en ordenen.
- Taken laten meeverhuizen bij het samenvoegen van projecten.

**Niet, en waarom:**

| Buiten scope | Reden |
|---|---|
| Balken verslepen | Muis-naar-datum, vastklikken, aanraakbediening en terugdraaien bij een mislukte opslag zijn samen meer werk dan de rest van A. Later toe te voegen zonder het datamodel te raken. |
| Afhankelijkheden tussen taken | Deelproject B. |
| Percentage gereed, geraamde en geboekte uren | Deelproject C. |
| Mijlpalen, kleur per taak, toegewezen medewerker | Niet gevraagd. Elk later toe te voegen zonder dit model om te gooien. |
| Een aparte mobiele weergave | Een Gantt op een telefoon is een compromis dat niemand wil. De tijdlijn scrollt horizontaal en dat is genoeg. |
| Een Gantt-bibliotheek | Zie "Afwegingen". |

## Afwegingen

### Zelf tekenen in plaats van een bibliotheek

Overwogen: `frappe-gantt` en `gantt-task-react`. Beide leveren balken, pijlen en
verslepen kant-en-klaar. Afgevallen omdat het onderhoudsarme pakketten zijn met
eigen ideeën over opmaak en donkere modus, die met React 19 botsen, en omdat
deelproject B eigen planningsregels vraagt — dan duw je tegen hun motor aan en
heb je én een afhankelijkheid én je eigen logica.

Zelf tekenen kost hier weinig: het is een CSS-grid met percentueel geplaatste
balken, en het rekenwerk is een pure functie die in `src/lib` past en te testen
is zoals al het andere in dit project.

### Projectbalk: eigen datums, anders afgeleid

Drie mogelijkheden gewogen:

1. Altijd afgeleid uit de taken — één waarheid, maar je kunt niets plannen
   voordat je taken hebt bedacht.
2. Altijd eigen datums — voorspelbaar, maar twee dingen bijhouden die uit de
   pas kunnen lopen zonder dat iets dat merkt.
3. **Gekozen:** eigen datums als je ze invult, anders afgeleid uit de taken.

Drie geeft de vrijheid om grof te plannen en later te verfijnen. De prijs is dat
projectdatums en taken kunnen tegenspreken; zie "Randgevallen" voor wat er dan
gebeurt.

## Datamodel

### `Project` — twee velden erbij

```prisma
plannedStart DateTime? @db.Date
plannedEnd   DateTime? @db.Date
tasks        ProjectTask[]
```

Allebei optioneel, allebei een datum zonder tijdstip. Additief, dus veilig vóór
de codedeploy naar productie te pushen.

### `ProjectTask` — nieuw

```prisma
model ProjectTask {
  id        String   @id @default(cuid())
  projectId String
  project   Project  @relation(fields: [projectId], references: [id], onDelete: Cascade)
  name      String
  startDate DateTime @db.Date
  endDate   DateTime @db.Date
  sortOrder Int      @default(0)
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  @@index([projectId])
}
```

Vier keuzes die vastliggen:

- **Datums zijn verplicht.** Een taak zonder datums kun je niet tekenen; dat is
  een to-do en hoort niet in dit scherm.
- **De einddatum is inclusief.** 01-SEP-2026 t/m 01-SEP-2026 is één dag.
- **`sortOrder` bepaalt de volgorde**, niet het alfabet en niet de aanmaaktijd.
  Postgres geeft alle rijen van één transactie dezelfde `createdAt`, dus daarop
  sorteren zegt niets — hetzelfde probleem als bij `InvoiceLine`.
- **`onDelete: Cascade`**: een verwijderd project neemt zijn taken mee.

### Samenvoegen van projecten

`POST /api/projects/[id]/merge` verwijdert het bronproject en verhuist uren,
ritten, km-sjablonen en deelnemers naar het doel; tarieven en tags verdwijnen
bewust. **Taken horen bij de eerste groep en moeten meeverhuizen**, binnen
dezelfde transactie, vóór het verwijderen:

```ts
await tx.projectTask.updateMany({ where: { projectId: id }, data: { projectId: targetId } });
```

Zonder deze regel verdwijnen taken stilzwijgend via de cascade. De volgorde
binnen het doelproject is daarna niet gegarandeerd uniek — twee reeksen
`sortOrder` lopen door elkaar. Dat is aanvaardbaar: de taken staan er allemaal,
en jij kunt ze met de pijltjes herschikken. Het alternatief, hernummeren tijdens
de merge, voegt werk toe aan een transactie die al krap zit.

## Scherm

Nieuw menu-item **Planning → Tijdlijn** op `/planning`, alleen voor beheerders.

```
                    │ SEP 2026        │ OKT 2026        │ NOV 2026
                    │ 36  37  38  39  │ 40  41  42  43  │ 44  45  46
─────────────────────────────────────┊──────────────────────────────
ACQUAINT B.V.                        ┊
  Datalogger        │   ███████████████████            ┊
    ontwerp         │   ▓▓▓▓▓▓▓                        ┊
    prototype       │          ▓▓▓▓▓▓▓▓▓▓▓             ┊
  Stackdebugger     │           ████████████████████████████
                                     ┊
MEDUSARADIOMETRICS                   ┊
  LVRM JUN26        │ ██████████████████████           ┊
                                     ┊
                                  vandaag
```

- Links een vaste naamkolom die blijft staan bij horizontaal scrollen; rechts de
  tijdlijn.
- Klanten als kopregel, daaronder hun projecten, gesorteerd zoals in
  `src/lib/project-picker.ts`: op klantnaam, dan projectnaam, Nederlands
  vergeleken. Projecten zonder klant achteraan.
- Een project klap je open om zijn taken te zien; dichtgeklapt zie je alleen de
  projectbalk. De stand is niet blijvend — na verversen staat alles weer dicht.
- Een verticale streep markeert vandaag.
- Hover op een balk toont de volledige naam met de datums erbij, in
  `DD-MMM-YYYY`, via de bestaande `formatDate`.
- Drie zoomstanden die alleen de totale breedte van de tijdlijn veranderen,
  niet de plaatsingslogica. Als startwaarden, te verfijnen zodra het in gebruik
  is: weken 24 px per dag, maanden 6 px per dag, kwartalen 2 px per dag. De
  kopregel volgt de stand — bij weken maanden met weeknummers eronder, bij
  maanden alleen maanden, bij kwartalen kwartalen met maanden eronder.

**Welke projecten:** `archivedAt = null` en `status = ACTIVE`. Projecten met
status `CONCEPT` vallen erbuiten; dat is bewust en met één voorwaarde te
veranderen als dat later blijkt te knellen.

**Onderaan "Nog niet gepland":** de actieve projecten zonder eigen datums én
zonder taken, met per project een knop om ze meteen in te plannen. Zonder die
lijst verdwijnen ze uit beeld.

## Bewerken

Alles via vensters met datumvelden, zoals elders in de app:

- **Klik op een projectnaam** → geplande start en eind invullen, of leegmaken
  zodat de balk de taken weer volgt.
- **"+ Taak" bij een project** → naam, start, eind. De nieuwe taak krijgt de
  hoogste `sortOrder` binnen dat project en komt dus onderaan.
- **Klik op een taak** → wijzigen of verwijderen. Verwijderen vraagt om
  bevestiging.
- **Pijltjes omhoog en omlaag** per taak voor de volgorde.

## Koppelvlakken

### Rechten

`src/lib/roles.ts` schrijft voor dat elke nieuwe mogelijkheid daar begint. Er
komt een `managePlanning`, alleen `true` voor `ADMIN`, met een
`canManagePlanning(role)` die zowel het menu-item als elke route bewaakt. De
routes weigeren het ook als de UI het al verbergt.

### Routes

| Route | Doel |
|---|---|
| `PUT /api/projects/[id]` (bestaand) | Twee optionele velden erbij: `plannedStart` en `plannedEnd`. Geen aparte route voor twee kolommen. |
| `POST /api/projects/[id]/tasks` | Taak aanmaken. |
| `PUT /api/project-tasks/[id]` | Taak wijzigen. |
| `DELETE /api/project-tasks/[id]` | Taak verwijderen. |
| `PATCH /api/project-tasks/[id]` | `{ move: "up" \| "down" }` — wisselt de taak met zijn buur binnen één transactie. |

De pagina `/planning` wordt server-gerenderd, net als de rapportenpagina: de
pagina haalt de projecten met hun taken op en geeft ze door aan het
tijdlijncomponent. Na een wijziging ververst het scherm zichzelf met
`router.refresh()`. **Er is geen ophaalroute voor de tijdlijn.**

## Pure functies

Alles wat rekent of oordeelt komt in `src/lib/planning.ts`, met tests in
`src/lib/planning.test.ts` — de conventie van dit project.

| Functie | Verantwoordelijkheid |
|---|---|
| `barGeometry(start, eind, venster)` | Plek en breedte als percentage van het venster. Einddatum inclusief; een taak van één dag heeft breedte. |
| `timelineWindow(projecten, vandaag)` | Vroegste tot laatste datum die getekend wordt — **projectdatums én taakdatums**, want een taak mag buiten zijn project vallen en moet toch zichtbaar zijn — met zeven dagen marge aan beide kanten. Is er niets gepland, dan een venster van dertig dagen vóór tot negentig dagen ná vandaag. |
| `projectBar(project)` | Eigen datums, anders afgeleid uit de taken, anders `null` — dat laatste is "nog niet gepland". |
| `validateDateRange(start, eind)` | De weigeringen hieronder, als leesbare Nederlandse melding of `null`. |
| `swapOrder(taken, id, richting)` | De nieuwe `sortOrder`-paren, ook aan de randen van de lijst. |

## Randgevallen

| Geval | Gedrag |
|---|---|
| Einddatum vóór startdatum | Geweigerd op de server, met een leesbare melding. Geldt voor taken én projectdatums. |
| Alleen een startdatum op een project | Geweigerd. Twee of geen; één datum levert geen balk op. |
| Taak buiten de projectdatums | **Toegestaan**, en de projectbalk rekt niet mee. Dat is de zichtbare waarschuwing dat de planning niet klopt. Verbergen zou erger zijn. In B gaat dit oplichten. |
| Project met eigen datums maar zonder taken | Balk, geen uitklap. |
| Project zonder eigen datums en zonder taken | Niet op de tijdlijn, wel in "Nog niet gepland". |
| Alle projecten ongepland | De tijdlijn toont het lege venster rond vandaag uit `timelineWindow` in plaats van een fout. |
| Taak loopt buiten het venster van zijn project | Het venster van de tijdlijn rekt mee, zodat de taak zichtbaar blijft. |
| Taak omhoog vanaf de eerste plek | Geen wijziging, geen fout. Idem omlaag vanaf de laatste. |
| Project samengevoegd | Taken verhuizen mee naar het doel. |
| Project verwijderd | Taken verdwijnen mee via de cascade. |

## Uitrol

De schemawijziging is additief — twee nullable kolommen en een nieuwe tabel —
dus in de gebruikelijke volgorde: `prisma migrate diff` lezen, `db:push` naar de
productiedatabase, en pas daarna de code deployen. De draaiende code merkt niets
van de nieuwe tabel.

## Klaar wanneer

- Een beheerder ziet op `/planning` de actieve projecten per klant als balken op
  een tijdlijn, met een streep op vandaag en drie zoomstanden.
- Hij kan een project van datums voorzien, taken toevoegen, wijzigen,
  verwijderen en ordenen, en ziet het resultaat meteen.
- Projecten zonder planning staan onderaan in plaats van nergens.
- Niemand anders dan een beheerder komt bij het scherm of de routes.
- De pure functies zijn gedekt door tests, inclusief de randgevallen hierboven,
  en de merge-route heeft een test die bewijst dat taken meeverhuizen.
