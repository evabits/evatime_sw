# Ontwerp: verlofaanvraag met een weekpatroon

Datum: 2026-08-05
Aanleiding: gebruikersfeedback. Een verlofaanvraag moet een weekpatroon kunnen dragen — bijvoorbeeld
elke woensdag ouderschapsverlof van 11 januari 2026 tot 10 januari 2027 — met de uren per weekdag,
net als het weekrooster.

Dit bouwt voort op twee eerdere trajecten: goedgekeurde afwezigheid levert sinds kort urenregels op
een verlofproject op, en er bestaat een `WorkSchedule` met uren per weekdag.

## Uitgangssituatie

`AbsenceRequest` draagt `startDate`, `endDate` en **één totaal** `hours` voor de hele periode
(`prisma/schema.prisma`). Het aanvraagformulier rekent dat totaal zelf uit met
`countWorkingHours(start, eind, weeklyHours)` (`src/components/vacation/absence-client.tsx:182-187`).

Bij goedkeuring genereert `PUT /api/absence-requests/[id]` één urenregel per **werkdag** in de
periode, met het totaal gelijk verdeeld via `splitHoursOverDays`. De aanvraag uit de aanleiding zou
vandaag dus ~260 regels opleveren over elke werkdag van het jaar, in plaats van 52 woensdagen.

`src/lib/work-schedule.ts` bevat al `type WeekSchedule` met vijf weekdagvelden, plus
`scheduledHoursOn`, `weekTotal` en `toWeekSchedule`. `src/lib/working-days.ts` bevat
`workingDaysBetween`.

Huidige data: **7 aanvragen in productie, allemaal `VACATION` en `APPROVED`.**

## Beslissingen

| Onderwerp | Keuze |
|---|---|
| Optioneel | **Ja.** Zonder patroon verandert er niets. Het vinkje staat standaard uit. |
| Opslag | Een eigen tabel `AbsencePattern`, één rij per aanvraag of geen. |
| Type | Hergebruik van `WeekSchedule`; geen tweede rekenmodule. |
| De uurvelden | Beginnen leeg. Geen voorvulling uit het weekrooster of uit `weeklyHours`. |
| Het totaal | **Afgeleid op de server** zodra er een patroon is. |
| Toetsen aan het weekrooster | Niet. |
| Maximum aantal regels | Geen. Het aantal staat vóór het opslaan op het scherm. |

## Deel 1: het datamodel

```prisma
model AbsencePattern {
  absenceRequestId String         @id
  absenceRequest   AbsenceRequest @relation(fields: [absenceRequestId], references: [id], onDelete: Cascade)
  monday    Decimal @db.Decimal(4, 2)
  tuesday   Decimal @db.Decimal(4, 2)
  wednesday Decimal @db.Decimal(4, 2)
  thursday  Decimal @db.Decimal(4, 2)
  friday    Decimal @db.Decimal(4, 2)
}
```

Op `AbsenceRequest` komt `pattern AbsencePattern?`.

**Geen vijf nullable kolommen op `AbsenceRequest`.** Dan zou "alle vijf leeg" niet te onderscheiden
zijn van "geen patroon", en precies dat onderscheid draagt het ontwerp. Een rij bestaat of bestaat
niet — dezelfde discipline als bij `ProjectMember` en `WorkSchedule`, die er allebei goed uitpakte.

`onDelete: Cascade`: verdwijnt de aanvraag, dan verdwijnt het patroon mee.

De vijf velden zijn verplicht en niet nullable, om dezelfde reden als bij `WorkSchedule`: een dag
leeg laten is dubbelzinnig. Nul is nul.

**De vorm is identiek aan `WeekSchedule`**, dus `toWeekSchedule`, `scheduledHoursOn` en `weekTotal`
uit `src/lib/work-schedule.ts` werken er ongewijzigd op. Er komt geen tweede rekenmodule.

## Deel 2: de generatie

Eén nieuwe pure functie in `src/lib/absence-entries.ts`, naast `splitHoursOverDays`:

```ts
export function patternedEntries(
  pattern: WeekSchedule,
  days: string[],
): Array<{ date: string; hours: number }>;
```

Per dag de uren uit het patroon; dagen met nul uur vallen weg. Weekenddagen die per ongeluk in
`days` zitten vallen ook weg, want `scheduledHoursOn` geeft daar altijd 0.

In de admintak van `PUT /api/absence-requests/[id]` komt een tak bij, ná het bepalen van de
werkdagen:

