# Herhaalprojecten met automatische conceptfactuur

**Datum:** 20-AUG-2026
**Status:** ontwerp vastgesteld, klaar voor een implementatieplan

## Waarom

Terugkerend productie- en testwerk wordt nu volledig met de hand gefactureerd.
Facturen `2026-0007` en `2026-0008` zijn letterlijk identiek: klant Zonneplan,
onderwerp "Factuur H3X testen", één regel `120 × €20,00 = €2.400,00` met de
omschrijving "Testen H3X batterij omvormers". Twee keer hetzelfde overtypen, met
alle kans op een verkeerd aantal.

Dat het werk zich herhaalt is trouwens al zichtbaar in de projectnamen:
`IOmodule (Prod. JUN26 50x)`, `Carrier Small Boards (prodBatch 50x AUG26)`,
`ACQstacks 10x JUL26`, `MedusaBoard (Productie-BatchJUL26)`. Er wordt al een
batchadministratie gevoerd, alleen zonder dat de app het weet.

Dit ontwerp legt dat vast: één sjabloon per soort werk, per batch een project
eruit, en bij het voltooien een conceptfactuur die op een beheerder wacht.

## De casus die het moet dekken

**H3X testen** (en `SAJ - EVO` op dezelfde manier):

- Klant Zonneplan B.V., gefactureerd **per stuk** à €20,00.
- Een batch is doorgaans 120 exemplaren.
- Op de factuur staat hoeveel er zijn goedgekeurd, hoeveel afgekeurd, en het
  totaal. **Het totaal is wat er gefactureerd wordt** — alles is immers getest.
  Bij 118 goedgekeurd en 2 afgekeurd is de factuur dus 120 × €20,00.
- Het project staat op **niet-factureerbaar** en heeft 56 uren geboekt: die uren
  zijn interne kosten en staan los van de factuur.

## Reikwijdte

**Wel:**

- Een sjabloon per soort herhaalwerk, met klant, tarief, omschrijving en onderwerp.
- Per batch een project uit dat sjabloon.
- Voltooien via een bevestigingsvenster, met een conceptfactuur als resultaat.
- Goed- en afkeur bijhouden en op de factuur vermelden.
- Een dashboardtegel die telt hoeveel concepten op goedkeuring wachten.

**Niet, en waarom:**

| Buiten scope | Reden |
|---|---|
| Factureren op uren (de derde manier) | Dat moet de geboekte uren verzamelen en beprijzen — het hele bestaande factuurscherm nog eens. Het sjabloon krijgt het veld wel, zodat het later past zonder het model om te gooien. |
| Automatisch verzenden | Een concept wacht altijd op een beheerder. Dat is het hele punt van de goedkeuringsstap. |
| Een herinnering als een concept blijft liggen | Niet gevraagd. De tegel blijft staan zolang er iets wacht. |
| Uren van de batch op de factuur | Bij H3X staan de uren bewust los. Wie dat wél wil, wil de derde manier van factureren. |

## Afwegingen

### Elke batch is een nieuw project uit een sjabloon

Het alternatief was één doorlopend project met opdrachten eronder. Dat houdt de
projectenlijst korter, maar dan worden uren op het project geboekt en niet op de
batch, en is achteraf niet te zien welke uren bij welke batch hoorden.

Een project per batch sluit bovendien aan op wat er nu al met de hand gebeurt,
en geeft elke batch zijn eigen uren, opleverdatum en factuur.

### De aantallen worden bevestigd, niet aangenomen

Het voltooien gaat via een venster dat het aantal en de opleverdatum toont en
laat bijstellen, met daaronder wat de factuur wordt. Dat is het ene moment dat
iemand er met aandacht naar kijkt; een batch van 120 die er 118 werden komt dan
niet verkeerd op de factuur.

### Het gefactureerde aantal is afgeleid, niet ingevoerd

Het venster vraagt om **goedgekeurd** en **afgekeurd**; het totaal volgt daaruit
en is wat er gefactureerd wordt. Zo kunnen de drie getallen niet uit de pas
lopen — wat bij drie losse invoervelden vroeg of laat gebeurt.

### De aantallen staan in de inleiding, niet in de regelomschrijving

Keuze van de gebruiker. De inleidende zin vertelt het verhaal — wat er getest
is, wat eruit kwam, wanneer het is opgeleverd — en de regel houdt het totaal met
het bedrag. Het inleidingsveld op de factuur bestaat al.

De prijs ervan: past iemand de inleiding later aan, dan kunnen de aantallen
verdwijnen. Dat is aanvaard; het is een concept dat toch nagelopen wordt.

### Een dashboardtegel en geen e-mail

Een tegel werkt altijd, ook als er iets met de mailkoppeling is — en dat is geen
theorie: het verzenden van facturen heeft in deze app weken stukgestaan op een
token zonder dat iemand het merkte. Een gemist signaal is erger dan een signaal
dat je moet ophalen.

