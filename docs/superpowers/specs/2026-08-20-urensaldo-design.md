# Doorlopend urensaldo met handmatige mutaties

**Datum:** 20-AUG-2026
**Status:** ontwerp vastgesteld, klaar voor een implementatieplan

## Waarom

De loonverwerking berekent overuren per maand als `Math.max(0, gewerkt − target)`
(`src/lib/payroll.ts:45`). Die `Math.max` kapt elk tekort af op nul, en elke maand
staat op zichzelf: juli weet niets van juni. Er is dus geen saldo — alleen een
losse maandwaarde die nooit negatief kan zijn.

Dit ontwerp voegt een doorlopend saldo toe dat wél beide kanten op beweegt, en
de mogelijkheid om er met de hand een mutatie op te doen wanneer uren worden
uitbetaald of ingeruild.

## Wat het onderzoek uitwees

Vier van de zeven "tekorten" in juli 2026 bleken vakantie:

| juli 2026 | gewerkt | verlof | target | zonder verlof | mét verlof |
|---|---|---|---|---|---|
| Arjen | 129 | 56 | 177,1 | −48,1 | **+7,9** |
| Jeroen | 120 | 63 | 177,1 | −57,1 | **+5,9** |
| Merlijn | 99,5 | 48 | 141,7 | −42,2 | **+5,8** |
| Jasper | 74 | 32 | 106,3 | −32,3 | **−0,3** |

Met verlof meegeteld klopt het bijna exact. **Verlof telt daarom mee als "aan je
target voldaan".** Deed het dat niet, dan bouwt iedereen die op vakantie gaat een
tekort op van tientallen uren, en dan meet het saldo vakantie in plaats van
overwerk.

Dat is precies andersom dan in de loonverwerking, die verlof bewust uitsluit
(`src/app/api/payroll/route.ts:52`, met commentaar: "daar gaat het om geld").
Verlof wordt niet als overwerk uitbetaald; voor een urensaldo telt het wel.

Alle vijf de verlofsoorten tellen mee: vakantie, ziekte, bijzonder,
ouderschaps- en onbetaald verlof. Bij onbetaald verlof is dat een keuze en geen
vanzelfsprekendheid: er is afgesproken dat die uren niet gewerkt worden, dus
daar een urenschuld uit laten ontstaan klopt niet.

## Reikwijdte

**Wel:**

- Een beginstand per medewerker op een zelfgekozen peildatum.
- Een doorlopend saldo dat eindeloos doortelt, met tekorten en overschotten.
- Handmatige mutaties voor uitbetalen, inruilen en corrigeren.
- Een opsomming op de medewerkerspagina waarin te zien is hoe het saldo is opgebouwd.

**Niet, en waarom:**

| Buiten scope | Reden |
|---|---|
| De medewerker ziet zijn eigen saldo | Dit is een beheerdersscherm. Wat het team te zien krijgt is een aparte beslissing. |
| Koppeling met de loonverwerking | Uitbetalen blijft een handeling van de beheerder, die hij daarna als mutatie vastlegt. De app boekt niets uit zichzelf. |
| Opgeslagen maandsaldi of een maandelijkse cron | Zie "Afwegingen". |
| Saldo voor nul-urencontracten | Daar is "target" een leeg begrip. De loonverwerking slaat ze nu al over (`payroll.ts:43`); dit doet hetzelfde. |
| Afrekenen per dag op het weekrooster | Slechts 8 van de 13 actieve medewerkers heeft een weekrooster. Per maand werkt voor iedereen. |

## Afwegingen

### Het saldo wordt uitgerekend, niet opgeslagen

Alleen de beginstand en de handmatige mutaties komen in de database; de rest
volgt uit de uren die er al staan.

Het alternatief — per maand een saldoregel wegschrijven — is sneller op te
vragen, maar levert twee waarheden op. In deze app worden uren met terugwerkende
kracht gecorrigeerd; een vastgelegde maand van drie maanden terug klopt dan niet
meer en moet herberekend worden. Met dertien medewerkers en een handvol maanden
is doorrekenen goedkoop.

