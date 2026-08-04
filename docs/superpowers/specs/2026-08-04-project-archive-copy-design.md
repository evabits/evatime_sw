# Ontwerp: projecten archiveren en kopiëren

Datum: 2026-08-04
Aanleiding: gebruikersfeedback. Projecten moeten makkelijker te archiveren zijn en te kopiëren,
waarbij een kopie alle instellingen meeneemt en de naam niet mag botsen met een bestaand project.

Dit is traject 3 van drie, en het laatste. Traject 1 (activiteiten eruit, factureerbaarheid naar
het project) en traject 2 (alleen deelnemers kunnen op een project boeken) zijn af en gemerged,
maar staan **nog niet in productie**. Kopiëren moest als laatste omdat het de instellingen uit
beide voorgaande trajecten moet meenemen.

## Uitgangssituatie

Een project heeft vandaag twee losse begrippen die allebei "dit project is klaar" kunnen
betekenen:

- `status: ProjectStatus` — `CONCEPT | ACTIVE | INACTIVE | COMPLETED`, alleen te wijzigen in het
  bewerkscherm.
- `archivedAt: DateTime?` — een aparte zachte verwijdering, gezet via `DELETE /api/projects/[id]`
  en teruggedraaid via `PATCH`.

Ze staan volledig los van elkaar: "Afgerond" archiveert niet, en archiveren raakt de status niet.

Archiveren kost vandaag twee handelingen (prullenbak-icoon, bevestigen) en kan maar één project
tegelijk. Terugzetten vereist eerst het aanvinken van "Toon gearchiveerd".

Kopiëren bestaat nergens: `kopieer`, `duplicate`, `clone` en `copyProject` komen in de hele
codebase niet voor.

`Project.name` heeft geen enkele uniciteitseis. Er kunnen vandaag dubbele namen bestaan; feitelijk
zijn er geen. Gemeten op productie: **25 projecten, 3 gearchiveerd, 0 dubbele namen**
(hoofdletterongevoelig en getrimd vergeleken).

`DELETE` en `PATCH` op `/api/projects/[id]` toetsen alleen dat er een sessie is. De `PUT` ernaast
is wel `isAdmin`-gated. Dezelfde omissie zit in `/api/customers/[id]`.

Archiveren raakt facturatie niet: `GET /api/time`, `/api/km` en `/api/expenses` filteren niet op
`archivedAt`, dus openstaande uren van een gearchiveerd project blijven factureerbaar.

## Beslissingen

| Onderwerp | Keuze |
|---|---|
| Wat is er omslachtig aan archiveren | Eén voor één is te traag. Bulk archiveren lost het op. |
| Bereik van de naamregel | Uniek in de **hele app**, niet per klant. |
| Hoofdletters en spaties | Hoofdletterongevoelig, en de naam wordt getrimd. |
| Gearchiveerde projecten | Blijven hun naam bezetten. Geen uitzondering. |
| Wat kopiëren doet | Opent het bestaande formulier voorgevuld. Pas bij opslaan ontstaat een project. |
| Bulk terugzetten | Niet. Terugzetten blijft één voor één. |
| `status` en `archivedAt` samenvoegen | Buiten scope. |

## Deel 1: naamuniciteit

### Datamodel

```prisma
model Project {
  // ...
  name String @unique
}
```

Meer niet. Met 0 dubbele namen op 25 projecten kan deze eis erin zonder opruimwerk vooraf.

### De controle in de applicatie

De database-eis is hoofdlettergevoelig, de eis van de gebruiker niet. Daarom ligt de echte
controle in de applicatie en dient `@unique` als vangnet.

- De zod-schema's van `POST /api/projects` en `PUT /api/projects/[id]` krijgen
  `name: z.string().trim().min(1)`, zodat spaties aan de randen nooit een tweede "Onderhoud"
  opleveren.
- Beide routes doen één `findFirst` met `{ name: { equals: name, mode: "insensitive" } }`, bij de
  `PUT` met `id: { not: id }` zodat een project niet met zichzelf botst.
- Gearchiveerde projecten worden **niet** uitgesloten: ze bezetten hun naam.

Bij een botsing: status 400 met `{ error: "Er bestaat al een project met deze naam" }`.