- **Met patroon:** `patternedEntries(patroon, dagen)`.
- **Zonder patroon:** `splitHoursOverDays(Number(existing.hours), dagen)` — ongewijzigd.

De rest van die handler blijft zoals hij is: het verlofproject opzoeken, verwijderen-en-opnieuw-
maken in één transactie, en elke andere status verwijdert de regels.

Levert een patroon nul regels op — de periode bevat geen enkele dag die erop past — dan weigert de
goedkeuring met `Deze periode bevat geen dagen die op het patroon passen`, status 400, naar het
model van de bestaande `Deze periode bevat geen werkdagen`.

## Deel 3: het totaal wordt afgeleid

Zodra er een patroon is, berekent de **server** `hours` als de som van de gegenereerde regels en
negeert wat de client meestuurde.

Dat moet server-side. Mag de client een totaal opgeven dat niet overeenkomt met wat er gegenereerd
wordt, dan lopen het vakantiesaldo, de lijst met aanvragen en de tijdlijn uit elkaar zonder dat
iets klaagt — en het saldo is de plek waar dat pas maanden later opvalt.

De afleiding gebeurt bij **aanmaken en bijwerken** van de aanvraag, niet pas bij goedkeuring: het
totaal staat in de lijst en telt mee in het saldo zodra de aanvraag bestaat, ook als hij nog in
behandeling is.

Een patroon waarvan de vijf waarden optellen tot nul wordt geweigerd met
`Een patroon van alleen nullen levert geen verlofdagen op`. Zo'n patroon zou een aanvraag van nul
uur opleveren, en `hours` is elders in de app een positief getal.

**Het formulier rekent vandaag zelf een totaal uit** uit de datumperiode en de weekuren
(`countWorkingHours`). Die berekening moet uitgeschakeld zijn zolang het vinkje aan staat, anders
overschrijft hij het afgeleide getal zodra je een datum aanraakt.

## Deel 4: de API-vorm

`pattern` wordt een optioneel veld op zowel `createSchema` (`POST /api/absence-requests`) als
`employeeUpdateSchema` (`PUT /api/absence-requests/[id]`):

```ts
pattern: z.object({
  monday: z.number().min(0).max(24),
  tuesday: z.number().min(0).max(24),
  wednesday: z.number().min(0).max(24),
  thursday: z.number().min(0).max(24),
  friday: z.number().min(0).max(24),
}).nullable().optional(),
```

`null` én ontbrekend betekenen allebei **geen patroon**, en bij bijwerken verdwijnt een bestaand
patroon dan.

Dat wijkt bewust af van de `*Known`-discipline bij `levelRates` en `memberIds`, waar een ontbrekend
veld "niet aanraken" betekent. Die guard bestaat daar omdat meerdere schermen dezelfde route
aanroepen en er één was die het veld niet meelaadde. Hier is dat niet zo: het afwezigheidsdialoog
is de enige client, het laadt de aanvraag altijd volledig inclusief patroon, en de goedkeuringstak
(`{ status }`) loopt door een compleet andere vertakking die het patroon niet aanraakt. Een
ontbrekend veld kan hier dus alleen "de gebruiker heeft het vinkje uit staan" betekenen.

De admintak van `PUT` — goedkeuren en afkeuren — raakt het patroon niet aan.

## Deel 5: het formulier

In het aanvraagdialoog een vinkje **Herhaald per week**, standaard **uit**.

Uit: het formulier is exact wat het nu is.

Aan: vijf uurvelden verschijnen — Ma, Di, Wo, Do, Vr — allemaal leeg, en daaronder één regel:

> 52 dagen, 416,00 uur in totaal

Die regel is het belangrijkste van dit scherm. Een periode van een jaar met een patroon over vijf
dagen levert ruim 250 urenregels op, en je hoort te zien wat je vraagt vóórdat je het vraagt, niet
erna in je urenlijst. Het aantal wordt in de client berekend met dezelfde functies als de server
gebruikt, zodat het getal dat je ziet het getal is dat je krijgt.

Bij het openen van een bestaande aanvraag staat het vinkje aan wanneer die een patroon heeft, met
de waarden ingevuld.

## Deel 6: wat er niet verandert

**De eenvoudige weg blijft de standaard.** Vinkje uit is het huidige formulier, de huidige
berekening, de huidige generatie. De 7 bestaande aanvragen in productie hebben geen patroon en
gedragen zich ongewijzigd. Er is geen backfill.

