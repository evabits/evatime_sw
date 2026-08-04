# Ontwerp: vast weekrooster per medewerker

Datum: 2026-08-04
Aanleiding: gebruikersfeedback. Bij contracten onder de 40 uur moet per medewerker vastgelegd
kunnen worden welke vaste dagen hij niet werkt.

**Dit is traject 2 van twee.** Traject 1 — goedgekeurde afwezigheid als boeking in de tijdlijn — is
af en uitgerold. Dit traject raakt die machinerie **niet**: een vaste vrije dag is geen verlof.

## Uitgangssituatie

**Er bestaat nergens in de app een begrip van een wekelijks patroon.** Geen dag-van-de-week-veld,
geen herhaalregel. De drie cronjobs onder `src/app/api/cron/` lezen alleen en schrijven nooit een
domeinrecord.

**Twee velden claimen de contracturen, en ze zijn het oneens.** `User.weeklyHours` en
`Contract.contractHours` bestaan allebei. Alle uren-versus-doel-berekeningen gebruiken uitsluitend
`weeklyHours`; `contractHours` en `ftePercentage` worden nergens gelezen.

Gemeten op productie op 2026-08-04, 14 actieve medewerkers:

| Medewerker | `weeklyHours` | `contractHours` |
|---|---|---|
| Erik Kallen | — | 8 |
| Jort Oosterveld | 16 | — |
| Jasper de Waal | 24 | 24 |
| Paul van Gelderen | 24 | 24 |
| Merlijn Kunst | 32 | 32 |
| Arjen Bogerman | — | 40 |
| Harm, Jan, Jeroen, Josha, employee | 40 | 40 (deels) |
| Admin, Merran, Thijs | — | — |

Vijf mensen zitten onder de 40 uur. Voor drie van de veertien zijn de twee velden het oneens, en
drie hebben helemaal geen `weeklyHours`. **"Contracten onder 40 uur" wijst dus niet naar één veld**,
en elke harde controle tegen `weeklyHours` zou meteen op bestaande data stuklopen.

**De urenherinnering** (`src/app/api/cron/hours-reminder/route.ts`) neemt voor iedereen maandag tot
en met vrijdag aan: `elapsedDays = clamp(dayOfWeek, 1, 5)` en `proratedTarget = weeklyHours × elapsedDays / 5`
(regels 16-18 en 47). Wie woensdag vrij is, loopt daardoor midden in de week op papier achter en
krijgt een herinnering die nergens op slaat. Goedgekeurde afwezigheid wordt daar ook niet in
meegenomen, maar dat blijft buiten dit traject.

## Beslissingen

| Onderwerp | Keuze |
|---|---|
| Vorm | **Uren per weekdag**, niet vinkjes. |
| Model | Een apart `WorkSchedule`, één rij per persoon of geen. |
| Wat het beïnvloedt | De urenherinnering, de standup en de weekweergave van `/time`. |
| Wat het niet beïnvloedt | Verlofaanvragen, `/uren-overzicht`, `Contract.contractHours`. |
| Weekend | Niet in het model. |
| Controle op het totaal | Tonen, niet afdwingen. |

## Deel 1: het datamodel

```prisma
model WorkSchedule {
  userId    String   @id
  user      User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  monday    Decimal  @db.Decimal(4, 2)
  tuesday   Decimal  @db.Decimal(4, 2)
  wednesday Decimal  @db.Decimal(4, 2)
  thursday  Decimal  @db.Decimal(4, 2)
  friday    Decimal  @db.Decimal(4, 2)
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
}
```

Op `User` komt `workSchedule WorkSchedule?`.

`userId` is meteen de primaire sleutel: **één rooster per persoon, of geen**. Dat onderscheid draagt
het hele ontwerp. Negen van de veertien mensen krijgen geen rooster, en voor hen mag er niets
veranderen — geen rooster betekent letterlijk "reken zoals je nu rekent". Een rij die bestaat is een
bewuste keuze van een admin, geen default die per ongeluk voor iedereen aan staat.

De vijf velden zijn verplicht en niet nullable: een rooster dat maandag leeg laat is dubbelzinnig —
nul uur, of niet ingevuld? Nul is nul. `Decimal(4,2)` dekt 0,00 tot 99,99 uur.

Weekend staat er niet in. Niemand werkt hier op zaterdag of zondag, en de bestaande werkdagfuncties
in `src/lib/working-days.ts` slaan die dagen sowieso over. Blijkt het ooit nodig, dan is het twee
kolommen.

## Deel 2: de pure module

