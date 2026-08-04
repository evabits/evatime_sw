# Ontwerp: TeamLead-rol en het StandUp-scherm

Datum: 2026-08-04
Aanleiding: gebruikersfeedback. Er moet een rol "TeamLead" komen die een standup kan leiden en de
notities ervan kan vastleggen, met per teamlid de uren van de vorige werkdag en de notities van de
vorige standup.

## Uitgangssituatie

**De rol is één veld, geen lijst.** `User.role` is een enkele `Role`-enum met drie waarden:
`ADMIN`, `FINANCE`, `EMPLOYEE` (`prisma/schema.prisma:34-38`). De sessie draagt hem als één string
(`src/lib/auth.ts:69,72,79`). Iemand kan niet tegelijk EMPLOYEE en TeamLead zijn.

**Er is geen enkel teambegrip.** Geen `managerId`, `teamId`, `department` of `reportsTo` op `User`
of `Contract`. `ProjectMember` koppelt mensen aan projecten, niet aan elkaar. `PerformanceReview`
heeft een `reviewer`, maar die wordt per beoordeling gekozen en drukt geen staande verhouding uit.
Elke medewerker staat dus los.

**Er is geen werkdag- of feestdagenlogica.** `User.weeklyHours` en `Contract.contractHours` zijn
enkele getallen zonder dagpatroon. Het enige wat erop lijkt is
`src/app/api/cron/hours-reminder/route.ts:16-18`, dat hardgecodeerd aanneemt dat iedereen maandag
tot en met vrijdag werkt en goedgekeurde afwezigheid niet raadpleegt. Er bestaat geen
`previousWorkingDay`, geen weekendcontrole en geen feestdagentabel.

**Er is geen notitie- of logmodel.** Alleen losse `description`-velden op `TimeEntry`,
`AbsenceRequest` en `Contract.notes`.

**Andermans uren zijn vandaag alleen zichtbaar voor een admin.** `/uren-overzicht` toont voor een
niet-admin uitsluitend de eigen totalen (`src/app/api/hours-overview/route.ts:18,27-29,37`), en
`/reports` is afgeschermd met `canViewReports` (ADMIN of FINANCE).

Huidige omvang: 14 actieve medewerkers.

## Beslissingen

| Onderwerp | Keuze |
|---|---|
| Wie is "het team" | **Iedereen.** Alle actieve medewerkers. Geen nieuw groeperingsmodel. |
| Notities | **Per teamlid**, niet één veld voor de hele bijeenkomst. |
| Inzage | TeamLeads, admins **én de medewerker zelf**. |
| Vorige werkdag | Vorige kalenderdag, weekenden overgeslagen. Feestdagen niet. |
| Vorige standup | De meest recente standup vóór de gekozen datum, ongeacht hoe lang geleden. |
| Eén standup per dag | Ja, `date` is uniek. Twee teamleiders werken aan dezelfde bijeenkomst. |

## Deel 1: de rol

`TEAMLEAD` wordt de vierde waarde in de `Role`-enum.

Omdat de rol één veld is, is een TeamLead géén EMPLOYEE meer. Dat heeft in de praktijk geen
gevolgen: Uren, Kilometers, Uitgaven, Afwezigheid, Uren Overzicht en Km-sjablonen kennen geen
rolcontrole en blijven dus gewoon bereikbaar. Wat een TeamLead **niet** krijgt: Personeel,
Facturatie, Offertes, Rapporten en de hele groep Beheer. Alleen `/standup` komt erbij.

In `src/lib/roles.ts` komt één functie bij:

```ts
export function canLeadStandup(role: string): boolean;
```

`true` voor `ADMIN` en `TEAMLEAD`. Admins erbij omdat zij anders het scherm niet kunnen
controleren, en omdat elke andere beheerfunctie in deze app voor admins open staat.

De `ROLES`-const in datzelfde bestand krijgt een `TEAMLEAD`-ingang met het Nederlandse label
**Teamleider**, zodat `getRoleLabel` klopt. Op `/users` wordt de rol daarmee kiesbaar; de
zod-enums in `src/components/users/users-client.tsx` (regels 23 en 31) en in de bijbehorende
API-route moeten de nieuwe waarde toelaten.

**Dit is een nieuwe gegevensblootstelling en dat is de bedoeling.** Een TeamLead gaat de geboekte
uren van alle collega's zien. De blootstelling is begrensd tot dit ene scherm en tot één dag per
keer: geen tarieven, geen omzet, geen rapporten, geen historie in bulk.

## Deel 2: het datamodel

```prisma
model Standup {
  id        String        @id @default(cuid())
  date      DateTime      @unique @db.Date
  ledById   String
  ledBy     User          @relation("StandupLeader", fields: [ledById], references: [id])
  createdAt DateTime      @default(now())
  updatedAt DateTime      @updatedAt
  notes     StandupNote[]
}

model StandupNote {
  id        String   @id @default(cuid())
  standupId String
  standup   Standup  @relation(fields: [standupId], references: [id], onDelete: Cascade)
  userId    String
  user      User     @relation("StandupSubject", fields: [userId], references: [id], onDelete: Cascade)
  note      String
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  @@unique([standupId, userId])
}
```

