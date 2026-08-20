# Projectplanning B — afhankelijkheden en bewaking

**Datum:** 20-AUG-2026
**Status:** ontwerp vastgesteld, klaar voor een implementatieplan
**Bouwt op:** `docs/superpowers/specs/2026-08-19-projectplanning-tijdlijn-design.md` (deelproject A, opgeleverd)

## Waarom

Deelproject A gaf projecten geplande datums, een taakmodel eronder en een
tijdlijn die dat toont. Wat er niet in zit, is verband: dat productie pas kan
beginnen als het ontwerp klaar is. Nu staan taken los naast elkaar en moet een
beheerder in zijn hoofd bijhouden welke volgorde er echt toe doet — en bij een
uitloop met de hand tien datums naschuiven.

B legt dat verband vast, rekent de gevolgen van een verschuiving voor, en laat
zien waar de planning zichzelf tegenspreekt.

**C — voortgang en uren** volgt hierna en blijft buiten dit ontwerp. Dat raakt
het hele team; A en B blijven binnen het beheerdersscherm.

## Reikwijdte

**Wel:**

- Een taak kan wachten op andere taken van hetzelfde project.
- Kringlopen worden geweigerd, met de keten in de melding.
- Verschuif je een taak naar later, dan wordt voorgerekend wat er mee zou
  schuiven; jij bevestigt.
- Vier signalen op de tijdlijn, in twee sterktes.
- Pijlen tussen de taakbalken van een uitgeklapt project.

**Niet, en waarom:**

| Buiten scope | Reden |
|---|---|
| Vier soorten koppelingen (start-start, eind-eind, …) | "Pas beginnen als de vorige klaar is" dekt wat hier gepland wordt. Later toe te voegen als een veld op de koppeling. |
| Wachttijd tussen twee taken ("start drie dagen ná") | Niet gevraagd. Later een `lagDays`-veld op de koppeling. |
| Koppelingen tussen projecten | Bewust gekozen: pijlen blijven bij elkaar in beeld, kringlopen zijn per project te controleren, en verschuiven raakt nooit ongemerkt een andere klant. Later uit te breiden zonder het model om te gooien. |
| Automatisch naar voren trekken | Zie "Afwegingen". |
| Percentage gereed, geboekte uren | Deelproject C. |
| Balken verslepen | Stond al buiten A en blijft buiten B. |

## Afwegingen

### Voorrekenen en bevestigen, niet stilzwijgend meeschuiven

Drie mogelijkheden gewogen:

1. Automatisch meeschuiven, zoals een klassieke planningstool. Eén aanpassing
   kan dan tientallen taken verzetten en je merkt pas achteraf dat een project
   over zijn einddatum loopt.
2. Alleen tekenen en waarschuwen; verschuiven doe je zelf. Voorspelbaar, maar
   bij een keten van vijf taken typ je vijf keer.
3. **Gekozen:** voorrekenen, tonen, bevestigen. Je houdt de regie zonder tien
   taken na te hoeven lopen.

### Rekenwerk in de browser, uitvoeren op de server

Het scherm heeft alle taken van het project al in handen — de pagina is
server-gerenderd en geeft ze door. Dezelfde pure functie draait in de browser
voor het voorbeeld en op de server voor de uitvoering. Geen extra ronde naar de
server om een voorbeeld op te halen, en de server gelooft de browser niet op
zijn woord: die rekent opnieuw met zijn eigen gegevens.

Het alternatief — een aparte proefdraai-route met een `dryRun`-vlag — is netter
gescheiden maar kost twee keer heen en weer voor één wijziging.

### Doorschuiven gaat één kant op

Naar later schuiven cascadeert; naar vroeger schuiven laat de rest staan, die
krijgt lucht. Automatisch naar voren trekken zou betekenen dat je een taak
vervroegt en er ineens werk op je scherm staat dat je niet hebt aangeraakt.

### Vier signalen in twee sterktes

De gebruiker koos alle vier de signalen, ook "taak is over zijn einddatum",
ná de waarschuwing dat dit zonder "gereed" uit C ook alles markeert wat gewoon
netjes is afgerond. Dat signaal krijgt daarom een **gedempte** markering en geen
rode: een scherm vol rood ga je negeren, en dan is de rode markering die er wél
toe doet ook niets meer waard.

## Datamodel

### `TaskDependency` — nieuw

```prisma
model TaskDependency {
  id          String      @id @default(cuid())
  // De taak die moet wachten.
  taskId      String
  task        ProjectTask @relation("TaskWaitsOn", fields: [taskId], references: [id], onDelete: Cascade)
  // De taak waarop gewacht wordt.
  dependsOnId String
  dependsOn   ProjectTask @relation("TaskBlocks", fields: [dependsOnId], references: [id], onDelete: Cascade)
  createdAt   DateTime    @default(now())

  @@unique([taskId, dependsOnId])
  @@index([dependsOnId])
}
```

En op `ProjectTask` twee relaties erbij:

```prisma
  waitsOn   TaskDependency[] @relation("TaskWaitsOn")
  blocks    TaskDependency[] @relation("TaskBlocks")
```