`src/lib/work-schedule.ts`:

```ts
export type WeekSchedule = {
  monday: number; tuesday: number; wednesday: number;
  thursday: number; friday: number;
};

/** De geroosterde uren voor een datum. Weekend geeft altijd 0. */
export function scheduledHoursOn(schedule: WeekSchedule, date: string): number;

/**
 * Het doel tot en met vandaag: de som van de geroosterde uren van de
 * verstreken weekdagen van deze week, de huidige dag meegerekend.
 */
export function targetSoFar(schedule: WeekSchedule, today: string): number;

/** Het weektotaal. Voor het scherm, en om te vergelijken met weeklyHours. */
export function weekTotal(schedule: WeekSchedule): number;
```

Alle drie nemen een `YYYY-MM-DD`-string en rekenen in UTC met `getUTCDay()`, om dezelfde reden als
in de vorige twee trajecten: de productieserver draait op UTC en de gebruikers zitten in Amsterdam,
en `getDay()` rekent lokaal.

`targetSoFar` bepaalt zelf welke weekdagen verstreken zijn — op woensdag telt hij maandag, dinsdag
en woensdag. In het weekend telt hij de hele week, want dan is elke weekdag voorbij.

## Deel 3: waar je het instelt

Op `/personeel/[id]`, onder het woon-werksjabloon. Dat is de plek voor per-medewerker-instellingen
die een admin beheert, en het is wat de gebruiker bedoelde met "via een sjabloon per medewerker".

Een blok **Weekrooster** met vijf getalvelden op een rij — Ma, Di, Wo, Do, Vr — en eronder het
totaal: `32,00 uur per week`.

Het totaal wordt **getoond, niet afgedwongen** tegen `weeklyHours`. Die twee zijn voor drie mensen
al niet in overeenstemming en drie mensen hebben helemaal geen `weeklyHours`; een harde controle zou
dus op bestaande data stuklopen zonder dat er iets mis is. Staat er wél een `weeklyHours` en wijkt
het totaal af, dan komt er een zichtbare maar niet-blokkerende opmerking:
`Weekuren staan op 40,00 — dit rooster telt op tot 32,00.`

Een rooster verwijderen kan; dan valt die persoon terug op het huidige gedrag.

Adminonly, net als de rest van die pagina.

## Deel 4: de urenherinnering

`src/app/api/cron/hours-reminder/route.ts` haalt per gebruiker het rooster mee op.

- **Met rooster:** `proratedTarget = targetSoFar(schedule, vandaag)`.
- **Zonder rooster:** `proratedTarget = weeklyHours × elapsedDays / 5`, precies zoals nu.

Merlijn met 8-8-8-8-0 op woensdag: doel 24. Iemand met 8-8-0-8-8 op woensdag: doel 16 in plaats van
de huidige 19,2 — en daarmee geen onterechte mail.

Wie een rooster heeft maar geen `weeklyHours`, komt nu niet eens in de query voor
(`where: { weeklyHours: { not: null } }`). Dat wordt `OR`: wie een rooster heeft doet mee, ook
zonder `weeklyHours` — anders krijgen Erik en Arjen nooit een herinnering terwijl het rooster
precies vertelt wat er van hen verwacht wordt. De mail toont dan het weektotaal uit het rooster in
plaats van `weeklyHours`.

## Deel 5: de standup

`GET /api/standup` haalt per actieve medewerker al de uren, de afwezigheid en de notities op. Daar
komt één veld bij: `scheduledHours`, de geroosterde uren voor de getoonde werkdag, of `null` als
diegene geen rooster heeft.

Is dat getal 0, dan toont het scherm **`werkt niet op vrijdag`** — met de weekdagnaam van de
getoonde dag — in plaats van `geen uren geboekt`.

De datum van het scherm blijft voor iedereen dezelfde. Er komt géén persoonlijke "vorige werkdag"
per teamlid: dan kijk je in één overzicht naar verschillende dagen, en dat is verwarrender dan het
probleem dat het oplost.

Volgorde wanneer meerdere dingen tegelijk gelden: een goedgekeurde afwezigheid wint van het rooster.
Wie op zijn vaste vrije dag ook nog vakantie heeft opgenomen, ziet `afwezig — vakantie`; dat is de
uitzonderlijkere mededeling en dus de nuttigere.

## Deel 6: de tijdlijn

In de **weekweergave** van `/time` krijgt een dag waarop de ingelogde gebruiker 0 uur geroosterd
staat een zichtbare markering, zodat een lege dag niet als een gat leest.