Op `User` komen twee relatievelden: `standupsLed Standup[] @relation("StandupLeader")` en
`standupNotes StandupNote[] @relation("StandupSubject")`. Twee benoemde relaties zijn nodig omdat
`User` hier in twee verschillende rollen voorkomt — dezelfde vorm die `PerformanceReview` al
gebruikt voor `ReviewSubject` en `ReviewReviewer`.

`date` is uniek: **één standup per dag**, ongeacht wie hem leidt. Openen twee teamleiders dezelfde
ochtend het scherm, dan werken ze aan dezelfde bijeenkomst in plaats van aan twee losse — anders
raken de notities over twee records verspreid en ziet de volgende leider er maar de helft van.

`@@unique([standupId, userId])` geeft per bijeenkomst hoogstens één notitie per medewerker, wat
het opslaan een `upsert` maakt in plaats van een keuze tussen aanmaken en bijwerken.

`ledById` legt vast wie de bijeenkomst leidde. Er wordt **niet** bijgehouden wie welke losse
notitie schreef; bij een dagelijkse bijeenkomst van een kwartier is dat administratie zonder doel.

Beide cascades staan op verwijderen van de bovenliggende rij: verwijder je een standup, dan gaan
zijn notities mee; verwijder je een gebruiker, dan gaan zijn notities mee.

## Deel 3: de twee datumbegrippen

Dit zijn twee verschillende dingen en het verschil is opzettelijk.

**De vorige werkdag** is de vorige kalenderdag met weekenden overgeslagen. Maandag kijkt naar
vrijdag, dinsdag naar maandag. Een pure functie in `src/lib/standup.ts`:

```ts
export function previousWorkingDay(date: string): string;
```

**Tekst in, tekst uit — bewust geen `Date`.** De datumkolommen zijn `@db.Date` en de bestaande
routes geven datums door als `YYYY-MM-DD` (`src/app/api/reports/route.ts:25-26`,
`src/app/api/hours-overview/route.ts:20-21`). Een `Date` erdoorheen halen introduceert een
tijdzonevraag die hier niets oplost: `new Date("2026-08-04")` is middernacht **UTC**, terwijl
`getDay()` en `setDate()` in de **lokale** zone rekenen. De productieserver draait op UTC en de
gebruikers zitten in Amsterdam, dus dat verschil is echt en levert precies het soort fout op dat
een dag verschuift zonder dat iets klaagt.

Reken daarom uitsluitend met `getUTCDay()` en `setUTCDate()`, en geef een `YYYY-MM-DD`-string
terug. Dat maakt de functie ook zonder tijdzonegedoe testbaar.

**Feestdagen worden niet overgeslagen.** Er staat geen feestdagenkalender in de app, en er een
onderhouden is meer werk dan het oplevert. Op tweede paasdag toont het scherm een dag waarop
niemand uren boekte — dat is geen fout maar een juiste weergave, en een teamleider ziet zelf wat
er aan de hand is.

**De vorige standup** is de meest recente standup met een datum vóór de gekozen datum, ongeacht
hoe lang geleden dat was. Sla je er twee over, dan zie je nog steeds de laatste die er wél was.
Zou dit "gisteren" zijn, dan wist een gemiste dag stilzwijgend de context waar de bijeenkomst juist
op voortbouwt.

## Deel 4: het scherm

`/standup`, in een nieuwe menugroep **Team** met `roles: ["ADMIN", "TEAMLEAD"]`, geplaatst boven
de groep Personeel.

Bovenaan een datumveld dat standaard op vandaag staat. Verzet je het, dan verspringen de uren en
de vorige notities mee — zo vul je een gemiste standup alsnog in of lees je een oude terug.

Daaronder één blok per **actieve** medewerker (`archivedAt: null`), op naam gesorteerd, met:

| Onderdeel | Inhoud |
|---|---|
| Naam | De medewerker. |
| Uren vorige werkdag | Per regel: uren, project, klant en de omschrijving. Zonder boekingen: zichtbaar `geen uren geboekt`. |
| Afwezigheid | Ligt er een **goedgekeurde** `AbsenceRequest` over die dag, dan `afwezig — vakantie` / `ziek` / `bijzonder verlof` / `onbetaald verlof`. |
| Vorige notitie | De notitie over deze persoon uit de vorige standup, met datum, grijs en alleen-lezen. |
| Notitie van vandaag | Een tekstvak. |

De afwezigheidsregel is er omdat een kale nul misleidt: zonder die melding vraagt een teamleider
waarom iemand niets boekte terwijl die met vakantie was.

Opslaan gaat **per notitie**, niet met één knop onderaan. Je typt tijdens een vergadering; wegklikken
mag niet betekenen dat het weg is.

