# Verlof intrekken, en verlof beheren namens een medewerker

**Datum:** 2026-08-06

## Waarom

Een goedgekeurde verlofaanvraag staat vast. Wie zijn vakantie afzegt kan hem niet
kwijt, en zijn saldo blijft opgesoupeerd. En een admin die verlof voor iemand
anders wil vastleggen — een ziekmelding, of verlof dat mondeling is afgesproken —
kan dat alleen door bij die medewerker in te loggen.

Drie dingen dus: intrekken, aanmaken namens een ander, en wijzigen namens een
ander.

## Het datamodel

`CANCELLED` erbij in de enum `AbsenceStatus`, naast `PENDING`, `APPROVED` en
`REJECTED`. Verder verandert er niets: geen kolommen, geen tabellen, geen
backfill. Bestaande rijen houden hun status.

Een eigen status en niet hergebruik van `REJECTED`, omdat "de admin weigerde" en
"de medewerker trok terug" verschillende dingen zijn die je later uit elkaar wilt
kunnen houden. En niet gewoon verwijderen, omdat een aanvraag die spoorloos
verdwijnt een admin geen enkele aanwijzing laat over waar die week gebleven is.

## De regelgeneratie wordt gedeeld

Vandaag staat "welke urenregels levert deze aanvraag op" in één tak van
`PUT /api/absence-requests/[id]`, de goedkeuringstak. Na deze wijziging hebben
drie plekken hem nodig:

1. een admin die een aanvraag aanmaakt (die is meteen goedgekeurd),
2. het goedkeuren zelf,
3. een admin die een al goedgekeurde aanvraag wijzigt.

Die logica gaat daarom naar een pure functie in `src/lib/absence-entries.ts`. Hij
bepaalt de werkdagen in de periode, kiest tussen het weekpatroon en de gelijke
verdeling, en geeft de twee bestaande weigeringen terug **als resultaat in plaats
van als HTTP-antwoord**:

- `Deze periode bevat geen werkdagen`
- `Deze periode bevat geen dagen die op het patroon passen`

Het opzoeken van het verlofproject blijft in de route staan, want dat is een
databasevraag en geen rekenwerk. De weigering die daarbij hoort —
`Het project "<naam>" bestaat nog niet` — blijft dus ook waar hij nu staat.

Dit is de kern van het ontwerp: drie aanroepers die dezelfde regels genereren
kunnen niet uiteenlopen, en de rekenkant wordt testbaar zonder database.

## Intrekken

Een eigen tak op `PUT /api/absence-requests/[id]`, herkenbaar aan een body die
alleen `{ "action": "cancel" }` bevat. Bewust niet `{ "status": "CANCELLED" }`
via het bestaande `adminUpdateSchema`: die tak is admin-only en gaat over
beoordelen, terwijl intrekken juist iets is wat de medewerker zelf doet. Ze door
elkaar halen zou betekenen dat de rechtencontrole van het beoordelen versoepeld
moet worden, en dat is precies de controle die je niet wilt aanraken.

De tak zet de status op `CANCELLED` en verwijdert de urenregels van de aanvraag.
Dat verwijderen is geen nieuwe machinerie: de bestaande transactie doet al
verwijderen-en-opnieuw-maken, waarbij elke status behalve `APPROVED` neerkomt op
alleen verwijderen. Intrekken valt daar vanzelf onder.

**Wie mag het:**

| | Mag intrekken |
|---|---|
| Medewerker, eigen aanvraag, startdatum in de toekomst | ja |
| Medewerker, eigen aanvraag, loopt of is voorbij | nee |
| Medewerker, andermans aanvraag | nee |
| Admin | altijd, ook met terugwerkende kracht |

**"In de toekomst" betekent: de startdatum ligt ná vandaag.** Verlof dat vandaag
begint telt dus als lopend, niet als toekomstig — die dag is al bezig. De
vergelijking gaat in UTC met `YYYY-MM-DD`-strings, zoals overal in deze codebase,
omdat de server op UTC draait en de gebruikers in Amsterdam zitten; lokaal
rekenen verschuift de grens een dag zonder dat iets klaagt.

De grens ligt op de startdatum omdat een urenoverzicht en een loonrun de
gegenereerde regels lezen. Een medewerker mag niet in zijn eentje uren weghalen
die daar al in meegeteld hebben; een admin moet dat wél kunnen, want fouten
moeten te herstellen zijn.

Het saldo hoeft niets te weten van deze status. Het telt alleen `APPROVED`, dus
een ingetrokken aanvraag valt er vanzelf uit.

## Aanmaken namens een medewerker