`onDelete: Cascade` aan beide kanten: een verwijderde taak neemt zijn
koppelingen mee, in beide richtingen.

### Regels die de server afdwingt

Alle vier in de route, niet alleen in het scherm:

1. **Beide taken horen bij hetzelfde project.** Anders 400.
2. **Een taak kan niet op zichzelf wachten.** Anders 400.
3. **Geen kringlopen.** Geweigerd bij het leggen van de koppeling, met de keten
   in de melding: `Dit zou een kringloop sluiten: ontwerp → prototype → test →
   ontwerp`.
4. **Geen dubbele koppeling** — de unieke sleutel `[taskId, dependsOnId]` vangt
   dat af, en `handleError` vertaalt `P2002` al naar een 409.

### Samenvoegen van projecten

Koppelingen wijzen naar taken en niet naar projecten. Bij een samenvoeging
verhuizen beide uiteinden samen mee (deelproject A verzet alle `ProjectTask`-
rijen van de bron naar het doel), dus een koppeling blijft geldig en blijft
binnen één project. **Er is geen functionele wijziging aan de merge-route nodig** —
alleen een regel commentaar die deze aanname vastlegt, zodat wie daar later iets
verandert weet dat koppelingen ervan afhangen.

Dit is een vastgelegde aanname, geen test: aantonen vraagt een database en dit
project test uitsluitend pure functies. Er komt een commentaar op de plek in de
merge-route waar het toe doet, en een leescontrole zodra er echte taken en
koppelingen in de database staan.

## De motor

### Doorrekenen

Een opvolger moet beginnen ná de einddatum van zijn voorganger. Einddatums zijn
inclusief, dus de vroegst toegestane start is **de dag ná** de laatste
einddatum van al zijn voorgangers.

`shiftPlan(taken, koppelingen)` kijkt naar de **hele toestand** van een project
en niet naar één wijziging. Het loopt de taken in topologische volgorde af; voor
elke taak is de vereiste start het maximum over zijn voorgangers van
`einddatum + 1 dag`. Ligt de huidige start daarvóór, dan schuift de taak vooruit
met precies dat verschil, met behoud van duur. Ligt hij erna, dan gebeurt er
niets — die taak heeft lucht.

Dat het naar de hele toestand kijkt in plaats van naar één wijziging is een
bewuste keuze: **een nieuwe koppeling kan net zo goed een schending opleveren
als een verschoven datum.** Hang je "productie" achter "ontwerp" terwijl
productie al eerder gepland stond, dan hoort daar hetzelfde overzicht bij te
verschijnen. Eén functie dekt allebei de gevallen, en er is geen manier waarop
de twee uit de pas kunnen lopen.

Het scherm draait de functie dus na élke opslag — datums, koppelingen of allebei
— en toont het overzicht alleen als er daadwerkelijk iets zou verschuiven.

De uitkomst is de lijst taken die zouden verschuiven, met oude en nieuwe datums,
en per taak of hij daardoor buiten de datums van zijn project valt.

### Twee knoppen

De taak zelf is al opgeslagen op het moment dat het overzicht verschijnt; wat
nog openstaat is alleen of de keten meeschuift. Het overzicht toont daarom
**alleen deze taak** of **alles verschuiven** — geen derde knop "annuleren",
want er valt op dat moment niets meer te annuleren en een knop die iets anders
belooft dan hij doet is erger dan geen knop.

"Alleen deze taak" is er met opzet: soms wil je de tegenspraak bewust, en dan
licht hij daarna op als "taak begint te vroeg".

## Bewaking

| Signaal | Sterkte | Wanneer |
|---|---|---|
| Taak begint voordat zijn voorganger klaar is | rood | `startDate <= voorganger.endDate` |
| Taak valt buiten de datums van zijn project | rood | project heeft eigen datums en de taak steekt eruit |
| Project loopt uit door zijn eigen taken | rood, op de projectbalk | laatste taakeinde valt na `plannedEnd` |
| Taak is over zijn einddatum | gedempt | `endDate < vandaag` |

Bij elke markering hoort een uitleg bij hover, in gewone taal: *"Begint voordat
'ontwerp' klaar is"*, niet een kleurcode die je moet onthouden.

Het tweede en derde signaal lossen de belofte uit deelproject A in: daar is
bewust toegestaan dat een taak buiten zijn projectdatums valt, met de afspraak
dat B het zou laten oplichten.

## Scherm

**Pijlen** worden getekend als een SVG-laag over de tijdlijnstrook van een
**uitgeklapt** project: een elleboog van de rechterrand van de voorganger naar
de linkerrand van de opvolger. Dat vraagt een vaste rijhoogte, dus die wordt een
constante in plaats van iets dat de inhoud bepaalt. Een dichtgeklapt project
toont geen taken en dus ook geen pijlen. Een geschonden koppeling krijgt een
rode pijl in plaats van een gedempte.