## Datamodel

### `RecurringTemplate` — nieuw

```prisma
model RecurringTemplate {
  id              String        @id @default(cuid())
  name            String        // "H3X testen"
  customerId      String
  customer        Customer      @relation(fields: [customerId], references: [id])
  billing         BillingMode   @default(PER_UNIT)
  /// Prijs per stuk, of het vaste bedrag bij FIXED.
  unitPrice       Decimal?      @db.Decimal(10, 2)
  /// Voorgesteld aantal bij een nieuwe batch. Voor H3X: 120.
  defaultQuantity Decimal?      @db.Decimal(10, 2)
  /// De omschrijving van de factuurregel: "Testen H3X batterij omvormers".
  lineDescription String
  /// Het onderwerp van de factuur: "Factuur H3X testen".
  invoiceSubject  String?
  /// Testwerk telt goedkeur en afkeur; een vast bedrag niet.
  tracksQuality   Boolean       @default(false)
  archivedAt      DateTime?
  createdAt       DateTime      @default(now())
  updatedAt       DateTime      @updatedAt
  projects        Project[]
}

enum BillingMode {
  PER_UNIT
  FIXED
  /// Nog niet gebouwd; staat er zodat de derde manier later past.
  HOURS
}
```

### `Project` — vier velden erbij

```prisma
  /// Uit welk sjabloon deze batch komt. Leeg voor een gewoon project.
  templateId      String?
  template        RecurringTemplate? @relation(fields: [templateId], references: [id])
  /// Het gefactureerde aantal. Altijd gevuld bij een voltooide batch, ook als
  /// er geen goed- en afkeur wordt bijgehouden — dit is wat op de factuur komt.
  quantity        Decimal?      @db.Decimal(10, 2)
  /// De uitsplitsing, alleen bij testwerk. Samen zijn ze gelijk aan quantity;
  /// de route rekent quantity eruit en dwingt dat af, zodat de drie getallen
  /// niet uit de pas kunnen lopen.
  approvedCount   Decimal?      @db.Decimal(10, 2)
  rejectedCount   Decimal?      @db.Decimal(10, 2)
  deliveredAt     DateTime?     @db.Date
  /// De conceptfactuur die uit deze batch is voortgekomen. Uniek: één batch
  /// levert er hoogstens één op. Prisma eist voor deze een-op-een-relatie een
  /// tegenveld op Invoice — `batch Project?` — dat verder nergens gelezen wordt.
  generatedInvoiceId String?    @unique
  generatedInvoice   Invoice?   @relation(fields: [generatedInvoiceId], references: [id])
```

Geen aparte batchtabel: een batch **is** een project, en een tweede tabel ernaast
zou uit de pas kunnen lopen met het project waar hij bij hoort. De velden zijn
nullable en alleen gevuld bij een batch.

`generatedInvoiceId` is uniek: één batch levert hoogstens één factuur op.

## Wat er gebeurt bij voltooien

Een beheerder of teamleider drukt op "Voltooien". Het venster toont:

- **goedgekeurd** en **afgekeurd** (bij `tracksQuality`), of alleen een **aantal**;
- de **opleverdatum**, standaard vandaag;
- daaronder wat de factuur wordt: `totaal × tarief = bedrag`.

Bevestigen doet in **één transactie**:

1. het project op `COMPLETED`;
2. aantallen en opleverdatum vastleggen op het project;
3. een factuur aanmaken met status `DRAFT`;
4. die factuur aan het project koppelen.

Klapt er iets uit, dan rolt alles terug — er blijft geen halve factuur achter.

### De factuur

| Onderdeel | Waar het vandaan komt |
|---|---|
| Klant | het sjabloon |
| Onderwerp | `invoiceSubject` van het sjabloon |
| Inleiding | gegenereerde zin met de batchnaam, de opleverdatum en, bij testwerk, de aantallen |
| Regel | één regel, `lineType: OTHER`, aantal = het totaal, prijs = `unitPrice`, omschrijving = `lineDescription` |
| Factuurnummer | via de bestaande `nextInvoiceNumber()` |
| Datums | uitgiftedatum vandaag, vervaldatum volgens de gebruikelijke termijn |
| Opmerkingen | de bestaande standaardtekst over de betalingstermijn |

Voorbeeld van de inleiding bij H3X:

> Hierbij ontvangt u de factuur voor H3X testen AUG26, opgeleverd op
> 20-AUG-2026. Van de 120 geteste exemplaren zijn er 118 goedgekeurd en 2
> afgekeurd.

## Scherm

**Nieuwe pagina "Herhaalprojecten"** onder Beheer, zichtbaar voor beheerders en
teamleiders. Twee blokken:

- **Sjablonen** — alleen voor beheerders. Aanmaken, wijzigen, archiveren, en per
  sjabloon een knop "Nieuwe batch" die een project aanmaakt met een voorgestelde
  naam (`H3X testen AUG26`) die je kunt aanpassen.
