# Ontwerp: periodekeuze in de rapportfilters

Datum: 2026-07-31
Aanleiding: gebruikersfeedback — de losse Van/Tot-velden op `/reports` vervangen door een
keuzelijst met standaardperiodes.

## Wat er nu is

De filterkaart op `/reports` (`src/components/reports/report-filters.tsx`) opent met twee
date-inputs, Van en Tot, als eerste twee van zes filtervelden. `reports-client.tsx` vult ze bij
het laden met de eerste en de laatste dag van de huidige maand. Filters worden pas verstuurd als
de gebruiker op "Rapport ophalen" klikt; geen enkel filter haalt uit zichzelf data op.

`/uren-overzicht` heeft een eigen `periodBounds(mode, ref)`-helper, maar die werkt met een
navigeerbare peildatum die je week voor week of maand voor maand verschuift. Dat is een ander
model dan losse presets en wordt hier niet hergebruikt of aangepast.

## Wat erbij komt

Een **Periode**-keuzelijst met zes opties:

| Optie | Van | Tot |
|---|---|---|
| Deze maand | eerste dag van de huidige maand | laatste dag van de huidige maand |
| Vorige maand | eerste dag van de vorige maand | laatste dag van de vorige maand |
| Deze week | maandag van de huidige week | zondag van de huidige week |
| Vorige week | maandag van de vorige week | zondag van de vorige week |
| Dit jaar | 1 januari van het huidige jaar | vandaag |
| Aangepast | blijft ongewijzigd | blijft ongewijzigd |

## Beslissingen

| Onderwerp | Keuze |
|---|---|
| Ophalen bij keuze | Nee. "Rapport ophalen" blijft de enige trigger, zoals bij alle andere filters. |
| Weekbegin | Maandag (`weekStartsOn: 1`), zoals overal elders in deze app. |
| Hele periodes | Ja, behalve "dit jaar". "Deze maand" loopt tot en met de laatste dag van de maand, ook als die in de toekomst ligt — dat is het huidige gedrag van de standaardwaarden. |
| "Dit jaar" | 1 januari tot en met **vandaag**, niet tot en met 31 december. Bewust de enige uitzondering: een heel kalenderjaar tonen is voor een lopend jaar zelden wat je bedoelt. |
| Startwaarde | `"this-month"`, wat exact dezelfde van/tot oplevert als de huidige standaard. Bij het openen van `/reports` verandert er dus niets. |
| API | Ongewijzigd. De server ontvangt onveranderd `from` en `to`. |

## Deel 1: de helper

Nieuw bestand `src/lib/periods.ts`:

```ts
export type PeriodPreset =
  | "this-month" | "last-month"
  | "this-week"  | "last-week"
  | "this-year"  | "custom";

export const PERIOD_LABELS: Record<PeriodPreset, string>;
export const PERIOD_ORDER: PeriodPreset[];

/** Geeft null voor "custom" — de aanroeper laat de bestaande datums dan staan. */
export function resolvePeriod(
  preset: PeriodPreset,
  now: Date,
): { from: string; to: string } | null;
```

`resolvePeriod` geeft datums als `yyyy-MM-dd`-strings terug, het formaat dat `FilterState` en de
date-inputs al gebruiken. `now` komt als parameter binnen in plaats van uit `new Date()`, zodat
de functie testbaar is.

Gebruikt `date-fns`, dat al een dependency is: `startOfMonth`, `endOfMonth`, `subMonths`,
`startOfWeek`, `endOfWeek`, `subWeeks`, `startOfYear`, `format`.

`PERIOD_LABELS` bevat de Nederlandse labels en wordt door de select gebruikt, zodat de labels en
de sleutels niet uit elkaar kunnen lopen. De keuzelijst toont ze in deze volgorde, zoals gevraagd:
Deze maand, Vorige maand, Deze week, Vorige week, Dit jaar, Aangepast. Omdat de volgorde van een
object niet iets is om op te leunen, exporteert de module daarnaast een expliciete
`PERIOD_ORDER: PeriodPreset[]` waar de select overheen loopt.

## Deel 2: de filterkaart

`FilterState` in `src/components/reports/report-filters.tsx` krijgt één veld erbij:

```ts
period: PeriodPreset;
```

De Van- en Tot-velden verdwijnen uit de vaste grid. Op hun plek komt als eerste veld een
**Periode**-select. Staat `period` op `"custom"`, dan worden Van en Tot eronder alsnog getoond;
bij elke andere waarde niet.

Een preset kiezen schrijft `period`, `from` en `to` in één `onChange`-aanroep weg:

```ts
function handlePeriodChange(preset: PeriodPreset) {
  const range = resolvePeriod(preset, new Date());
  onChange(range ? { ...value, period: preset, ...range } : { ...value, period: preset });
}
```

Bij `"custom"` geeft `resolvePeriod` `null` en blijven `from` en `to` staan zoals ze waren. De
velden openen daardoor gevuld met wat de vorige preset had gezet, niet leeg.

`reports-client.tsx` zet `period: "this-month"` in de begintoestand naast de bestaande
`from`/`to`, die ongewijzigd blijven.

## Testen

`src/lib/periods.test.ts`, volgens het patroon van de repo — pure functie, vitest, geen
component- of API-tests.

Met een vaste `now` van woensdag 15 juli 2026:

- deze maand → `2026-07-01` t/m `2026-07-31`
- vorige maand → `2026-06-01` t/m `2026-06-30`
- deze week → `2026-07-13` (maandag) t/m `2026-07-19` (zondag)
- vorige week → `2026-07-06` t/m `2026-07-12`
- dit jaar → `2026-01-01` t/m `2026-07-15` (vandaag, niet 31 december)
- aangepast → `null`

Plus drie randgevallen die stil kunnen breken:

- `now` = zaterdag 3 januari 2026 → "vorige maand" moet `2025-12-01` t/m `2025-12-31` geven, dus
  over de jaargrens heen, en "deze week" moet bij `2025-12-29` beginnen — ook over de jaargrens.
- `now` = maandag → "deze week" moet die dag zelf als `from` geven, niet de week ervoor.
- `now` = zondag → "deze week" moet de maandag ervoor als `from` geven, wat misgaat zodra iemand
  `weekStartsOn` weglaat, want date-fns valt dan terug op zondag.

## Buiten scope

- `/uren-overzicht` aanpassen of zijn `periodBounds` samenvoegen met deze helper.
- De gekozen periode onthouden tussen sessies.
- Automatisch ophalen bij een filterwijziging.