**Het patroon wordt niet aan het weekrooster getoetst.** Vraag je verlof op een dag waarop je niet
werkt, dan krijg je die regels gewoon. De uurvelden beginnen leeg omdat de gebruiker ze zelf wil
bepalen; dan hoort de app niet halverwege alsnog tegen te spreken.

**Afkeuren, terugdraaien en verwijderen** lopen via de weg die er al ligt: verwijder alles wat aan
de aanvraag hangt en maak het opnieuw. Een gewijzigd patroon komt daarmee vanzelf goed.

**Het vakantiesaldo** telt een patroonaanvraag van het type Vakantie mee met zijn afgeleide totaal,
zoals elke andere aanvraag. Ouderschapsverlof raakt het saldo niet; dat was al zo.

## Testen

Volgens het patroon van de repo: pure functies in `src/lib/` met vitest, geen component- of
API-tests.

`src/lib/absence-entries.test.ts` uitbreiden voor `patternedEntries`, met
`WOENSDAG = { monday: 0, tuesday: 0, wednesday: 8, thursday: 0, friday: 0 }` en
`MA_WO = { monday: 4, tuesday: 0, wednesday: 4, thursday: 0, friday: 0 }`:

- Eén werkweek (ma 2026-08-03 t/m vr 2026-08-07) met `WOENSDAG` → één regel op 2026-08-05, 8 uur.
- Diezelfde week met `MA_WO` → twee regels, op 2026-08-03 en 2026-08-05, elk 4 uur.
- Twee werkweken (2026-08-03 t/m 2026-08-14) met `WOENSDAG` → twee regels, op 2026-08-05 en
  2026-08-12.
- Dagen waarop het patroon nul staat komen niet in de uitkomst voor.
- Een lege dagenlijst → lege uitkomst.
- Een zaterdag (2026-08-08) in de dagenlijst wordt overgeslagen, ook wanneer het patroon niet leeg
  is.
- Een patroon van alleen nullen over een volle week → lege uitkomst.
- De som van de uitkomst is het aantal passende dagen × de uren van die dag.

De weekdagen: 2026-08-03 en 2026-08-10 zijn maandagen, 2026-08-05 en 2026-08-12 woensdagen,
2026-08-07 en 2026-08-14 vrijdagen, 2026-08-08 een zaterdag. Nagerekend tegen de kalender.

Handmatig na te lopen:

- Een gewone aanvraag zonder vinkje: het formulier, het berekende totaal en de gegenereerde regels
  zijn onveranderd.
- Elke woensdag 8 uur van 11 januari 2026 tot 10 januari 2027 → het scherm meldt **52 dagen en
  416,00 uur** vóór het opslaan. Die twee getallen zijn nagerekend tegen de kalender; wijkt het
  scherm ervan af, dan klopt de telling niet. Merk op dat 11 januari 2026 een zondag is: een periode
  hoeft niet op een werkdag te beginnen, en de eerste woensdag is 14 januari.
- Goedkeuren → 52 urenregels, allemaal op woensdag, allemaal 8 uur, allemaal op Ouderschapsverlof.
- Afkeuren → alle 52 verdwijnen.
- Het patroon wijzigen naar maandag en woensdag en opnieuw goedkeuren → de regels schuiven mee
  zonder dubbelingen.
- Een patroon van alleen nullen → weigering met de reden.
- Een periode van maandag tot dinsdag met een woensdagpatroon → weigering met de reden.
- Het vinkje uitzetten bij een bestaande patroonaanvraag → het patroon verdwijnt en het totaal is
  weer met de hand in te vullen.
- Een patroonaanvraag van het type Vakantie → het afgeleide totaal gaat van het saldo af.

## Uitrol

1. `prisma migrate diff` draaien en de volledige lijst lezen — er hoort alleen één tabel bij te
   komen.
2. `npm run db:push`.
3. Deployen.

Geen backfill, niets wordt verwijderd. Zolang niemand het vinkje aanzet verandert er niets.

## Buiten scope

- Een patroon om de week, of een patroon dat binnen de periode wisselt.
- Voorvullen van de uurvelden uit het weekrooster of uit `weeklyHours`.
- Het patroon toetsen aan het weekrooster van de medewerker.
- Een maximum op het aantal gegenereerde regels.
- Feestdagen. Die staan nergens in de app en worden ook hier niet overgeslagen.
- Het bestaande totaal van een aanvraag zonder patroon anders berekenen.
