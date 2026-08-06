# Een aangevraagd conceptproject samenvoegen met een bestaand project

**Datum:** 2026-08-06

## Waarom

Een medewerker die op een project wil boeken dat nog niet bestaat, maakt via het
urenformulier een conceptproject aan: een naam, hijzelf als enige deelnemer, en
daarna zijn uren. Vaak blijkt dat werk te horen bij een project dat al bestaat.
Nu is er geen weg terug — de uren staan op een conceptproject dat naast het
echte project blijft staan.

In productie zijn dat er zeven, allemaal met één deelnemer en één of twee
urenregels, zonder klant, tarieven of tags, en zonder ook maar één gefactureerde
regel.

## Waar het zit en wie het mag

Een actie op de projectenrij in `/projects`, alleen zichtbaar bij status
`CONCEPT`. Die pagina redirect niet-admins al weg, dus admin-only volgt daaruit
— en dat is nodig, want deze handeling verplaatst geboekte uren.

De knop opent een dialoog met één keuze: het doelproject. Die keuzelijst toont
de niet-gearchiveerde projecten behalve de bron zelf — de lijst die het scherm
al in handen heeft.

**De route wordt `POST /api/projects/[id]/merge`,** met het doelproject in de
body. Een eigen endpoint en geen veld op `PUT /api/projects/[id]`: dat is een
formulier-opslag die velden bijwerkt, terwijl dit een handeling is die
registraties verplaatst en het project daarna opheft. Die twee door één schema
laten lopen maakt allebei moeilijker te lezen, en de weigeringen van de een
zeggen niets over de ander.

## De regels

Naast het bestaande `projectCreateDenialReason` komt
`projectMergeDenialReason` in `src/lib/projects.ts`, met dezelfde vorm: een
reden als string, of `null` wanneer het mag.

- **De bron moet bestaan, `CONCEPT` zijn en niet gearchiveerd.** Dit wordt
  bewust geen algemene samenvoegtool. Twee echte projecten samenvoegen raakt
  facturatie, tarieven en klantkoppelingen, en is een ander gesprek.
- **Het doel moet bestaan, niet gearchiveerd zijn, en niet de bron zelf.**
- **Is er ook maar één urenregel, kilometer of uitgave gefactureerd, dan
  weigert hij.** Een factuurregel die na het samenvoegen naar een ander project
  verwijst, is niet uit te leggen aan wie die factuur controleert.

Het doel mag zelf ook een conceptproject zijn. Twee mensen die hetzelfde
aanvragen is een reëel geval, en er is geen reden dat te verbieden.

## Wat er verhuist

Vier `updateMany`'s die `projectId` omzetten van de bron naar het doel:

| Wat | Model |
|---|---|
| Urenregels | `TimeEntry` |
| Kilometers | `KmEntry` |
| Km-sjablonen | `KmTemplate` |
| Uitgaven | `Expense` |

Plus het deelnemerschap: elke deelnemer van de bron wordt deelnemer van het
doel, met `skipDuplicates`. De sleutel van `ProjectMember` is
`[projectId, userId]`, dus zonder dat loopt het stuk zodra de aanvrager al
deelnemer van het doel was — precies het geval dat deze functie moet afvangen.

Alle deelnemers gaan mee, niet alleen de aanvrager. In de praktijk is dat
dezelfde persoon, maar een admin kan er iemand bij gezet hebben, en die zou
anders zijn boekrecht verliezen.

**Aan de registraties zelf verandert niets** — niet de eigenaar, niet de datum,
niet het aantal uren. Alleen het project eronder wisselt.

## De transactie, en het verwijderen

Verhuizen en verwijderen horen in één transactie. Klapt het verwijderen eruit,
dan moeten de uren terug bij de bron staan en niet half verplaatst zijn.

Het verwijderen is bovendien een vangnet dat we cadeau krijgen. `TimeEntry`,
`KmEntry` en `KmTemplate` hebben een verplichte projectkoppeling zonder
`onDelete`, wat in Prisma neerkomt op `Restrict`: blijft er één achter, dan
weigert de database het verwijderen en rolt de hele transactie terug.

**`Expense` is de uitzondering en de reden dat hij expliciet in het rijtje
staat.** Zijn `projectId` is optioneel, dus daar geldt `SetNull`: een
achtergebleven uitgave zou het verwijderen niet blokkeren maar stilletjes zijn
projectkoppeling verliezen. Hij staat er dus niet in omdat de huidige data hem
bevat — die bevat hem niet — maar omdat hij de enige is die stil faalt.

## Wat verdwijnt

De niveautarieven (`ProjectLevelRate`) en tags van het conceptproject cascaden
mee met het verwijderen. In de praktijk zijn ze altijd leeg: een medewerker mag
ze op een conceptproject niet eens zetten, wat `projectCreateDenialReason` al
afdwingt. Maar ze verhuizen niet mee, en dat is opzet — het doelproject houdt
zijn eigen tarieven, klant en factureerbaarheid. De bron legt niets op.

## Testbaarheid

`projectMergeDenialReason` is puur en krijgt tests in
`src/lib/projects.test.ts`, naast die van zijn buurman. Dat is de plek waar een
fout het duurst is, want hij bewaakt of gefactureerde regels verplaatst mogen
worden. Minstens: een bron die geen concept is, een gearchiveerde bron, een
gearchiveerd doel, bron en doel gelijk, een ontbrekende bron of doel, elk van de
drie soorten gefactureerde regels, en het geval waarin alles mag.

De vier `updateMany`'s en de transactie zijn routewerk; deze repo test
uitsluitend pure functies. Verificatie daarvan is `npx tsc --noEmit`, de
bestaande suite, en met de hand nalopen.

## Uitrol

Geen migratie, geen schemawijziging, geen backfill. Pushen naar `main` volstaat.

Handmatig na te lopen na de deploy:

- [ ] Een conceptproject met twee urenregels samenvoegen met een actief project
      → de twee regels staan in `/time` onder het doelproject, op naam van
      dezelfde medewerker, met dezelfde datums en uren; het conceptproject is
      uit de projectenlijst verdwenen.
- [ ] De aanvrager staat daarna als deelnemer op het doelproject.
- [ ] Hetzelfde doen wanneer de aanvrager al deelnemer van het doel was → geen
      fout, en hij staat er één keer in.
- [ ] Bij een actief project is er geen samenvoegknop.
- [ ] Een conceptproject waarvan een urenregel gefactureerd is → geweigerd, en
      er is niets verplaatst.
- [ ] Het lege conceptproject `productie`, zonder deelnemers en zonder uren,
      samenvoegen → werkt, en verdwijnt.
