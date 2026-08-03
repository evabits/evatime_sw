# Ontwerp: activiteiten eruit, factureerbaarheid naar het project

Datum: 2026-08-03
Aanleiding: gebruikersfeedback. Activiteiten verdwijnen; of uren factureerbaar zijn wordt een
eigenschap van het project.

Dit is traject 1 van drie. De andere twee — deelnemers per project, en projecten archiveren en
kopiëren — krijgen elk hun eigen spec en worden pas daarna opgepakt. Kopiëren moet als laatste,
omdat het de instellingen uit traject 1 en 2 moet meenemen.

## Uitgangssituatie

Vandaag bepaalt de **activiteit** of een registratie factureerbaar is. Bij het opslaan
overschrijft `src/app/api/time/route.ts` de meegestuurde vlag met `ActivityType.billable`; een
admin mag in het formulier afwijken, een medewerker niet. De vlag wordt daarna opgeslagen op de
regel zelf (`TimeEntry.billable`, `KmEntry.billable`, `Expense.billable`).

Activiteiten raken 29 bestanden en 129 plekken in `src/`: het urenformulier, het rittenformulier,
de km-sjablonen, het woon-werksjabloon bij personeel, de rapporten, het dashboard en de
factuuropbouw. Die laatste gebruikt de activiteitsnaam als omschrijving van de factuurregel.

Huidige data: 25 projecten (3 gearchiveerd), 222 urenregels waarvan 182 met activiteit, 67
ritten waarvan 51 met activiteit, 30 activiteit-projectkoppelingen, 4 uitgaven.

## Beslissingen

| Onderwerp | Keuze |
|---|---|
| Activiteiten | Verdwijnen volledig, inclusief de koppeling op bestaande regels. Historie verliest die kolom. |
| Bron van factureerbaarheid | Het project, volledig. Geen uitzondering per regel. |
| Bereik | Uren, ritten én uitgaven. |
| Uitgave zonder project | Niet factureerbaar. Er is geen project om het aan te vragen. |
| Omschrijving factuurregel | De projectnaam. |
| Gemengde projecten | De gebruiker kiest per project; de zeven staan hieronder. |
| Uitrol | Expand/contract in vier stappen, geen moment met downtime. |

De 4 al gefactureerde regels zijn niet in gevaar: `InvoiceLine` legt `description`, `unitPrice`
en `total` vast, dus verstuurde facturen veranderen niet mee.

## Deel 1: datamodel

Toevoeging:

```prisma
model Project {
  // ...
  billable Boolean @default(true)
}
```

Verwijderingen:

- `TimeEntry.billable`, `KmEntry.billable`, `Expense.billable`
- `TimeEntry.activityTypeId`, `KmEntry.activityTypeId`, `KmTemplate.activityTypeId`
- `model ActivityType` en `model ActivityTypeProject`, met alle relaties daarnaartoe

## Deel 2: de afleiding

Nieuw bestand `src/lib/billable.ts`, met dezelfde discipline als `resolveHourRate`:

```ts
export function isBillable(entry: {
  project?: { billable: boolean } | null;
}): boolean | null;
```

Drie uitkomsten, en het onderscheid is het punt van deze functie:

| Situatie | Uitkomst | Betekenis |
|---|---|---|
| `entry.project` is een object | `project.billable` | Echt antwoord |
| `entry.project === null` | `false` | Geen project, dus niet factureerbaar |
| `entry.project === undefined` | `null` | **Onbekend** — de relatie is niet meegeladen |

`null` mag nooit als `false` behandeld worden. Vergeet een query zijn `include`, dan zou een
stille `false` omzet uit een rapport laten verdwijnen zonder dat iets klaagt. Aanroepers tonen
`null` zichtbaar, zoals "Geen tarief" dat nu doet, en laten zo'n regel buiten de omzet.

Prisma laat het verschil tussen "relatie niet geselecteerd" (`undefined`) en "relatie leeg"
(`null`) intact, dus dit onderscheid is betrouwbaar.

Consumenten die hun `include` moeten hebben: `GET /api/reports`, de dashboardquery in
`src/app/(app)/page.tsx`, en `GET /api/time` (die voedt de factuuropbouw). De urenlijst op
`/time` toont geen omzet en heeft hem niet nodig.

Drie plekken lezen vandaag `e.billable` rechtstreeks en moeten door `isBillable` heen:

- `src/lib/report-totals.ts` — drie `.filter((e) => e.billable)` in `reportTotals` en drie
  `if (e.billable)` in `groupByEmployee`, voor uren, ritten en uitgaven.
- `src/app/(app)/page.tsx` — de twee `.filter((e) => e.billable)` in de dashboardomzet.
- `src/components/invoices/new-invoice-client.tsx` — het `!e.invoiced && e.billable`-filter dat
  bepaalt welke regels überhaupt op een factuur kunnen belanden. Dat wordt
  `!e.invoiced && isBillable(e) === true`, zodat een `null` er net zo goed buiten valt als een
  `false`: een regel waarvan we het niet weten mag niet gefactureerd worden.

## Deel 3: de UI

**Weg:**

- Het Activiteit-veld uit het urenformulier, het rittenformulier, de km-sjablonen en het
  woon-werksjabloon bij personeel.
