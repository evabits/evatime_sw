# Filteren op klant in het projectenscherm

**Datum:** 2026-08-05

## Waarom

Het projectenscherm toont alle projecten met alleen een statusfilter. Bij 38
projecten over 7 klanten is "laat mij alles van Zonneplan zien" een vraag die je
nu met de zoekfunctie van je browser beantwoordt.

## Wat het wordt

Eén keuzelijst naast het bestaande statusfilter, met Alle klanten, Zonder klant,
en daaronder de klanten.

De lijst toont **alle klanten uit de bestaande `customers`-prop** — dat zijn de
niet-gearchiveerde klanten, door `page.tsx` al op naam gesorteerd aangeleverd, en
precies dezelfde lijst die het bewerkdialoog gebruikt. Dus ook klanten zonder
projecten; die leveren een lege lijst op, wat een eerlijk antwoord is op "wat
doen we voor deze klant". De lijst nog eens filteren op klanten die daadwerkelijk
een project hebben zou code kosten om informatie te verbergen.

Die lijst **vervangt het bestaande vinkje "Zonder klant"**. Twee losse filters
zouden elkaar kunnen tegenspreken — vinkje aan én een klant gekozen levert
gegarandeerd nul projecten op, zonder dat het scherm uitlegt waarom. Eén
keuzelijst kan die toestand niet aannemen.

## Hoe

In `src/components/projects/projects-client.tsx`:

- De state `noCustomerOnly: boolean` wordt `customerFilter: string`, met drie
  soorten waarden: `"all"`, de sentinel `GEEN_KLANT`, of een `customerId`.
  `GEEN_KLANT` bestaat al in dit bestand omdat Radix een lege string niet
  toestaat als waarde van een `SelectItem`; hij wordt hier hergebruikt.
- Het filteren is één regel extra in de keten die er al staat naast het
  statusfilter:

  ```tsx
  .filter((p) => customerFilter === "all"
    || (customerFilter === GEEN_KLANT ? !p.customer : p.customerId === customerFilter))
  ```

- De checkbox en zijn telbadge verdwijnen uit de JSX. `customerlessCount` blijft
  bestaan: die telling verhuist naar het label van de optie Zonder klant.

## De dashboardlink

Het dashboard linkt naar `/projects?filter=no-customer`, en
`src/app/(app)/projects/page.tsx` vertaalt dat naar de prop
`initialNoCustomerOnly`. **Die prop blijft ongewijzigd en `page.tsx` wordt niet
aangeraakt.** Alleen wat de client ermee doet verandert:

```tsx
const [customerFilter, setCustomerFilter] = useState(
  initialNoCustomerOnly ? GEEN_KLANT : "all",
);
```

Dat is de kortste weg waarop de bestaande link precies blijft doen wat hij deed.

## Wat bewust niet verandert

- **Projecten van een gearchiveerde klant.** Zo'n klant staat niet in de
  `customers`-prop en verschijnt dus niet als optie, waardoor er niet op te
  filteren valt. Dat is vandaag ook al zo, en het bewerkdialoog heeft er al een
  eigen afhandeling voor. Buiten bereik van deze wijziging.
- **De bulkselectie.** Die rekent al met `selectedVisible` in plaats van met
  `selected`, juist omdat iemand eerst kan aanvinken en daarna het filter
  wijzigen. Een filter erbij verandert daar niets aan.
- **Het statusfilter en "Toon gearchiveerd".** Blijven zoals ze zijn; de
  klantkeuze komt ernaast te staan.

## Testbaarheid

Geen tests. Dit is formuliertoestand in een clientcomponent, en de repo test
uitsluitend pure functies in `src/lib/*.test.ts`. De filterregel is één
uitdrukking in een bestaande keten; die afsplitsen tot een pure functie om er een
test omheen te kunnen zetten zou meer code opleveren dan het bewaakt.

Verificatie is `npx tsc --noEmit` plus met de hand nalopen: alle klanten, één
klant, Zonder klant, de dashboardlink, en het samenspel met het statusfilter.
