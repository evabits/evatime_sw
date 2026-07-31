# Ontwerp: uren en ritten namens een medewerker, en een bewerkbaar overzicht

Datum: 2026-07-31
Aanleiding: gebruikersfeedback van AB.

## Feedback

1. Een admin kan uren van andere medewerkers wél bewerken, maar niet toevoegen namens die
   medewerker — nieuwe uren komen altijd onder de naam van de admin terecht.
2. Uren, uitgaven en ritten willen kunnen filteren op persoon, project, klant en dergelijke,
   zoals in TimeChimp.
3. In dat gefilterde overzicht ook regels kunnen aanpassen.

## Uitgangssituatie

`POST /api/time`, `/api/km` en `/api/expenses` zetten `userId` altijd op `session.user.id`.
De PUT-routes staan een admin toe entries van anderen te bewerken, maar geen van de schema's
kent een `userId`-veld, dus namens iemand anders boeken of een entry naar een andere medewerker
verplaatsen kan nergens.

`/reports` (rol ADMIN en FINANCE) filtert al op datum, klant, project, medewerker,
factureerbaar en tags, over uren, ritten en uitgaven tegelijk, via één call naar
`GET /api/reports`. Die pagina is puur lezen. Punt 2 uit de feedback bestaat dus grotendeels
al; punt 3 is wat ontbreekt.

Bij het doorlezen kwamen drie bestaande gaten aan het licht in precies de routes die dit
ontwerp aanraakt. Ze worden meegenomen, zie "Beveiliging".

## Beslissingen

| Onderwerp | Keuze |
|---|---|
| Namens boeken geldt voor | Uren en ritten. Niet voor uitgaven. |
| Wie mag het | Alleen ADMIN. |
| Vastleggen wie het invoerde | Nee. Geen `createdById`-kolom, geen migratie. |
| Waar het overzicht landt | `/reports` wordt bewerkbaar. Geen nieuwe pagina. |
| Bewerken | Losse regels én bulkacties. |
| Bulkacties | Verplaats naar project, factureerbaar aan/uit, toewijzen aan andere medewerker (uren en ritten), verwijderen. |

Overwogen en verworpen: een aparte pagina naast `/reports` (dupliceert de filterset en de API,
twee schermen die grotendeels hetzelfde doen), en filters toevoegen aan `/time`, `/km` en
`/expenses` afzonderlijk (drie keer een filterbalk en drie keer bulk-logica bouwen, en nooit
één gecombineerd beeld per klant).

## Deel 1: boeken namens een andere medewerker

### API

`POST /api/time` en `POST /api/km` krijgen een optioneel `userId` in het zod-schema. De
server bepaalt de eigenaar met een gedeelde helper:

```ts
// src/lib/entry-owner.ts
export function resolveEntryUserId(
  role: string,
  sessionUserId: string,
  requestedUserId?: string | null,
): string
```

Geeft `requestedUserId` terug als de rol ADMIN is en er een waarde is meegestuurd, anders
`sessionUserId`. Voor niet-admins wordt het veld dus stilzwijgend genegeerd, hetzelfde patroon
als `rateOverride` vandaag al volgt. Bestaat het opgegeven user-ID niet, dan antwoordt de route
met 400.

`PUT /api/time/[id]` en `PUT /api/km/[id]` krijgen hetzelfde optionele veld, langs dezelfde
helper, zodat een admin een losse regel naar de juiste medewerker kan verplaatsen.

`/api/expenses` blijft ongewijzigd op dit punt.

### UI

Op `/time` en `/km` komt boven in het invoerformulier een **Medewerker**-select, alleen
zichtbaar voor admins, standaard de ingelogde gebruiker. Gearchiveerde medewerkers staan er
niet in. `/time` laadt de gebruikerslijst al voor admins; `/km` gaat dat ook doen.

`/km` heeft nu geen medewerkersfilter en toont hard de eigen ritten, terwijl `/time` dat
allebei wel heeft. Zonder aanpassing verdwijnt een rit die je voor een collega boekt uit beeld.
`/km` krijgt daarom dezelfde behandeling als `/time`: een admin ziet alle ritten, met hetzelfde
medewerkersfilter erboven.

Na het opslaan van een entry voor een andere medewerker zet het formulier het medewerkersfilter
op die medewerker, zodat de zojuist geboekte regel zichtbaar is in plaats van uit de lijst te
vallen.

## Deel 2: `/reports` bewerkbaar maken

De filterkaart blijft ongewijzigd — datum, klant, project, medewerker, factureerbaar, tags.

Voor admins komt er per regel een bewerk- en een verwijderknop. Bewerken opent een dialoog met
de velden van die soort:

- uren: project, activiteit, datum, uren, omschrijving, tarief-override, factureerbaar, medewerker
- ritten: project, activiteit, datum, km, omschrijving, tarief-override, factureerbaar, medewerker
- uitgaven: categorie, project, datum, omschrijving, bedrag, btw-tarief, factureerbaar, declarabel

Gefactureerde regels (`invoiced`) tonen geen knoppen maar een badge, zoals `/time` dat nu al
doet. FINANCE ziet geen knoppen en geen selectievakjes; de server weigert de mutaties
onafhankelijk daarvan.

