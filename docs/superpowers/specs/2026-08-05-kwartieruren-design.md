# Van-tot invoeren en uren in kwartieren

**Datum:** 2026-08-05

## Waarom

Wie uren boekt weet meestal wanneer hij begon en wanneer hij stopte, niet hoeveel
uur dat was. Van 09:00 tot 12:15 is één blik op de agenda; 3,25 is een sommetje.
Daarnaast blijken er in de praktijk urenregels te ontstaan met waarden als 1,3 of
2,66 — getallen die niemand bewust intypt en die bij het factureren vragen
oproepen. De kwartierstap maakt daar een eind aan.

## Wat het wordt

Twee dingen die elkaar aanvullen maar los van elkaar werken:

1. **Van-tot als invulhulp** in het urenformulier. Vul je beide tijden, dan volgt
   het urenaantal daaruit.
2. **De kwartierregel:** elk urengetal dat een mens invoert is een veelvoud van
   0,25, en dat wordt zowel op het scherm als op de server afgedwongen.

## Van-tot

Twee velden `<input type="time" step="900">` boven het bestaande urenveld in
`src/components/time/time-entries-client.tsx`. `step="900"` is de native
kwartierstap: de browser levert de keuze-UI en de validatie, dus er komt geen
datum- of tijdbibliotheek bij.

Zodra beide tijden gevuld zijn wordt het verschil berekend en in `hours`
geschreven. Het urenveld blijft daarna gewoon typbaar — wie "8" wil intypen kan
dat blijven doen, en van/tot leeg laten mag. De twee manieren staan naast elkaar
in beeld; er is geen schakelaar en geen modus.

Een eindtijd die gelijk is aan of vóór de begintijd ligt wordt geweigerd met een
melding. Middernachtoversteken bestaan hier niet en een ondersteboven ingevuld
paar is vrijwel altijd een typefout.

**Geen pauzeveld.** Er wordt per project geboekt, dus een lunch is het gat tussen
twee regels en niet iets dat van één regel afgetrokken moet worden.

**De tijden worden niet opgeslagen.** `TimeEntry` krijgt geen kolommen erbij:
geen schemawijziging, geen migratie op productie, niets aan facturatie of
rapportage. Bij het bewerken van een bestaande regel staan de tijdvelden dus leeg
en zie je alleen de uren.

## De kwartierregel

Eén gedeelde helper bepaalt of een getal een veelvoud van 0,25 is. Die wordt op
vier plekken gebruikt:

| Plek | Rol |
|---|---|
| `POST /api/time` en `PUT /api/time/[id]` | zod weigert niet-kwartieren; dit is de vertrouwensgrens |
| `src/components/time/time-entries-client.tsx` | melding vóór verzenden |
| `src/components/reports/entry-edit-dialog.tsx` | idem, bij het bewerken door een admin |
| `POST` en `PUT` op `/api/absence-requests` | het verlofuren-totaal en de vijf waarden van het weekpatroon |

De server is de plek die telt. De twee schermen zijn er alleen om de gebruiker
niet op een foutmelding te laten wachten; ze zijn geen vervanging van de
controle erachter.

**Afwijzen, niet afronden.** Uren worden gefactureerd. Een getal dat stilzwijgend
verandert is erger dan een foutmelding, omdat niemand merkt dat het gebeurd is.

Het urenveld van het verlofformulier gaat van `step="0.5"` naar `step="0.25"`.
De vijf patroonvelden staan al op `0.25`; daar komt nu ook de servercontrole bij,
die tot nu toe elk getal tussen 0 en 24 toeliet.

## Verlofregels in kwartieren

`splitHoursOverDays` in `src/lib/absence-entries.ts` verdeelt het totaal van een
goedgekeurde aanvraag over de werkdagen. Nu gebeurt dat op centen: acht uur over
drie dagen wordt 2,66 / 2,66 / 2,68. Dat zijn straks de enige uren in het systeem
die niet op een kwartier vallen, dus die gaan mee om.

De nieuwe verdeling rekent in kwartiereenheden:

```
units = totaal / 0,25
basis = floor(units / aantal dagen)
rest  = units % aantal dagen
```

De eerste `rest` dagen krijgen `basis + 1` kwartieren, de rest krijgt `basis`.
Acht uur over drie dagen wordt daarmee 2,75 / 2,75 / 2,50.

**De eigenschap die geldt:** de som is exact het aangevraagde totaal, zolang dat
totaal zelf een veelvoud van 0,25 is — en dat is het voortaan, want de
kwartierregel bewaakt het aan de voorkant. Is het totaal dat niet, dan is de som
het totaal afgerond op het dichtstbijzijnde kwartier.

Die formulering is scherper dan de huidige, en daarom veranderen twee bestaande
tests in `src/lib/absence-entries.test.ts` mee:

- `puts the remainder on the last day` verwacht 3,33 / 3,33 / 3,34 voor tien uur
  over drie dagen. Dat wordt 3,50 / 3,25 / 3,25. De naam klopt dan ook niet meer:
  de rest wordt niet meer op de laatste dag gelegd maar over de eerste dagen
  verdeeld.
- `always sums to exactly the requested total` voert onder meer 36,4 en 13,33 op.
  Dat zijn geen kwartieren, dus die twee waarden gaan eruit en de eis wordt
  geformuleerd op kwartiertotalen. Dat de som nooit stilzwijgend afwijkt blijft
  precies even hard bewaakt; alleen de verzameling geldige invoer is kleiner.

Twee gevolgen die het ontwerp bewust accepteert:

- **Dagen kunnen op nul uitkomen** wanneer er minder kwartieren zijn dan dagen —
  één uur over vijf dagen is vier kwartieren. Zo'n dag levert geen urenregel op,
  net zoals `patternedEntries` nu al doet voor dagen waarop het patroon nul staat.
  Een urenregel van nul uur boeken heeft geen betekenis.
- **Een bestaande aanvraag met een niet-kwartier totaal** wordt bij goedkeuring
  op het dichtstbijzijnde kwartier afgerond, wat maximaal 7½ minuut scheelt. Dit
  kan alleen bij aanvragen die al in productie stonden voordat de kwartierregel
  ging gelden; nieuwe aanvragen komen er niet meer doorheen.

## Wat er niet verandert

- Geen schemawijziging, geen migratie, geen backfill.
- Bestaande urenregels met afwijkende waarden blijven staan. Ze botsen pas met de
  regel als iemand ze bewerkt, en dat is precies het moment waarop corrigeren ook
  logisch is.
- Vakantiebudget, `weeklyHours` en contracturen houden hun halve stappen. Dat zijn
  afspraken en budgetten, geen urenregistraties.
- Het weekrooster (`work-schedule-client.tsx`) staat al op kwartieren en blijft
  zoals het is.

## Testbaarheid

De kwartierhelper en de nieuwe `splitHoursOverDays` zijn pure functies en krijgen
tests in `src/lib/`, conform de bestaande conventie dat alleen pure functies
getest worden. De verdeling verdient minstens: een totaal dat gelijk opgaat, een
totaal dat niet gelijk opgaat, minder kwartieren dan dagen, en de aangescherpte
eis dat de som exact klopt bij een kwartiertotaal.

Het van-tot-rekenwerk is ook een pure functie en hoort in dezelfde categorie
thuis, los van het formulier.