Een `P2002` van de database krijgt dezelfde melding. Die treedt alleen op wanneer twee mensen
tegelijk dezelfde naam opslaan, of wanneer twee namen alleen in hoofdletters verschillen zonder
dat de applicatiecontrole ze zag — het vangnet moet er zijn, maar hoort in de praktijk niet af te
gaan.

### Waar de controle woont

Als `projectNameTakenError(name: string, exceptId?: string): Promise<NextResponse | null>` in
`src/lib/api.ts`, naast `projectMembershipError` uit traject 2. Dezelfde vorm: geeft `null`
wanneer het mag, en anders een kant-en-klare `NextResponse`. Zo kunnen de twee routes niet uit
elkaar lopen.

`src/lib/api.ts` importeert al Prisma; alle 57 gebruikers zijn routebestanden onder
`src/app/api/`, dus dat blijft veilig.

### Het gevolg voor het conceptproject-knopje

"+ Nieuw conceptproject" in het urenformulier gaat door dezelfde `POST /api/projects`. Een
medewerker die een conceptproject aanmaakt met een naam die al bestaat, krijgt voortaan een
weigering.

Dat is de bedoeling, maar die melding moet daar zichtbaar worden: dat flowtje toont vandaag alleen
een generieke fout. De weigeringstekst van de server moet in het urenformulier getoond worden,
zodat de medewerker begrijpt dat hij een andere naam moet kiezen.

## Deel 2: kopiëren

### Wat de gebruiker ziet

Een derde rijactie op `/projects`, naast bewerken en archiveren. Klikken opent hetzelfde
dialoogvenster als bewerken, maar in aanmaakstand: opslaan doet een `POST`, geen `PUT`.

Voorgevuld met alles van het origineel:

| Veld | Meekopiëren |
|---|---|
| Klant | ja |
| Omschrijving | ja |
| Tags | ja |
| Status | ja, dezelfde als het origineel |
| Standaard km-tarief | ja |
| Factureerbaar | ja |
| Tarieven per werkniveau | ja |
| Deelnemers | ja |
| Naam | `<naam> (kopie)` |

Wat níét meekomt: uren, ritten, uitgaven, facturen en km-sjablonen. Een kopie is een leeg project
met dezelfde instellingen.

Er ontstaat pas een project wanneer de gebruiker opslaat. Per ongeluk klikken maakt niets aan.

### Het risico: de twee `*Known`-vlaggen

`levelRatesKnown` en `memberIdsKnown` bestaan omdat een formulier dat een veld weglaat de
bestaande waarden moet laten staan in plaats van ze te wissen. Bij het openen van een kopie zijn
beide wél bekend — de projectpagina laadt `levelRates` en `members` mee — dus de kopieeractie moet
ze expliciet op `true` zetten.

Gebeurt dat niet, dan stuurt het formulier de velden niet mee en levert de kopie stilzwijgend een
project op zonder tarieven en zonder deelnemers. Dat is precies de fout die deze codebase al twee
keer heeft gemaakt. Het is de belangrijkste acceptatietest van dit deel.

### De klant van een kopie

Het projectformulier vult zijn klantenlijst met uitsluitend niet-gearchiveerde klanten. Hoort het
origineel bij een inmiddels gearchiveerde klant, dan staat die klant niet tussen de opties en
blijft het veld leeg — het formulier eist een klant, dus de gebruiker moet er dan zelf een kiezen.
Dat is het juiste gedrag: een nieuw project onder een afgesloten klant hangen is vrijwel nooit de
bedoeling. Het mag alleen niet stil gebeuren, dus het veld toont zichtbaar leeg en de bestaande
verplicht-melding doet de rest.

### Gearchiveerde projecten

Krijgen geen kopieerknop. Een gearchiveerde rij toont vandaag alleen "terugzetten" en is niet te
bewerken; dat blijft zo. Eerst terugzetten, dan kopiëren.

## Deel 3: bulk archiveren

### Wat de gebruiker ziet

Een selectiekolom op de projectentabel, met een selecteer-alles in de kop dat alleen de zichtbare
rijen aanvinkt — de tabel wordt al client-side gefilterd op status en op "Zonder klant", en een
knop die meer archiveert dan je ziet is een valstrik.

Zodra er iets aangevinkt is verschijnt **Archiveer geselecteerde (N)**, met een bevestiging die het
aantal noemt.

Gearchiveerde rijen krijgen geen selectievakje.

### Server