### Beginstand per medewerker, niet vanaf de eerste geregistreerde uren

De app is in mei 2026 in gebruik genomen en de eerste maanden zijn onvolledig
ingevuld — Arjen staat in juni op één geboekt uur tegen een target van 171,4.
Doorrekenen vanaf het begin levert saldi op die niemand herkent.

Een beginstand per medewerker op een zelfgekozen peildatum laat toe om saldi uit
de oude administratie mee te nemen. Dit is hetzelfde patroon als
`User.vacationOpeningDate` / `vacationOpeningUsed`, dat al bestaat voor de
vakantie-uren.

### De lopende maand telt niet mee

Wie halverwege de maand zit heeft nog niet zijn hele target gewerkt en zou
anders tot de laatste dag tientallen uren in de min staan. De lopende maand komt
apart in beeld als "loopt nog", zonder in het saldo mee te tellen.

## Datamodel

### `User` — twee velden erbij

```prisma
  /// Beginstand van het urensaldo: vanaf welke datum de app zelf doortelt, en
  /// wat er op dat moment al stond. Allebei leeg betekent: geen saldo voor deze
  /// medewerker. Zelfde patroon als vacationOpeningDate/vacationOpeningUsed.
  overtimeOpeningDate  DateTime? @db.Date
  overtimeOpeningHours Decimal?  @db.Decimal(7, 2)
```

De peildatum **moet de eerste van een maand zijn**. Anders is die eerste maand
half en moet er naar rato gerekend worden — een extra regel die alleen vragen
oproept. De server weigert een andere datum.

### `OvertimeAdjustment` — nieuw

```prisma
model OvertimeAdjustment {
  id        String   @id @default(cuid())
  userId    String
  user      User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  date      DateTime @db.Date
  /// Positief of negatief. Uitbetalen is negatief, een correctie kan beide kanten op.
  hours     Decimal  @db.Decimal(7, 2)
  /// Verplicht: een mutatie zonder uitleg is over een half jaar niet meer te plaatsen.
  reason    String
  /// Wie hem heeft ingevoerd. Blijft staan als die persoon later vertrekt.
  createdById String?
  createdAt DateTime @default(now())

  @@index([userId, date])
}
```

Een mutatie is **niet te wijzigen**, alleen toe te voegen en te verwijderen. Zo
ontstaan er geen stille correcties op correcties.

## De berekening

Per maand, vanaf de peildatum tot en met de vórige maand:

```
target       = contracturen × weken in die maand
gerealiseerd = alle geboekte uren van die maand
maandsaldo   = gerealiseerd − target
```

**"Alle geboekte uren" is letterlijk alles**, werk én verlof. In de database is
verlof gewoon een urenregel met een verwijzing naar de verlofaanvraag
(`TimeEntry.absenceRequestId`), dus de som over alle `TimeEntry`-rijen van die
maand is precies wat we willen. Dat is eenvoudiger dan twee sommen bij elkaar
optellen, en het maakt de vraag "welke verlofsoort telt mee" overbodig: ze
tellen allemaal, want ze staan allemaal in dezelfde tabel.

Ter vergelijking: de loonverwerking filtert juist op `absenceRequestId: null`
omdat verlof daar niet als overwerk uitbetaald mag worden. Dat filter hoort daar
en niet hier.

`weken in die maand` is `dagen ÷ 7`, dezelfde formule als
`weeksInMonth` in `src/lib/payroll.ts:24`. Juli komt zo op 4,43 weken uit, niet
op 4; over een jaar telt dat op tot 52,14 weken, wat klopt.

**Saldo** = beginstand + som van de maandsaldi + som van de mutaties.