- De Activiteit-kolom uit de rapporttabellen en uit het dashboardoverzicht.
- De pagina `/activity-types` en haar menu-item, plus de routes `/api/activity-types`.
- De Factureerbaar-keuze uit de invoerformulieren, ook voor admins.
- De bulkactie Factureerbaar aan/uit op `/reports` — die zet een veld dat niet meer bestaat.

**Nieuw:**

- Een Factureerbaar-schakelaar op het projectformulier, naast de tarieven per werkniveau.
- Een Factureerbaar-kolom in de projectenlijst.

**Gewijzigd:**

- De factuuropbouw groepeert op project plus tarief in plaats van activiteit plus tarief. De
  omschrijving van de factuurregel wordt de projectnaam. Het werkniveau komt er alleen achter
  wanneer één project in meerdere tarieven uiteenvalt — dezelfde regel als nu.
- Het Factureerbaar-filter op `/reports` blijft, maar filtert op het project in plaats van op de
  regel. Bij "niet factureerbaar" moeten uitgaven zonder project meekomen, dus die tak wordt
  `{ OR: [{ project: { billable: false } }, { projectId: null }] }`. Uren en ritten hebben altijd
  een project, dus daar volstaat `{ project: { billable: false } }`.

## Deel 4: de zeven gemengde projecten

Deze projecten hebben vandaag zowel factureerbare als niet-factureerbare boekingen en kunnen er
straks maar één zijn:

| Project | Factureerbaar | Niet factureerbaar |
|---|---|---|
| Horus View and Explore B.V. / Assemblage koffer | 21,00 u | 147,00 u |
| Zonneplan / H3X testen | 11,75 u | 142,50 u |
| EVAbits B.V. / Intern | 22,00 u | 107,25 u |
| EVAjig / Dutch IOT | 23,50 u | 35,00 u |
| EVAjig / DEVjig - EFRO | 14,00 u | 14,50 u |
| EVAjig / gadget | 13,00 u | 7,00 u |
| EVAjig / AUTOjig | 3,50 u | 9,00 u |

De gebruiker levert per project de gewenste waarde aan bij stap 2 van de uitrol. Die keuzes horen
niet in deze spec: het zijn bedrijfsbeslissingen, geen ontwerpbeslissingen.

Voor de twee met een kleine factureerbare minderheid — Horus en H3X testen — is er een uitweg
zonder verlies: factureer die uren eerst, en zet het project daarna op niet-factureerbaar. Een
gefactureerde regel ligt vast in `InvoiceLine` en verandert niet mee.

## Deel 5: uitrol in vier stappen

De vorige batch ging plat doordat code en schema tegelijk veranderden. Dit traject vermijdt dat.

1. **Toevoegen.** `Project.billable` erbij, verder niets weg. De draaiende code merkt er niets van.
2. **Vullen.** Een script zet per project de waarde: alles-factureerbaar → `true`,
   alles-niet-factureerbaar → `false`, leeg → `true`, en de zeven gemengde uit de opgave van de
   gebruiker. Het script is herhaalbaar zonder schade.
3. **Deployen.** De nieuwe code leest uit het project en kent geen activiteiten meer. De oude
   kolommen bestaan nog maar worden niet gelezen.
4. **Opruimen.** Nu pas de kolommen en de twee activiteitentabellen laten vallen.

Tussen elke stap draait de site. Vóór elke `db:push` wordt `prisma migrate diff` gedraaid en de
volledige lijst met te vervallen kolommen getoond, zodat er niets onverwachts verdwijnt.

## Testen

Volgens het patroon van de repo: pure functies in `src/lib/` met vitest, geen component- of
API-tests.

`src/lib/billable.test.ts`:

- Project geladen en factureerbaar → `true`.
- Project geladen en niet factureerbaar → `false`.
- `project: null` (uitgave zonder project) → `false`.
- `project` ontbreekt in het object → `null`, niet `false`.
- Een `null`-uitkomst telt niet als factureerbaar bij de aanroepers.

`src/lib/report-totals.test.ts` uitbreiden: de omzet vereist voortaan een factureerbaar project
én een bepaalbaar tarief. Een regel waarvan het project niet is meegeladen telt niet mee in de
omzet en wordt zichtbaar gemarkeerd.

Handmatig na te lopen:

- Een project op niet-factureerbaar zetten en zien dat al zijn uren uit de omzet verdwijnen,
  zowel in het rapport als op het dashboard.
- Een factuur opstellen en controleren dat de regels op projectnaam gegroepeerd zijn.
- Controleren dat een al verstuurde factuur zijn oorspronkelijke omschrijvingen en bedragen houdt.
- Het Factureerbaar-filter op `/reports` in beide standen, en controleren dat een uitgave zonder
  project onder "niet factureerbaar" valt.

## Buiten scope

- Deelnemers per project, en het afdwingen wie op een project mag schrijven. Traject 2.
- Projecten archiveren en kopiëren. Traject 3.
- Het opnieuw indelen van bestaande uren over nieuwe projecten. Dat doet de gebruiker zelf in de
  app; deze migratie verplaatst niets.
- Kilometertarieven en de km-tariefketen.
