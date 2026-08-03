# Ontwerp: alleen deelnemers kunnen op een project boeken

Datum: 2026-08-04
Aanleiding: gebruikersfeedback. Per project moet in te stellen zijn wie erop mag schrijven.

Dit is traject 2 van drie. Traject 1 (activiteiten eruit, factureerbaarheid naar het project) is
af en gemerged. Traject 3 — projecten archiveren en kopiëren — komt hierna, en moet als laatste
omdat kopiëren de deelnemers uit dit traject moet meenemen.

## Uitgangssituatie

Elke medewerker kan vandaag op elk actief project boeken. Het urenformulier toont alle projecten
met status `ACTIVE` of `CONCEPT`; het rittenformulier en het uitgavenformulier idem. Er is geen
koppeling tussen een gebruiker en een project.

Sinds een eerdere batch kan een admin namens een andere medewerker boeken: de routes accepteren
een `userId` en `resolveEntryUserId` bepaalt de eigenaar van de regel.

Huidige data: 14 actieve medewerkers, 22 actieve projecten, 3 gearchiveerde. Op 23 projecten is
ooit geboekt, met gemiddeld 2,3 verschillende boekers en uitschieters van 6, 5 en 5. Eén actief
project heeft nog nooit een boeking gehad: `EVAjig / ProductionTool`.

## Beslissingen

| Onderwerp | Keuze |
|---|---|
| Doel | Alleen **schrijven** beperken. Zichtbaarheid elders in de app verandert niet. |
| Bereik | Uren, ritten én uitgaven, plus de twee sjabloonsoorten die een project vastleggen. |
| Op wie slaat de eis | Op de **eigenaar** van de regel, ook wanneer een admin namens iemand anders boekt, en ook voor de eigen regels van een admin. Geen uitzonderingen. |
| Uitgave zonder project | Valt buiten de regel. Er is geen project om deelname aan te toetsen. |
| Bij bewerken | Alleen toetsen wanneer het project of de eigenaar wijzigt. |
| Vullen bij uitrol | Uit de historie: wie ooit op een project boekte, wordt deelnemer. |

## Deel 1: datamodel

```prisma
model ProjectMember {
  projectId String
  project   Project @relation(fields: [projectId], references: [id], onDelete: Cascade)
  userId    String
  user      User    @relation(fields: [userId], references: [id], onDelete: Cascade)
  createdAt DateTime @default(now())

  @@id([projectId, userId])
}
```

Met `members ProjectMember[]` op `Project` en `projectMemberships ProjectMember[]` op `User`.
Dezelfde vorm als de `ActivityTypeProject` die traject 1 verwijderde.

`onDelete: Cascade` op beide zijden: verwijder je een project of een gebruiker, dan verdwijnt de
koppeling mee. Een gearchiveerde gebruiker blijft deelnemer — archiveren is geen verwijderen, en
zijn historische regels moeten bewerkbaar blijven.

## Deel 2: de regel

Twee pure functies in `src/lib/project-members.ts`:

```ts
export function isProjectMember(
  memberUserIds: string[],
  userId: string | null | undefined,
): boolean;

export function membershipCheckNeeded(
  existing: { projectId: string | null; userId: string } | null,
  next: { projectId: string | null; userId: string },
): boolean;
```

`isProjectMember` geeft `false` voor een lege lijst, een onbekende gebruiker, en een ontbrekende
(`null`/`undefined`) eigenaar. Dat laatste is het punt: een ontbrekende eigenaar mag nooit per
ongeluk `true` opleveren.

`membershipCheckNeeded` geeft `true` bij aanmaken (`existing === null`), en bij bijwerken alleen
wanneer `projectId` of `userId` verschilt. Zonder die verfijning wordt historie onbewerkbaar: een
oude regel van iemand die nooit deelnemer was, zou je niet eens van omschrijving kunnen wijzigen.

Bij weigering: status 400 met `{ error: "Deze medewerker is geen deelnemer van dit project" }` —
dezelfde vorm als het bestaande `"Onbekende medewerker"`.

## Deel 3: waar het afgedwongen wordt

Server-side, in elke route die een registratie met een project aanmaakt of wijzigt:

- `POST /api/time`, `PUT /api/time/[id]`
- `POST /api/km`, `PUT /api/km/[id]`
- `POST /api/expenses`, `PUT /api/expenses/[id]` — alleen wanneer een `projectId` is opgegeven
- `POST /api/km/templates`, `PUT /api/km/templates/[id]` — getoetst op de eigenaar van het sjabloon
- `POST /api/entries/bulk` — zie hieronder

De controle komt ná het bepalen van de eigenaar met `resolveEntryUserId`, want die bepaalt op wie
de eis slaat.

**De bulkroute is de gemakkelijkste om te vergeten en juist de gevaarlijkste.** Twee van haar
vier acties wijzigen precies de velden die de toets triggeren: *verplaats naar project* zet een
nieuw `projectId` op een reeks regels, en *toewijzen aan medewerker* zet een nieuwe `userId`.
Zonder controle daar kan een admin in één klik twintig regels op een project zetten waar de
eigenaren niet op staan — een achterdeur die groter is dan het formulier die hij omzeilt.

Bij `{ type: "project" }` moet elke geselecteerde regel een eigenaar hebben die deelnemer is van
het doelproject. Bij `{ type: "user" }` moet de nieuwe medewerker deelnemer zijn van elk project
waarop die regels staan. De andere twee acties, factureerbaar en verwijderen, raken geen van
beide velden en blijven ongemoeid.

Bij een overtreding wordt de **hele** bulkactie geweigerd, vóór er iets geschreven is, met een
melding die noemt hoeveel regels niet voldoen. Gedeeltelijk toepassen zou hier misleidend zijn:
de bestaande "X van de Y regels bijgewerkt"-melding wijt het overslaan aan gefactureerde regels,
en die reden zou dan niet kloppen. Dit volgt hetzelfde alles-of-niets-principe als het
backfill-script uit traject 1.

