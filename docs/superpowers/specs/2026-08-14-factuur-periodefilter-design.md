# Periodefilter bij het aanmaken van een factuur

**Datum:** 2026-08-14

## Het probleem

Wie een factuur aanmaakt en een klant kiest, krijgt élke openstaande
factureerbare regel van die klant te zien. In productie staan 503
ongefactureerde urenregels en 91 km-regels open, met de oudste op 14 januari.
Er wordt vrijwel altijd één kalendermaand gefactureerd, dus die lijst is bijna
altijd veel te lang, en aanvinken wat erbij hoort is handwerk.

## Het ontwerp

### 1. Van en tot

Boven de twee keuzelijsten komen twee datumvelden, "Van" en "Tot", standaard
gevuld met de vorige kalendermaand. Op 14 augustus staat er dus 1 juli tot en
met 31 juli. Ze zijn vrij aan te passen; een afwijkende periode is overtypen.

Het bereik is inclusief aan beide kanten en filtert op de datum van de regel.
De factuurdatum en de vervaldatum van de factuur zelf blijven onafhankelijk —
dit filter bepaalt alleen wat je kunt aanvinken.

`resolvePeriod("last-month", now)` in `src/lib/periods.ts` levert dat bereik al
en is al getest. Er komt dus geen tweede manier bij om "vorige maand" uit te
rekenen.

### 2. Het filter zit in de browser

De pagina haalt nu alle openstaande regels van de klant op en filtert in de
browser op "nog niet gefactureerd en factureerbaar". Daar komt het datumbereik
bij.

De API-routes `/api/time` en `/api/km` kennen `from` en `to` al, maar die
worden hier bewust niet gebruikt. Door alles op te halen weet de pagina ook wat
er búíten de periode nog openstaat, en dat draagt punt 3. De hoeveelheid data
die over de lijn gaat blijft gelijk aan vandaag.

### 3. De achterstand blijft zichtbaar

Met een standaard van vorige maand verdwijnt alles daarvóór uit beeld, terwijl
er werk openstaat tot zeven maanden terug. Onder de lijsten komt daarom een
regel als:

> Nog 34 regels open van vóór deze periode, oudste 14-01-2026.

met een knop die de begindatum meteen op die oudste datum zet. Staat er niets
open van vóór de periode, dan is de regel er niet.

Regels ná de periode tellen hier niet mee. Wie in augustus juli factureert
heeft altijd openstaande augustusregels; die zijn geen achterstand maar de
factuur van volgende maand.

### 4. Selectie volgt de periode

De lijst, de knop "toevoegen aan factuur" en het aan- en uitvinken werken op
dezelfde gefilterde verzameling. Verzet je de periode terwijl er regels
aangevinkt staan, dan vervallen de selecties die buiten de nieuwe periode
vallen. Zo kan er nooit iets op de factuur belanden wat je niet in beeld hebt.

### 5. Alles aan- en uitvinken

In beide tabellen zit al een lege kolomkop boven de vinkjes. Daar komt een
vinkje dat de hele zichtbare lijst aan- of uitzet:

- niets geselecteerd → leeg;
- alles geselecteerd → aangevinkt;
- een deel geselecteerd → half (de `indeterminate`-stand van een
  checkbox; die is geen attribuut, dus hij wordt via een ref op het element
  gezet);
- klikken zet alle zichtbare regels aan, behalve wanneer ze al allemaal
  aanstaan — dan gaan ze uit.

Het werkt per lijst: uren en kilometers hebben elk hun eigen kopvinkje. Ze
raken alleen wat zichtbaar is, wat vanzelf klopt met punt 4.

## Wat er verandert in de code

- `src/lib/invoice-period.ts` (nieuw) — één pure functie die een lijst regels
  splitst in "binnen de periode" en "ervóór nog open", met de oudste datum
  daarvan.
- `src/lib/invoice-period.test.ts` (nieuw) — testen daarvan.
- `src/components/invoices/new-invoice-client.tsx` — de twee datumvelden, het
  filteren, de achterstandsregel met zijn knop, het opschonen van de selectie
  bij het wisselen van periode, en de twee kopvinkjes.

Geen schemawijziging, geen migratie, geen API-wijziging.

## Testen

Pure functie, in `src/lib/invoice-period.test.ts`:

- een regel op de begindatum en een op de einddatum vallen binnen de periode
  (het bereik is inclusief aan beide kanten);
- een regel van de dag vóór de periode telt als achterstand;
- een regel van ná de periode telt niet mee — niet binnen, niet als
  achterstand;
- de oudste datum is die van de vroegste regel vóór de periode;
- zonder regels vóór de periode is het aantal nul en de oudste datum leeg;
- de datums uit de API zijn volledige ISO-tijdstempels (`2026-07-14T00:00:00.000Z`)
  en worden op de dag vergeleken, niet op het tijdstip.

Het scherm is React en wordt hier niet automatisch getest. In de draaiende app
na te lopen: een klant kiezen toont standaard vorige maand; de
achterstandsregel verschijnt en zijn knop rekt de periode op; het kopvinkje
zet de zichtbare regels aan en uit en staat half bij een deelselectie; en een
selectie die buiten een nieuw gekozen periode valt is verdwenen.