- **Lopende batches** — voor beheerders én teamleiders, met per batch een knop
  "Voltooien".

Die tweede plek is nodig omdat een teamleider vandaag **geen enkel recht op
projecten** heeft. Toegang tot het hele projectenscherm zou veel meer opengooien
dan gevraagd; zo ziet hij precies de batches en verder niets.

**Dashboardtegel** naast de bestaande "Nog te factureren": het aantal
conceptfacturen en hun totaalbedrag, met een klik erdoorheen. Alleen voor wie
facturen mag zien.

## Rechten

Twee nieuwe mogelijkheden in `src/lib/roles.ts`, allebei afgedwongen in de routes
en niet alleen in het scherm:

| Recht | ADMIN | FINANCE | TEAMLEAD | EMPLOYEE |
|---|---|---|---|---|
| `manageRecurringTemplates` | ja | nee | nee | nee |
| `completeRecurringBatch` | ja | nee | **ja** | nee |

Een teamleider ziet de conceptfactuur niet; hij rondt het werk af, de beheerder
keurt goed en verstuurt.

## Randgevallen

| Geval | Gedrag |
|---|---|
| Batch al voltooid, of heeft al een factuur | Geweigerd. Wil je opnieuw, gooi dan de conceptfactuur weg en zet de batch terug op actief. |
| Aantal nul of negatief | Geweigerd met een Nederlandse melding. |
| Goedgekeurd én afgekeurd allebei nul | Geweigerd: dan is er niets te factureren. |
| Sjabloon zonder tarief | Een batch starten mag, voltooien niet — de melding zegt dat het tarief eerst ingesteld moet worden. |
| Sjabloon met `billing: HOURS` | Een batch starten mag, voltooien wordt geweigerd met de melding dat die manier nog niet gebouwd is. |
| Sjabloon gearchiveerd | Bestaande batches blijven werken; er kunnen geen nieuwe meer uit. |
| Klant zonder gegevens | Precies zoals bij een handmatige factuur; dit ontwerp verandert daar niets aan. |
| Batch zonder `tracksQuality` | Het venster vraagt één aantal; de inleiding noemt geen goed- en afkeur, en `approvedCount`/`rejectedCount` blijven leeg. |
| Goedkeur en afkeur tellen niet op tot het totaal | Kan niet: het totaal wordt eruit gerekend en niet apart ingevoerd. De server rekent hem opnieuw uit en gelooft geen totaal van de client. |

## Pure functies

Nieuw bestand `src/lib/recurring.ts`, tests in `src/lib/recurring.test.ts`.

| Functie | Verantwoordelijkheid |
|---|---|
| `batchTotal(invoer, tracksQuality)` | Het te factureren aantal: bij testwerk de som van goedgekeurd en afgekeurd, anders het ingevoerde aantal. Eén functie, zodat het scherm en de route hetzelfde getal uitrekenen. |
| `suggestBatchName(sjabloonnaam, vandaag)` | `H3X testen AUG26`, met de maandafkortingen uit `MAANDEN` in `src/lib/utils.ts` — dezelfde die `formatDate` gebruikt. |
| `recurringInvoiceIntro(batchnaam, opleverdatum, aantallen)` | De inleidende zin, met of zonder goed- en afkeur. |
| `recurringInvoiceDraft(sjabloon, batch)` | Onderwerp, regel en bedragen van de conceptfactuur. |
| `completeBatchDenial(sjabloon, batch, aantallen)` | De weigeringen uit de tabel hierboven, als Nederlandse melding of `null`. |

## Uitrol

Additief — één nieuwe tabel, één nieuwe enum en vier nullable kolommen op
`Project` — dus in de gebruikelijke volgorde: `prisma migrate diff` lezen,
`db:push` naar de productiedatabase, en pas daarna de code deployen.

Het sjabloon voor H3X wordt daarna met de hand ingevoerd; er is geen migratie
die bestaande projecten omzet naar batches.

## Klaar wanneer

- Een beheerder legt een sjabloon vast en start daaruit een batch.
- Een beheerder of teamleider voltooit die batch via een venster dat de aantallen
  en de opleverdatum bevestigt en toont wat de factuur wordt.
- Er staat daarna een conceptfactuur klaar met de juiste klant, het juiste
  onderwerp, één regel met het totaal maal het tarief, en een inleiding die de
  batch, de opleverdatum en bij testwerk de goed- en afkeur noemt.
- Het dashboard toont hoeveel concepten op goedkeuring wachten.
- Een teamleider komt niet bij de facturen.
- Een batch levert hoogstens één factuur op.
- De pure functies zijn gedekt door tests, inclusief de randgevallen hierboven.
- `npx tsc --noEmit` is schoon, `npm run build` geeft exitcode 0 en de volledige
  vitest-suite is groen.