**Koppelingen leg je in het bestaande taakvenster:** een blokje "Wacht op" met
de andere taken van hetzelfde project als aanvinklijst. Taken die een kringloop
zouden sluiten staan er wél bij, maar uitgevinkt en niet aanklikbaar, met de
reden erbij — anders zoek je je wezenloos naar waarom iets niet kan.

## Koppelvlakken

Geen nieuwe routes. Twee bestaande krijgen velden erbij:

| Route | Erbij |
|---|---|
| `PUT /api/project-tasks/[id]` | `dependsOnIds?: string[]` (vervangt de koppelingen van deze taak) en `applyShift?: boolean` |
| `POST /api/projects/[id]/tasks` | `dependsOnIds?: string[]`, zodat een nieuwe taak meteen achter een bestaande kan hangen |

Datums en koppelingen wijzig je in hetzelfde venster, dus ze horen in dezelfde
opslag — anders kan de helft slagen en sta je met een taak die verschoven is
zonder zijn nieuwe koppeling, of andersom.

Bij `applyShift: true` rekent de server de keten **opnieuw** door met zijn eigen
gegevens en schrijft alle verschoven taken in één transactie weg.

De pagina `/planning` haalt de koppelingen mee op en geeft ze door aan het
tijdlijncomponent. Er komt geen ophaalroute bij; na een wijziging ververst het
scherm zichzelf met `router.refresh()`, zoals in A.

## Pure functies

Nieuw bestand `src/lib/task-dependencies.ts` — `planning.ts` is met bijna
driehonderd regels lang genoeg, en dit is een samenhangend geheel op zichzelf.
Tests in `src/lib/task-dependencies.test.ts`.

| Functie | Verantwoordelijkheid |
|---|---|
| `cycleThrough(koppelingen, taakId, wachtOpId)` | De keten die je zou sluiten als je deze koppeling legt, als lijst van taak-id's, of `null`. Levert meteen de tekst voor de foutmelding. |
| `shiftPlan(taken, koppelingen)` | Welke taken verschuiven om alle koppelingen te respecteren, met oude en nieuwe datums. Vooruit wel, achteruit niet. Kijkt naar de hele toestand, niet naar één wijziging. |
| `planningWarnings(project, taken, koppelingen, vandaag)` | Per taak welke markeringen hij krijgt, en of de projectbalk oplicht. |
| `arrowPath(vanGeo, vanRij, naarGeo, naarRij, rijHoogte, breedte)` | De knikpunten van de pijl, zodat het component alleen tekent. |

## Randgevallen

| Geval | Gedrag |
|---|---|
| Koppeling naar een taak van een ander project | Geweigerd, 400, met een Nederlandse melding. |
| Taak wacht op zichzelf | Geweigerd, 400. |
| Koppeling sluit een kringloop | Geweigerd, 400, met de keten in de melding. |
| Dezelfde koppeling twee keer | Unieke sleutel, 409 via `handleError`. |
| Taak met koppelingen verwijderd | Koppelingen verdwijnen mee, in beide richtingen. |
| Taak naar vroeger geschoven | Niets schuift mee; opvolgers krijgen lucht. |
| Taak naar later geschoven zonder opvolgers | Geen overzicht, gewoon opslaan. |
| "Alleen deze taak" gekozen | De keten blijft staan; de schending licht daarna rood op. |
| Verschoven taak valt buiten de projectdatums | Verschuiven mag; het overzicht waarschuwt vooraf en de taak licht daarna op. |
| Project dichtgeklapt | Geen taken en dus geen pijlen in beeld. |
| Taak zonder koppelingen | Precies zoals in A; niets verandert. |
| Nieuwe koppeling levert meteen een schending op | Zelfde overzicht als bij een verschoven datum; `shiftPlan` kijkt naar de hele toestand. |
| Er zit tóch een kringloop in de gegevens | `shiftPlan` breekt af en geeft een lege lijst in plaats van eeuwig door te lussen. Zou niet moeten kunnen — de koppelroute weigert kringlopen — maar een functie die vastloopt op onverwachte gegevens is erger dan een die niets doet. |

## Uitrol

De schemawijziging is additief — één nieuwe tabel, geen kolom verdwijnt — dus in
de gebruikelijke volgorde: `prisma migrate diff` lezen, `db:push` naar de
productiedatabase, en pas daarna de code deployen. De draaiende code merkt niets
van de nieuwe tabel.

## Klaar wanneer

- Een beheerder kan in het taakvenster vastleggen op welke taken een taak wacht,
  en ziet de pijlen tussen de balken van een uitgeklapt project.
- Een kringloop wordt geweigerd met de keten in de melding.
- Een taak naar later verschuiven toont wat er mee zou schuiven, met een
  waarschuwing bij wat buiten de projectdatums valt, en de keuze tussen alleen
  deze taak en de hele keten.
- De vier signalen lichten op zoals in de tabel, met een uitleg bij hover.
- De pure functies zijn gedekt door tests, inclusief de randgevallen hierboven.
- `npx tsc --noEmit` is schoon, `npm run build` geeft exitcode 0 en de volledige
  vitest-suite is groen.