De lijstweergave blijft ongemoeid: daar staan alleen regels die bestaan, dus een dag zonder uren
komt er niet in voor.

Voor een admin die andermans uren bekijkt, wordt het rooster van de **ingelogde** gebruiker getoond,
niet dat van de bekeken medewerker — de weekweergave is één raster, niet één per persoon. Heeft de
ingelogde gebruiker geen rooster, dan verandert er niets.

## Deel 7: wat er niet verandert

`/uren-overzicht` blijft `weekuren × aantal weken` rekenen. Voor een hele periode klopt dat al
ongeacht hoe de dagen verdeeld zijn.

Verlofaanvragen blijven zoals ze zijn. Merlijn die een week vrij vraagt vult zelf 32 uur in; de app
rekent dat niet voor hem uit en controleert het niet. Zijn vaste vrije vrijdag levert geen
verlofregel op — een vaste vrije dag is geen verlof, gaat niet van het vakantiesaldo af, en hoort
niet als `Vakantieverlof` in de tijdlijn.

`Contract.contractHours` en `ftePercentage` blijven ongelezen. Er komt geen tweede bron van waarheid
bij in dit traject.

## Testen

Volgens het patroon van de repo: pure functies in `src/lib/` met vitest, geen component- of
API-tests.

`src/lib/work-schedule.test.ts`, met `MERLIJN = { monday: 8, tuesday: 8, wednesday: 8, thursday: 8, friday: 0 }`
en `WOENSDAG_VRIJ = { monday: 8, tuesday: 8, wednesday: 0, thursday: 8, friday: 8 }`:

- `scheduledHoursOn(MERLIJN, "2026-08-07")` — een vrijdag → 0.
- `scheduledHoursOn(MERLIJN, "2026-08-03")` — een maandag → 8.
- `scheduledHoursOn(MERLIJN, "2026-08-08")` — een zaterdag → 0.
- `scheduledHoursOn(MERLIJN, "2026-08-09")` — een zondag → 0.
- `targetSoFar(MERLIJN, "2026-08-03")` — maandag → 8.
- `targetSoFar(MERLIJN, "2026-08-05")` — woensdag → 24.
- `targetSoFar(MERLIJN, "2026-08-07")` — vrijdag → 32.
- `targetSoFar(WOENSDAG_VRIJ, "2026-08-05")` — woensdag → 16, niet 19,2.
- `targetSoFar(MERLIJN, "2026-08-08")` — zaterdag → 32; in het weekend is de hele week verstreken.
- `targetSoFar(MERLIJN, "2026-08-09")` — zondag → 32.
- `weekTotal(MERLIJN)` → 32.
- `weekTotal({ monday: 0, tuesday: 0, wednesday: 0, thursday: 0, friday: 0 })` → 0.

Handmatig na te lopen:

- Bij een medewerker een rooster invullen en het totaal onder de velden zien meelopen.
- Een rooster invullen dat niet optelt tot `weeklyHours` → de opmerking verschijnt, opslaan lukt.
- Een rooster verwijderen en zien dat de medewerker terugvalt op het oude gedrag.
- De standup openen op een dag waarop iemand niet werkt → `werkt niet op <weekdag>`.
- Diezelfde persoon met een goedgekeurde vakantie op die dag → `afwezig — vakantie` wint.
- In de weekweergave van `/time` als iemand met een rooster: de vrije dag is gemarkeerd.
- Als iemand zonder rooster: er is niets veranderd aan `/time`.
- De urenherinnering droog nalopen voor een medewerker met een rooster en controleren dat het doel
  de som van de verstreken dagen is.

## Uitrol

1. `prisma migrate diff` draaien en de volledige lijst lezen — er hoort alleen één tabel bij te
   komen.
2. `npm run db:push`.
3. Deployen.
4. Per medewerker onder de 40 uur het rooster invullen op `/personeel/[id]`.

Geen backfill: een rooster is een keuze, geen afgeleide. Zolang stap 4 niet gedaan is verandert er
voor niemand iets, en dat is precies de bedoeling.

## Buiten scope

- Roosters die in de tijd wijzigen. Eén rooster per persoon, geldig vanaf nu.
- Weekenddagen.
- Verlofaanvragen die het rooster gebruiken om uren te berekenen of te controleren.
- `/uren-overzicht` per dag laten rekenen in plaats van per week.
- `Contract.contractHours` en `weeklyHours` met elkaar in overeenstemming brengen.
- Afwezigheid meenemen in de urenherinnering. Dat is een bestaand gat en staat los van dit traject.