`POST /api/projects/bulk-archive` met `{ ids: string[] }`, gevalideerd met zod
(`z.array(z.string().min(1)).min(1).max(500)`, dezelfde vorm als `/api/entries/bulk`).

Eén `updateMany` op `{ id: { in: ids }, archivedAt: null }` met `archivedAt: new Date()`. Eén
query, dus alles of niets, en al gearchiveerde projecten worden vanzelf overgeslagen zonder
foutmelding. De route geeft `{ count }` terug, zoals de bestaande bulkroute.

Admin-only.

### Terugzetten blijft één voor één

Je archiveert in batches, je zet zelden iets terug. Komt dat toch vaak voor, dan is het later drie
regels erbij.

## Deel 4: het rolgat dichten

Vier routes missen de `isAdmin`-controle die hun `PUT`-buurman wel heeft. Elke ingelogde
medewerker kan vandaag elk project en elke klant archiveren of terugzetten.

- `DELETE /api/projects/[id]`
- `PATCH /api/projects/[id]`
- `DELETE /api/customers/[id]`
- `PATCH /api/customers/[id]`

Vier regels, dezelfde regel: `if (!isAdmin(role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 })`.

De klantroutes vallen strikt genomen buiten dit traject, maar het is hetzelfde gat en dezelfde
regel code. Eén ervan dichten en de andere open laten is slechter dan beide meenemen.

De nieuwe bulkroute is vanaf het begin admin-only.

## Testen

Volgens het patroon van de repo: pure functies in `src/lib/` met vitest, geen component- of
API-tests. Dit traject levert er nauwelijks op — de naamcontrole is een query, geen berekening, en
de bulkarchivering is één `updateMany`. De dekking zit hier in het handmatige lijstje, en dat is
een bewuste constatering, geen omissie.

Handmatig na te lopen:

- Een project hernoemen naar de naam van een ander project → weigering met
  `Er bestaat al een project met deze naam`.
- Diezelfde naam met andere hoofdletters en met spaties eromheen → dezelfde weigering.
- Een project opslaan zonder de naam te wijzigen → slaat gewoon op, botst niet met zichzelf.
- Een nieuw project aanmaken met de naam van een **gearchiveerd** project → weigering.
- Via "+ Nieuw conceptproject" in het urenformulier een bestaande naam gebruiken → de weigering is
  daar zichtbaar en begrijpelijk.
- Een project met tarieven en deelnemers kopiëren, direct opslaan, en op de nieuwe rij
  controleren dat het aantal deelnemers en de tarieven identiek zijn aan het origineel.
- Een kopie maken en de naam niet wijzigen → `(kopie)` is uniek, dus slaat op; nog een kopie van
  hetzelfde project zonder hernoemen → weigering.
- Een kopie annuleren → er is geen project aangemaakt.
- Drie projecten aanvinken en bulk archiveren → alle drie verdwijnen uit de lijst, teller klopt.
- Selecteer-alles aanvinken terwijl er op status gefilterd is → alleen de zichtbare rijen worden
  aangevinkt.
- Een al gearchiveerd project kan niet aangevinkt worden.
- Als niet-admin proberen te archiveren via de API → 403.
- Een gearchiveerd project met openstaande uren: die uren staan nog steeds op een nieuwe factuur.

## Uitrol

Eén stap, niets destructiefs, geen backfill:

1. `prisma migrate diff` draaien en de volledige lijst lezen — er hoort alleen een uniciteitseis
   op `Project.name` bij te komen.
2. `npm run db:push`.
3. Deployen.

`db:push` faalt wanneer er onverwacht toch dubbele namen zijn. Dat is een nette uitkomst: dan
eerst hernoemen, daarna opnieuw.

**Dit traject gaat pas na traject 1 en 2 naar productie.** Die staan er nog niet op, en hun
uitrolvolgorde is beschreven in hun eigen plannen.

## Buiten scope

- `status` en `archivedAt` samenvoegen. Twee begrippen voor bijna hetzelfde blijft verwarrend,
  maar de gebruiker koos het traagheidsprobleem, niet het begripsprobleem.
- Bulk terugzetten.
- Kopiëren van gearchiveerde projecten.
- Klanten kopiëren of bulksgewijs archiveren. Alleen het rolgat van de klantroutes wordt gedicht.
- Uniciteit van klantnamen. Niet gevraagd.
- Meekopiëren van uren, ritten, uitgaven of km-sjablonen.