**Het conceptproject-knopje.** Het urenformulier laat een niet-admin een bare conceptproject
aanmaken. De aanmaker wordt automatisch deelnemer, anders kan hij niet boeken op wat hij zojuist
maakte. Dat gebeurt server-side in `POST /api/projects`, in dezelfde transactie als het aanmaken.

## Deel 4: de UI

**Op het project** — een aanvinklijst **Deelnemers** in het projectformulier, naast de tarieven
per werkniveau en de factureerbaar-schakelaar. Alleen actieve medewerkers worden getoond. De
projectenlijst krijgt een kolom met het aantal deelnemers, zodat een leeg project opvalt.

Meegestuurd in de bestaande PUT/POST van het project als `memberIds: string[]`, weggeschreven in
één transactie: `deleteMany` op het project gevolgd door `createMany`. Hetzelfde patroon als
`levelRates`, inclusief de `memberIdsKnown`-guard die traject 1 nodig bleek te hebben — laat de
client het veld weg, dan blijven de bestaande deelnemers staan; stuurt hij een lege array, dan
worden ze gewist.

**In de invoerformulieren** wordt de projectkeuze gefilterd, en dat gebeurt op de server:

- Een **niet-admin** krijgt van de serverpagina alleen de projecten waarvan hij deelnemer is. De
  rest komt niet in de payload. Er is dus geen client-side filter om te omzeilen.
- Een **admin** krijgt alle projecten plus per project de `userId`s van de deelnemers, zodat de
  projectlijst kan meebewegen met de medewerker die hij in het Medewerker-veld kiest.

Dat geldt voor `/time`, `/km`, `/expenses`, de km-sjabloonpagina en het woon-werksjabloon onder
personeel.

De servercontrole uit deel 3 staat hier los van en blijft in alle gevallen gelden.

## Deel 5: vullen bij de uitrol

Een script `prisma/backfill-members.ts`, naar het model van het backfill-script uit traject 1:
standaard droog, schrijft alleen met `--write`, en draait binnen één `$transaction`.

Het leidt de deelnemers af uit de historie: iedereen die op een project ooit een urenregel, een
rit of een uitgave heeft geboekt, wordt deelnemer. Dat dekt 21 van de 22 actieve projecten.
Gearchiveerde projecten worden meegenomen, zodat ze bruikbaar zijn als er ooit een teruggezet
wordt.

`EVAjig / ProductionTool` heeft nog nooit een boeking en krijgt dus geen deelnemers. Het script
meldt zulke projecten expliciet in zijn uitvoer in plaats van ze stil over te slaan; een admin
vult ze daarna in de UI aan.

Zonder deze vulling zou op de dag van uitrol niemand meer op enig project kunnen boeken.

## Deel 6: uitrol

Dezelfde gefaseerde vorm als traject 1, zodat code en schema nooit uiteenlopen:

1. **Toevoegen.** `db:push` met alleen de nieuwe tabel. De draaiende code merkt er niets van.
2. **Vullen.** Het backfill-script droog draaien, de uitvoer controleren, dan met `--write`.
3. **Deployen.** De nieuwe code dwingt de regel af en filtert de keuzelijsten.

Er is geen vierde stap: dit traject verwijdert niets. Vóór stap 1 draait `prisma migrate diff`
zodat zichtbaar is dat er alleen een tabel bij komt.

## Testen

Volgens het patroon van de repo: pure functies in `src/lib/` met vitest, geen component- of
API-tests.

`src/lib/project-members.test.ts`:

- `isProjectMember` met een lege lijst → `false`.
- Met een gebruiker die er niet in staat → `false`.
- Met een gebruiker die er wel in staat → `true`.
- Met `null` en met `undefined` als gebruiker → `false`, ook wanneer de lijst niet leeg is.
- `membershipCheckNeeded` bij aanmaken (`existing === null`) → `true`.
- Bij bewerken zonder wijziging van project of eigenaar → `false`.
- Bij verplaatsing naar een ander project → `true`.
- Bij toewijzing aan een andere medewerker → `true`.
- Bij beide tegelijk → `true`.
- Bij een uitgave waarvan `projectId` van `null` naar een project gaat → `true`.

Handmatig na te lopen bij oplevering:

- Als medewerker inloggen: de projectkeuze toont alleen eigen projecten, in alle drie de
  invoerformulieren.
- Als admin een collega kiezen in het urenformulier en zien dat de projectlijst meebeweegt.
- Een oude urenregel van een niet-deelnemer bewerken (alleen de omschrijving) en zien dat hij
  gewoon opslaat.
- Diezelfde regel naar een ander project verplaatsen en de weigering krijgen.
- Via een km-sjabloon proberen te boeken op een project waar je niet op staat.
- Een conceptproject aanmaken via het urenformulier en er meteen op kunnen boeken.
- Op `/reports` een reeks regels bulksgewijs verplaatsen naar een project waar niet elke eigenaar
  op staat, en de weigering krijgen zonder dat er iets is gewijzigd.
- Diezelfde reeks bulksgewijs toewijzen aan iemand die niet op al die projecten staat, met
  hetzelfde resultaat.

## Buiten scope

- Zichtbaarheid: niet-deelnemers zien projecten en bestaande gegevens gewoon zoals nu. Dit
  traject beperkt uitsluitend schrijven.
- Rollen of rechten binnen een project. Deelnemer of niet, meer smaken zijn er niet.
- Projecten archiveren en kopiëren. Traject 3.
- Bestaande registraties van niet-deelnemers. Die blijven staan en blijven bewerkbaar.