Na elke mutatie haalt het scherm het rapport opnieuw op met de actieve filters. Dat is één call
en voorkomt rijen die na bijvoorbeeld een projectwijziging niet meer aan het filter voldoen maar
wel in beeld blijven.

### Bestandsindeling

`src/components/reports/reports-client.tsx` is nu 484 regels en zou met deze uitbreiding ruim
verdubbelen. Het wordt opgesplitst in:

- `reports-client.tsx` — state, ophalen, orkestratie
- `report-filters.tsx` — de filterkaart
- `time-rows.tsx`, `km-rows.tsx`, `expense-rows.tsx` — de drie tabellen
- `entry-edit-dialog.tsx` — één dialoog met een `kind`-prop
- `bulk-bar.tsx` — de bulkbalk

De rekenlogica voor de totalen en de groepering per medewerker verhuist naar `src/lib/` zodat
er tests op kunnen, in lijn met waar de rest van de repo zijn tests heeft.

## Deel 3: bulkacties

Selectievakjes zitten per tabel, niet over de drie soorten heen: je selecteert uren, of ritten,
of uitgaven, en krijgt de bulkbalk van die soort. Dat vermijdt acties die maar voor een deel van
een gemengde selectie geldig zijn. Elke tabel heeft een "alles selecteren" in de kop, die alleen
niet-gefactureerde regels aanvinkt.

De bulkbalk verschijnt zodra er iets geselecteerd is en toont het aantal. Verwijderen vraagt om
bevestiging met dat aantal erin.

### API

Eén nieuwe route, `POST /api/entries/bulk`, alleen voor ADMIN:

```
{ kind: "time" | "km" | "expense",
  ids: string[],                      // max 500
  action:
    | { type: "project",  projectId: string }
    | { type: "billable", billable: boolean }
    | { type: "user",     userId: string }   // alleen kind time of km
    | { type: "delete" } }
```

De vertaling van actie naar prisma-fragment zit in een pure helper:

```ts
// src/lib/bulk-entries.ts
export function buildBulkMutation(
  kind: "time" | "km" | "expense",
  action: BulkAction,
): { data: Record<string, unknown> } | { delete: true }
```

`{ type: "user" }` in combinatie met `kind: "expense"` is ongeldig en levert een 400 op.

Uitgevoerd als `updateMany` of `deleteMany` met `where: { id: { in: ids }, invoiced: false }`.
Gefactureerde regels vallen daarmee structureel buiten de mutatie, ook als de client ze toch
meestuurt. Bij `{ type: "project" }` en `{ type: "user" }` controleert de route eerst of het
doel bestaat, anders 400.

De route geeft `{ count }` terug. Is `count` kleiner dan `ids.length`, dan meldt het scherm
"X van de Y regels bijgewerkt, gefactureerde regels overgeslagen".

### Bekende beperking

Bij het verwijderen van een uitgave met bonnetje blijft het bestand in blob-opslag achter. De
bestaande losse verwijderknop doet dat vandaag ook al; bulk maakt het alleen sneller zichtbaar.
Opruimen valt buiten deze batch.

## Beveiliging

Vier server-side fixes in routes die dit ontwerp toch aanraakt. Geen ervan verandert wat de UI
vandaag doet — de betreffende knoppen staan al op disabled — ze sluiten alleen de route zelf.

1. `PUT /api/km/[id]` heeft geen eigenaarscheck: elke ingelogde gebruiker kan met een rit-ID de
   rit van een collega wijzigen. Krijgt dezelfde check als `time`: geen admin en niet je eigen
   rit → 403.
2. `DELETE /api/km/[id]` heeft helemaal geen check en verwijdert wat het krijgt. Idem.
3. `PUT` en `DELETE` op `/api/time/[id]` en `/api/km/[id]` weigeren gefactureerde regels met een
   400, zoals `/api/expenses/[id]` dat al doet.
4. Een `userId` van een niet-admin wordt genegeerd, zodat de entry van de indiener blijft.

## Testen

Het patroon van de repo volgen: pure functies in `src/lib/` met vitest ernaast, geen API- of
componenttests.

- `src/lib/entry-owner.test.ts` — admin met `userId`, admin zonder, medewerker die een `userId`
  meestuurt (moet zichzelf houden).
- `src/lib/bulk-entries.test.ts` — toewijzen-aan-medewerker voor uitgaven wordt geweigerd; de
  `invoiced: false`-guard zit altijd in de `where`; elke actie levert het verwachte fragment.
- Tests op de totalen- en groeperingslogica die uit `reports-client.tsx` verhuist.

Handmatig na te lopen bij oplevering:

- als admin uren boeken voor een collega, controleren dat ze onder diens naam staan
- hetzelfde voor een rit
- in het overzicht een regel naar een ander project verplaatsen en de wijziging terugzien
- een bulkselectie waar een gefactureerde regel tussen zit, en de "X van Y"-melding controleren
- inloggen als medewerker en bevestigen dat de medewerkerskeuze en de bulkbalk nergens opduiken
- inloggen als finance en bevestigen dat `/reports` leesbaar maar niet bewerkbaar is

## Buiten scope

- Namens iemand anders uitgaven indienen.
- Vastleggen wie een entry namens een ander invoerde.
- Opruimen van bonnetjes in blob-opslag bij verwijderen.
- Bulkacties over meerdere soorten tegelijk.