De standup zelf wordt pas aangemaakt wanneer de eerste notitie wordt opgeslagen. Het scherm openen
en niets invullen laat geen lege bijeenkomst achter.

## Deel 5: inzage voor de medewerker

Onderaan `/uren-overzicht` komt een blok **Standup-notities**: chronologisch, datum plus notitie,
alleen-lezen, uitsluitend de eigen notities van de ingelogde gebruiker. Die pagina gaat toch al per
persoon over uren en is voor iedereen bereikbaar, dus daar hoort het.

Niet bewerkbaar en niet verwijderbaar door de medewerker: het is het verslag van een bijeenkomst,
geen veld waarin hij zelf schrijft.

Een admin of TeamLead die de historie van één persoon wil zien, gebruikt het datumveld op
`/standup`. Een apart historiescherm valt buiten dit traject.

## Deel 6: de routes

| Route | Rol | Wat |
|---|---|---|
| `GET /api/standup?date=YYYY-MM-DD` | `canLeadStandup` | Per actieve medewerker: de uren van de vorige werkdag, de afwezigheid op die dag, de vorige notitie en de notitie van deze standup. |
| `PUT /api/standup/note` | `canLeadStandup` | `{ date, userId, note }` — `upsert` van de notitie; maakt de `Standup` aan als die er nog niet is, met de ingelogde gebruiker als `ledById`. |
| `GET /api/standup/mine` | elke sessie | De eigen notities van de ingelogde gebruiker, chronologisch. |

`GET /api/standup` doet het rekenwerk server-side: de client krijgt kant-en-klare regels en bepaalt
zelf geen datums. Zo is er één plek waar `previousWorkingDay` wordt toegepast.

Een lege notitie (`""` na trimmen) verwijdert de notitie in plaats van een leeg record achter te
laten.

## Testen

Volgens het patroon van de repo: pure functies in `src/lib/` met vitest, geen component- of
API-tests.

`src/lib/standup.test.ts`:

- `previousWorkingDay("2026-08-04")` — een dinsdag → `"2026-08-03"`, de maandag.
- `previousWorkingDay("2026-08-03")` — een maandag → `"2026-07-31"`, de vrijdag, niet de zondag.
- Een zondag → de vrijdag ervoor.
- Een zaterdag → de vrijdag ervoor.
- Een woensdag → de dinsdag ervoor.
- Rond een maandgrens: `"2026-06-01"` is een maandag → `"2026-05-29"`.
- Rond een jaargrens: `"2027-01-01"` is een vrijdag → `"2026-12-31"`.
- De uitvoer heeft altijd de vorm `YYYY-MM-DD`, ook wanneer dag of maand één cijfer is.

Handmatig na te lopen:

- Een gebruiker op Teamleider zetten en zien dat hij `/standup` in het menu krijgt, en Personeel,
  Facturatie, Rapporten en Beheer niet.
- Als teamleider het scherm openen op een dinsdag en de uren van maandag zien; op een maandag die
  van vrijdag.
- Een medewerker met een goedgekeurde vakantie op de vorige werkdag toont `afwezig — vakantie`, niet
  alleen een lege urenlijst.
- Een medewerker zonder uren en zonder afwezigheid toont `geen uren geboekt`.
- Een notitie opslaan, de pagina verversen, en hem terugzien.
- De volgende dag het scherm openen en die notitie als vorige notitie zien staan.
- Twee dagen overslaan en zien dat de vorige notitie nog steeds die van de laatste gehouden standup
  is.
- Een notitie leegmaken en zien dat hij verdwijnt.
- Als medewerker inloggen en op `/uren-overzicht` de eigen notities zien, en die van niemand anders.
- Als medewerker `/standup` en `GET /api/standup` benaderen → geweigerd.
- Twee teamleiders die op dezelfde dag opslaan, schrijven in dezelfde standup.

## Uitrol

1. `prisma migrate diff` draaien en de volledige lijst lezen — er horen alleen twee tabellen en
   één enum-waarde bij te komen.
2. `npm run db:push`.
3. Deployen.
4. In `/users` de betreffende medewerkers op Teamleider zetten.

Geen backfill. Niets wordt verwijderd.

De enum-uitbreiding is additief: bestaande rijen houden hun waarde, en code die `TEAMLEAD` nog niet
kent, komt die waarde ook niet tegen zolang er nog niemand die rol heeft. Daarom mag stap 2 vóór
stap 3, en is stap 4 bewust de laatste.

## Buiten scope

- Meerdere teams, of welke groepering dan ook. Het scherm toont alle actieve medewerkers.
- Bijhouden wie welke losse notitie schreef.
- Notificaties, herinneringen of het afvinken van een standup als "gehouden".
- Feestdagen.
- Notities bewerken of verwijderen door de medewerker over wie ze gaan.
- Een apart historiescherm per medewerker voor teamleiders; daarvoor dient het datumveld.
- Uren, ritten of uitgaven bewerken vanaf het standup-scherm. Het scherm is lezen plus notities.
