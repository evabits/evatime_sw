# Vakantie-uren per jaar op het contract

**Datum:** 2026-08-13

## Het probleem

Het vakantiesaldo op /absence en op het dashboard komt uit `VacationBudget`:
één rij per medewerker per jaar, met de hand in te voeren op een apart
tabblad. In productie staat daar precies één rij, en die is van de
testgebruiker. Voor alle veertien echte medewerkers is er dus geen saldo: het
dashboard toont nul van nul, en het tabblad Vakantiebudgetten zegt "nog geen
vakantiebudgetten ingesteld".

De contracten worden wél bijgehouden — veertien stuks, met uren per week,
salaris en functie. Daar hoort het aantal vakantie-uren per jaar thuis, want
daar wordt het ook afgesproken.

## Het ontwerp

### 1. Het veld

`Contract` krijgt `vacationHours Decimal?  @db.Decimal(5,2)`, naast het
bestaande `contractHours`. Nullable, want een contract zonder afspraak hierover
moet gewoon kunnen bestaan en dan verandert er niets.

Op het contractformulier komt één invoerveld bij, "Vakantie-uren per jaar",
met dezelfde vorm als `contractHours` (getal, stap 0,5, niet negatief,
optioneel). In de contracttabel komt er een kolom bij die het toont, met een
streepje als het leeg is. De API laat het veld mee in het `select`, in het
zod-schema van de body en in de omzetting van `Decimal` naar getal — precies de
plekken waar `contractHours` al staat.

### 2. Welk getal geldt voor een jaar

Eén pure functie beantwoordt de vraag "hoeveel vakantie-uren heeft deze
medewerker in dit jaar?", in deze volgorde:

1. Bestaat er een `VacationBudget`-rij voor die medewerker en dat jaar, dan is
   dat het antwoord. Zo blijft een afwijking voor één jaar mogelijk, en die
   afwijking is zichtbaar als losse rij.
2. Anders het `vacationHours` van het contract dat op 31 december van dat jaar
   geldt.
3. Is er op die datum geen contract, dan dat van het laatste contract dat het
   jaar nog overlapte. Zonder deze stap zou iemand van wie het contract in
   augustus afliep over dat jaar geen budget hebben, terwijl hij er de halve
   tijd wel een had.
4. Blijft er niets over, of staat `vacationHours` leeg, dan is er geen budget
   en blijft alles zoals het nu is.

Er wordt niet naar rato gerekend. Wie in juli in dienst komt krijgt het getal
dat op zijn contract staat. Dat getal typ je zelf, dus naar rato invullen kan;
de app doet het niet uit zichzelf, want dan is niet meer af te lezen welk getal
er nu eigenlijk geldt.

De bestaande helpers `getEffectiveContract` en `rangeOverlaps` in
`src/lib/contracts.ts` doen stap 2 en 3 al; de nieuwe functie zet ze op een rij.

### 3. Waar het uitkomt

Twee schermen lezen vandaag `VacationBudget`, en allebei krijgen ze de
afgeleide budgetten er langs dezelfde weg bij:

- **Dashboard** (`src/app/(app)/page.tsx`): haalt nu één `vacationBudget`-rij
  voor de ingelogde gebruiker op. Daar komen zijn contracten bij, en het
  getoonde budget loopt door de nieuwe functie.
- **Verlofscherm** (`src/app/(app)/absence/page.tsx`): geeft de budgetrijen van
  het jaar door aan de client, die er het eigen saldo, het saldo in de dialoog
  en het tabblad Vakantiebudgetten mee vult. De pagina vult die lijst aan met
  een afgeleide rij voor elke medewerker die er nog geen heeft en van wie het
  contract wel een getal geeft.

De contracten zelf gaan niet naar de browser. Er staan salarissen in en het
verlofscherm heeft alleen het urengetal nodig; de afleiding gebeurt dus op de
server, in de pagina.

### 4. Het tabblad Vakantiebudgetten

De afgeleide rijen verschijnen als gewone regels, met "uit contract" achter het
bedrag en zonder verwijderknop — er is niets te verwijderen. Bewerken mag wel:
dat opent de bestaande dialoog met medewerker, jaar en het contractgetal
ingevuld, en opslaan maakt er een expliciete rij voor dat jaar van. Zo is de
uitzondering per jaar nog steeds twee klikken ver, en begint een admin niet
langer met een leeg scherm.

Technisch betekent dit dat een budgetrij in de client een `id` van `null` kan
hebben. Dat is meteen het kenmerk waaraan de "uit contract"-tekst en de
ontbrekende verwijderknop hangen: geen rij in de database, dus geen id.
Opslaan gaat voor zo'n rij door de bestaande aanmaakweg (POST), niet door de
bewerkweg (PUT). De lijst in de client vervangt na het opslaan de rij met
dezelfde medewerker en hetzelfde jaar, niet de rij met hetzelfde id — anders
blijft de afgeleide rij naast de nieuwe echte rij staan.

## Wat er verandert in de code

- `prisma/schema.prisma` — `vacationHours` op `Contract`.
- `src/lib/vacation-budget.ts` (nieuw) — de keuzeregel als pure functie, plus
  een tegenhanger die voor een lijst medewerkers de aangevulde budgetlijst
  maakt.
- `src/lib/vacation-budget.test.ts` (nieuw) — de testen hieronder.
- `src/app/api/contracts/route.ts` en `src/app/api/contracts/[id]/route.ts` —
  het veld erbij, op de plekken waar `contractHours` staat.
- `src/components/personeel/contracts-client.tsx` — type, formulierveld, kolom.
- `src/app/(app)/page.tsx` en `src/app/(app)/absence/page.tsx` — de afleiding.
- `src/components/vacation/absence-client.tsx` — `id: string | null`, de "uit
  contract"-markering, geen verwijderknop op een afgeleide rij, en het opslaan
  dat op medewerker en jaar samenvoegt.

## Uitrol

Het is één nullable kolom erbij, dus `npm run db:push` tegen de productie-
database kan vóór de code live gaat en breekt niets: de draaiende versie kent
de kolom niet en raakt hem niet aan. Schema eerst, code daarna — een push naar
main deployt meteen.

## Testen

Pure functies, in `src/lib/vacation-budget.test.ts`:

- een expliciete budgetrij voor het jaar wint van het contract;
- zonder budgetrij komt het getal van het contract dat op 31 december geldt;
- een contract dat in augustus van dat jaar afliep telt nog mee als er daarna
  geen ander contract is;
- een contract dat vóór dat jaar afliep telt niet mee;
- een contract met een leeg `vacationHours` geeft geen budget;
- geen contract en geen budgetrij geeft geen budget;
- de aanvullende functie laat bestaande rijen ongemoeid en voegt alleen toe
  voor medewerkers die er nog geen hebben.

Het contractformulier en het budgettabblad zijn React en worden niet
automatisch getest — deze repo heeft daar geen opzet voor. Die controleer je in
de draaiende app.