`POST /api/absence-requests` krijgt een optioneel `userId`. Dat wordt afgehandeld
met `resolveEntryUserId` uit `src/lib/entry-owner.ts` — de bestaande helper die
`/api/time` hier al voor gebruikt, en die het veld negeert zodra de aanvrager
geen admin is. Een medewerker kan dus niets voor een ander aanmaken, ook niet
door zelf een `userId` mee te sturen.

**Eén regel, zonder uitzonderingen: maakt een admin een aanvraag aan, dan krijgt
hij status `APPROVED` en worden de urenregels meteen gegenereerd.**

Dat geldt ook wanneer een admin verlof voor zichzelf invoert, wat vandaag nog op
`PENDING` uitkomt. Dat is een bewuste gedragswijziging: de admin is de
goedkeurder, dus een tussenstap waarin hij zijn eigen invoer nog moet goedkeuren
voegt niets toe. De alternatieve regel — onderscheid maken tussen "voor zichzelf"
en "voor een ander" — levert twee paden op waar één volstaat.

## Wijzigen namens een medewerker

Bij `PUT` mag een admin élke aanvraag wijzigen, ongeacht wie hem indiende en
ongeacht de status. De medewerker houdt zijn huidige grens: alleen zijn eigen
aanvraag, alleen zolang die `PENDING` is.

Wijzigt een admin een aanvraag die al `APPROVED` is, dan **blijft de status
staan en worden de urenregels opnieuw gegenereerd** uit de nieuwe datums, uren en
patroon. Zonder dat zou de tijdlijn stilzwijgend uit de pas lopen met de
aanvraag, en dat is precies de fout die dit ontwerp wil voorkomen.

## Het scherm

In `src/components/vacation/absence-client.tsx`:

- De medewerkerspicker die het budgetdialoog al heeft, komt ook in het
  aanvraagdialoog, alleen zichtbaar voor admins. De `users`-prop staat er al.
- Een knop **Intrekken** bij goedgekeurd verlof: bij de medewerker alleen als de
  startdatum in de toekomst ligt, bij de admin altijd.
- De bewerkknop wordt voor admins zichtbaar op elke aanvraag, in plaats van
  alleen op de eigen `PENDING`.
- De statusbadge krijgt een variant voor `CANCELLED` met het label
  `Ingetrokken`. **Dit is geen cosmetisch detail:** de huidige badge-functie
  behandelt `APPROVED` en `REJECTED` expliciet en laat al het andere in de
  `PENDING`-tak vallen, dus zonder deze toevoeging krijgt een ingetrokken
  aanvraag het label `In afwachting` — het tegenovergestelde van wat er waar is.

## Wat er bewust niet in zit

- **Geen reden-veld bij het intrekken.** Niemand heeft erom gevraagd, en een
  verplicht tekstveld bij een handeling die vaak "toch niet" betekent is
  wrijving zonder opbrengst.
- **Geen wijzigingshistorie.** `reviewedBy` en `reviewedAt` blijven doen wat ze
  doen: wie er als laatste op de aanvraag heeft gehandeld, en wanneer.
- **Geen controle op `invoiced` bij het verwijderen van urenregels.** De
  verwijder-en-hermaak-machinerie kijkt daar vandaag ook niet naar.
  Verlofprojecten staan op niet-factureerbaar, dus die regels horen nooit op een
  factuur te belanden. Een controle toevoegen is een eigen afweging en hoort niet
  bij dit traject.

## Testbaarheid

De nieuwe functie in `src/lib/absence-entries.ts` is puur en krijgt tests in
`src/lib/absence-entries.test.ts`, conform de conventie dat alleen pure functies
getest worden. Minstens: een periode zonder werkdagen, een periode waarin geen
dag op het patroon past, een aanvraag met patroon, een aanvraag zonder patroon,
en de eis dat de som van de regels gelijk is aan wat de aanvraag opgeeft.

De rechtenregels rond intrekken — mag deze gebruiker deze aanvraag intrekken,
gegeven zijn rol, het eigenaarschap en de startdatum — zijn eveneens pure logica
en horen als eigen functie met eigen tests, naar het voorbeeld van
`checkEntryMutation` in `src/lib/entry-owner.ts`. Dat is de plek waar een fout
het duurst is, want daar zit het verschil tussen "een medewerker herstelt zijn
eigen vergissing" en "een medewerker haalt uren weg die al uitbetaald zijn".

De rest is routewerk en formuliertoestand; daar heeft deze repo geen testvorm
voor. Verificatie is `npx tsc --noEmit`, de bestaande suite, en met de hand
nalopen.

## Uitrol

Eén additieve migratie, en die moet **vóór** de code live staan: draaiende code
die `CANCELLED` nog niet kent heeft geen last van een enumwaarde die niemand
gebruikt, maar nieuwe code die de waarde wegschrijft naar een database die hem
niet kent, faalt. Dus eerst `prisma migrate diff` lezen, dan `db:push`, dan
deployen.
