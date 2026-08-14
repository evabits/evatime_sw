# Contract dupliceren

**Datum:** 2026-08-14

## Het probleem

Een opvolgend contract lijkt bijna altijd op zijn voorganger: hetzelfde type,
dezelfde uren, dezelfde functie, vaak hetzelfde salaris. Vandaag moet dat veld
voor veld opnieuw ingetypt worden, met de kans dat er eentje anders uitvalt dan
bedoeld.

## Het ontwerp

### 1. De knop

Naast het potlood en de prullenbak in de contracttabel komt een kopieerknop per
regel. Die opent dezelfde dialoog als "Contract toevoegen" — de dialoog kan al
met willekeurige beginwaarden openen, dus er komt geen tweede formulier bij.

De titel wordt "Contract dupliceren". De dialoog kent daarmee drie toestanden:
toevoegen (leeg), bewerken (bestaand contract, PUT) en dupliceren (gevuld, maar
POST).

Overgenomen worden: contracttype, contracturen per week, vakantie-uren per
jaar, maandsalaris, uursalaris, functie, FTE-percentage en notities. Bijlagen
gaan niet mee: een scan van het oude contract is niet het nieuwe contract.

### 2. De datums

De begindatum van het nieuwe contract volgt uit het oude: de einddatum van het
bron-contract plus één dag. Dat veld toont die datum maar wordt niet getypt.
De einddatum van het nieuwe contract blijft leeg.

Heeft het bron-contract nog geen einddatum, dan vraagt de dialoog daar bovenaan
om, in een veld "Einddatum bestaand contract". Zolang dat leeg is, is opslaan
geblokkeerd; zodra het ingevuld is verschijnt de berekende begindatum eronder.
Elf van de veertien contracten hebben vandaag geen enkele datum, dus dit is de
gewone gang van zaken en niet de uitzondering.

Dat veld hoort bij het bron-contract en niet bij het nieuwe, dus het zit niet
in het zod-schema van het formulier maar in een eigen stukje state. Het schema
beschrijft één contract; er twee in proppen zou het formulier troebel maken.

### 3. Opslaan

Twee stappen, allebei door routes die er al zijn:

1. `PUT /api/contracts/<bron-id>` met de bestaande waarden van het
   bron-contract en de einddatum erbij. Had het bron-contract die al, dan
   vervalt deze stap — er is dan niets aan te passen.
2. `POST /api/contracts` met de waarden uit het formulier en de berekende
   begindatum.

Zo blijven salarisaanvulling (`fillSalary`) en de validatie in
`contractBodySchema` vanzelf gelden, en komt er geen route bij die hetzelfde
nog eens doet.

Mislukt stap 2, dan staat de einddatum al wel op het bron-contract. Dat is geen
schade — de einddatum was hoe dan ook de bedoeling — maar de foutmelding zegt
het erbij, zodat duidelijk is wat er al wél gebeurd is voordat je het opnieuw
probeert.

### 4. De overlapwaarschuwing

De bestaande waarschuwing "deze periode overlapt met een bestaand contract"
blijft ongemoeid. Bij een correcte opvolging zwijgt hij vanzelf, want dag+1
overlapt niet. Verzet je de begindatum met de hand naar iets wat wél overlapt,
dan verschijnt hij weer.

## Wat er verandert in de code

- `src/lib/contracts.ts` — een pure functie `nextDay(date: string): string` die
  van `YYYY-MM-DD` de volgende kalenderdag maakt, in UTC gerekend zoals alle
  datumcode hier. Geen werkdaglogica: een contract mag op elke dag beginnen.
- `src/lib/contracts.test.ts` — testen daarvan.
- `src/components/personeel/contracts-client.tsx` — de kopieerknop, de derde
  dialoogtoestand, het veld voor de einddatum van het bron-contract, de
  berekende begindatum en het opslaan in twee stappen.

Geen schemawijziging, dus geen migratie. Geen nieuwe API-route.

## Testen

Pure functie, in `src/lib/contracts.test.ts`:

- midden in de maand: 2026-08-14 wordt 2026-08-15;
- over de maandgrens: 2026-08-31 wordt 2026-09-01;
- over de jaargrens: 2026-12-31 wordt 2027-01-01;
- schrikkeldag: 2028-02-28 wordt 2028-02-29 en 2028-02-29 wordt 2028-03-01;
- geen schrikkeljaar: 2026-02-28 wordt 2026-03-01.

De dialoog is React en wordt niet automatisch getest — deze repo heeft daar
geen opzet voor. In de draaiende app na te lopen: dupliceren van een contract
mét einddatum opent meteen met de juiste begindatum; dupliceren van een
contract zonder einddatum vraagt er eerst om en blokkeert opslaan tot het er
staat; na opslaan staan er twee contracten die op elkaar aansluiten, zonder
overlapwaarschuwing.