| Geval | Gedrag |
|---|---|
| Contractwijziging halverwege een maand | Het contract dat aan het eind van die maand geldt telt, zoals `payroll/route.ts:72` het al doet. Eén regel op twee plekken is beter dan twee regels die uiteenlopen. |
| Maand zonder contract | Telt als nul, niet als tekort. Vóór indiensttreding of ná vertrek is er geen target. |
| Nul-urencontract | Geen saldo. |
| Geen peildatum ingevuld | Geen saldo; het scherm toont dat het nog ingesteld moet worden. |
| Peildatum niet op de eerste van een maand | Geweigerd met een Nederlandse melding. |
| Lopende maand | Apart getoond als "loopt nog", telt niet mee in het saldo. |
| Mutatie vóór de peildatum | Toegestaan maar zinloos; hij telt gewoon mee. Het scherm zet hem op zijn datum, dus vóór de beginstand — zichtbaar vreemd, en dat is beter dan hem stilzwijgend weglaten. |

## Scherm

Op de medewerkerspagina onder Personeel, bij de contracten en het
woon-werksjabloon — dezelfde plek waar de beginstand van de vakantie-uren al
staat. Beheerder-only.

Een opsomming in de vorm die het verlofscherm al gebruikt: beginstand, dan per
maand een regel, met de mutaties op hun datum ertussen, en het saldo eronder.
Het woord op die regels is **"geboekt"** en niet "gewerkt": er zit verlof in, en
een kolom "gewerkt" die ook vakantie-uren bevat is een leugen die iemand vroeg of
laat gaat narekenen.

```
Beginstand 01-SEP-2026                            +12,0 u
september 2026   geboekt 180,4 / target 176,9       +3,5 u
oktober 2026     geboekt 174,9 / target 176,9       −2,0 u
15-OKT-2026  uitbetaald bij salaris                −10,0 u
──────────────────────────────────────────────────────────
Saldo                                               +3,5 u
augustus 2026 (loopt nog)  geboekt 120,0 / target 177,1
```

Mutaties voeg je toe met een venstertje: datum, aantal uren met teken, en een
verplichte reden. Verwijderen kan, wijzigen niet.

## Koppelvlakken

| Route | Doel |
|---|---|
| De bestaande medewerkersroute | Twee velden erbij voor de beginstand, net als die van de vakantie-uren. |
| `POST /api/overtime-adjustments` | Een mutatie toevoegen. |
| `DELETE /api/overtime-adjustments/[id]` | Een mutatie verwijderen. |

Beide nieuwe routes zijn beheerder-only en dwingen dat zelf af.

## Pure functies

Nieuw bestand `src/lib/overtime.ts`, tests in `src/lib/overtime.test.ts`.

| Functie | Verantwoordelijkheid |
|---|---|
| `monthsToSettle(peildatum, vandaag)` | De af te rekenen maanden: vanaf de peildatum tot en met de vorige maand. Leeg als de peildatum in de lopende maand valt. |
| `monthTarget(contracturen, jaar, maand)` | De target van één maand, of `null` zonder contract. |
| `overtimeLedger(beginstand, maanden, mutaties, lopendeMaand)` | De opsomming met het lopende saldo, chronologisch geordend. |
| `validateOpeningDate(datum)` | Weigert een peildatum die niet op de eerste van een maand valt, als Nederlandse melding of `null`. |

## Uitrol

Additief — twee nullable kolommen en één nieuwe tabel — dus in de gebruikelijke
volgorde: `prisma migrate diff` lezen, `db:push` naar de productiedatabase, en
pas daarna de code deployen.

## Klaar wanneer

- Een beheerder stelt per medewerker een beginstand met peildatum in, en ziet
  daarna een opsomming waarin per maand te volgen is hoe het saldo loopt.
- Tekorten tellen negatief mee; de lopende maand staat apart en telt niet mee.
- Verlof telt mee als "aan je target voldaan", alle vijf de soorten.
- Handmatige mutaties zijn toe te voegen en te verwijderen, met een verplichte reden.
- Nul-urencontracten en medewerkers zonder peildatum krijgen geen saldo.
- De pure functies zijn gedekt door tests, inclusief de randgevallen hierboven.
- `npx tsc --noEmit` is schoon, `npm run build` geeft exitcode 0 en de volledige
  vitest-suite is groen.
