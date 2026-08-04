# Ontwerp: tagbeheer en tags in bulk toewijzen

Datum: 2026-08-04
Aanleiding: gebruikersfeedback. Er is geen plek waar je alle tags ziet, en een tag toewijzen kan
alleen project voor project.

Dit staat los van de drie trajecten die vandaag zijn uitgerold. Het bouwt wel voort op de
selectiekolom die traject 3 op `/projects` heeft toegevoegd.

## Uitgangssituatie

```prisma
model Tag {
  id        String    @id @default(cuid())
  name      String    @unique
  createdAt DateTime  @default(now())
  projects  Project[]
}
```

Tags hangen uitsluitend aan projecten. Geen enkele andere entiteit heeft een tagrelatie.

Een tag ontstaat vandaag alleen als bijproduct van het projectformulier: `POST /api/projects` en
`PUT /api/projects/[id]` doen een `connectOrCreate` op de meegestuurde namen. Er is geen
`/tags`-pagina, geen menu-item, en `GET /api/tags` is de enige tagroute — alleen lezen, zonder
rolcontrole, want de rapportfilters gebruiken hem voor elke rol.

Niets in de codebase verwijdert ooit een `Tag`-rij. `PUT /api/projects/[id]` doet
`tags: { set: [] , connectOrCreate: … }`, dus een tag die van zijn laatste project wordt gehaald
blijft als weestag bestaan en blijft in elke keuzelijst opduiken.

Tags worden op twee plekken gebruikt:

- **`/reports`** — filterchips die via `project.tags.some.id.in` uren, ritten en uitgaven filteren.
- **`GET /api/payroll`** — zoekt **hardgecodeerd** naar een tag die `wbso` heet, hoofdletterongevoelig,
  en telt de uren op projecten met die tag per medewerker voor de loonstrook.

Huidige data, gemeten op productie op 2026-08-04: **2 tags**. `WBSO` op 14 actieve en 2
gearchiveerde projecten; `EFRO - WP1 programmeerbare hardware` op nul projecten. Geen
bijna-duplicaten. 10 van de 26 projecten hebben geen enkele tag.

## Beslissingen

| Onderwerp | Keuze |
|---|---|
| Aanleiding | De gebruiker gaat meer tags gebruiken én meer projecten taggen. Niet: opruimen. |
| Bulkgedrag | Toevoegen en verwijderen zijn aparte acties. Nooit vervangen. |
| Beheeracties | Aanmaken, hernoemen (met samenvoegen bij botsing), projecten per tag zien. |
| Verwijderen | **Buiten scope.** Bewust niet gekozen. |
| Naamuniciteit | Hoofdletterongevoelig, getrimd. De `@unique` blijft als vangnet. |
| De `wbso`-tag | Hernoemen wordt geweigerd. Samenvoegen náár `wbso` mag wel. |
| Plek in het menu | Onder **Beheer**, naast Projecten. |

Omdat verwijderen ontbreekt, kun je een weestag alleen kwijtraken door hem te hernoemen naar een
bestaande tag en te laten samenvoegen. Is er geen zinnige tag om hem in te laten opgaan, dan blijft
hij staan — zichtbaar gemarkeerd, maar aanwezig. Dat is een aanvaarde consequentie, geen omissie.

## Deel 1: de naamregel

Geen schemawijziging. `Tag.name` blijft `@unique`.

De database-eis is hoofdlettergevoelig, de eis van de gebruiker niet. Zoals bij projectnamen in
traject 3 ligt de echte controle daarom in de applicatie en dient `@unique` als vangnet tegen
gelijktijdig opslaan.

Eén gedeelde functie in `src/lib/api.ts`, naast `projectNameTakenError` en
`projectMembershipError` uit de vorige trajecten — daar wonen de helpers die zelf een query doen en
door meerdere routes gedeeld worden:

```ts
export async function findTagByName(name: string): Promise<{ id: string; name: string } | null>;
```

Geeft de bestaande tag terug bij een hoofdletterongevoelige treffer, anders `null`. De aanroepers
bepalen zelf wat een treffer betekent: bij aanmaken is het een weigering, bij hernoemen een
samenvoegvraag, bij het projectformulier een stille hergebruik.

Namen worden getrimd in zod (`z.string().trim().min(1)`).

Weigering bij aanmaken: status 400 met `{ error: "Er bestaat al een tag met deze naam" }`.

**Het projectformulier gaat hier ook doorheen.** Dat is nu juist de plek waar duplicaten ontstaan,
want daar typ je vrij. `connectOrCreate` matcht exact, dus `Marketing` naast `marketing` glipt er
vandaag doorheen. De tagnamen die `POST /api/projects` en `PUT /api/projects/[id]` ontvangen worden
daarom eerst door `findTagByName` gehaald en waar mogelijk vervangen door de bestaande schrijfwijze,
vóór de `connectOrCreate`. Zo levert een hoofdletterafwijking een koppeling aan de bestaande tag op
in plaats van een tweede rij.

## Deel 2: de tagpagina

Een nieuwe adminonly pagina `/tags`, met een menu-item onder **Beheer** naast Projecten. Niet onder
Instellingen: tags horen bij projecten, niet bij configuratie.

Eén tabel met per tag:

| Kolom | Inhoud |
|---|---|
| Tag | De naam. Bij `wbso` een badge **"gebruikt door de loonverwerking"**. Bij nul projecten een badge **"niet in gebruik"**. |
| Projecten | Aantal actieve projecten. |
| Gearchiveerd | Aantal gearchiveerde projecten, of `—`. |
| — | Potlood: hernoemen. |

Een rij is uitklapbaar en toont dan de projecten eronder als `Klant / Project`, gearchiveerde
gemarkeerd. Puur lezen; koppelen doe je op `/projects`.

Boven de tabel een knop **Tag toevoegen** met één veld. Zo kun je een tag klaarzetten voordat je
hem in bulk toewijst, wat nu niet kan.

## Deel 3: hernoemen en samenvoegen

Eén actie met twee uitkomsten, want in de praktijk zijn het hetzelfde: hernoem je `Marketng` naar
`Marketing` terwijl die bestaat, dan is samenvoegen het enige zinnige antwoord.

`PUT /api/tags/[id]` met `{ name }`:

1. Is de naam (hoofdletterongevoelig, getrimd) gelijk aan de huidige naam van deze tag, dan alleen
   de schrijfwijze bijwerken.
2. Bestaat er een **andere** tag met die naam, dan antwoordt de route **niet** met een fout maar met
   `{ conflict: { id, name, projectCount } }` en status 200, zonder iets te wijzigen. De client
   toont dan: *"`Marketing` bestaat al met 6 projecten. Samenvoegen? De 3 projecten van `Marketng`
   worden aan `Marketing` gekoppeld en `Marketng` verdwijnt."*
3. Bevestigt de gebruiker, dan stuurt de client `PUT` opnieuw met `{ name, mergeInto: <id> }`. De
   route verhuist de projecten en verwijdert de bronrij, in één `$transaction`.

De verhuizing is een `connect` van de doeltag op elk project van de brontag. Een project dat aan
beide hing krijgt er niet twee keer één: de relatie is een set, `connect` op een bestaande
koppeling is een no-op.

**De `wbso`-tag mag niet hernoemd worden.** De loonverwerking zoekt hardgecodeerd op die naam;
hernoemen laat de WBSO-uren stilzwijgend naar nul gaan zonder enig signaal in de UI. De route
weigert dat met status 400 en `{ error: "Deze tag wordt gebruikt door de loonverwerking en kan niet hernoemd worden" }`.
De pagina toont de badge zodat het niet als willekeur voelt.

Samenvoegen **naar** `wbso` blijft toegestaan: dan verhuizen er projecten naar de tag die de
loonverwerking gebruikt, en dat is precies de bedoeling. Wil je die naam ooit echt wijzigen, dan
moet hij ook in `src/app/api/payroll/route.ts` mee; dat hoort een codewijziging te zijn.

Aanmaken is `POST /api/tags` met `{ name }`. Beide routes zijn adminonly.

**`GET /api/tags` blijft ongewijzigd.** Hij is bereikbaar voor elke sessie omdat de rapportfilters
erop draaien, en hij geeft kale tags terug zonder aantallen. De tagpagina heeft die aantallen wél
nodig, maar is een servercomponent en haalt ze rechtstreeks met Prisma op — net zoals
`src/app/(app)/projects/page.tsx` zijn eigen query doet. Voeg dus geen `_count` of `include` toe aan
`GET /api/tags`: dat zou elke ingelogde medewerker een volledige projectlijst per tag geven, terwijl
de pagina die gegevens al adminonly binnenhaalt.

## Deel 4: tags in bulk toewijzen

`/projects` heeft sinds traject 3 een selectiekolom met een selecteer-alles, en de afgeleide
`visible` → `selectable` → `selectedVisible`. Die keten wordt hergebruikt: de tagknoppen lezen
`selectedVisible`, net als de archiveerknop, zodat je nooit een project kunt taggen dat je niet ziet
staan.

Zodra er iets aangevinkt is verschijnen naast **Archiveer geselecteerde (N)** twee knoppen:
**Tag toevoegen** en **Tag verwijderen**. Beide openen een dialoogje met één keuzelijst van
bestaande tags en een bevestigknop. Eén tag per actie.

`POST /api/projects/bulk-tag` met `{ ids: string[], tagId: string, action: "add" | "remove" }`,
adminonly, gevalideerd met zod (`ids` min 1, max 500 — dezelfde vorm als `/api/entries/bulk` en
`/api/projects/bulk-archive`).

De route draait één `$transaction` met per project een `update` die de tag `connect`t of
`disconnect`t. Dat kan niet met één `updateMany`, want die kan geen relaties wijzigen.

Het antwoord is `{ count }`, waarbij `count` telt hoeveel projecten **daadwerkelijk** veranderden —
een project dat de tag al had bij `add`, of hem niet had bij `remove`, telt niet mee. De client
meldt dat expliciet wanneer `count` lager is dan het aantal geselecteerde projecten, zodat
"8 geselecteerd, 3 gewijzigd" niet als fout leest.

Gearchiveerde rijen hebben geen selectievakje, dus die vallen er vanzelf buiten.

## Testen

Volgens het patroon van de repo: pure functies in `src/lib/` met vitest, geen component- of
API-tests.

Er is één stuk pure logica dat een test verdient, in `src/lib/tags.ts`:

```ts
export function normalizeTagName(name: string): string;
export function isReservedTagName(name: string): boolean;
```

`normalizeTagName` trimt en maakt kleine letters — de sleutel waarop vergeleken wordt.
`isReservedTagName` geeft `true` voor `wbso` in elke schrijfwijze. Die naam staat vandaag als
letterlijke string in `payroll/route.ts`; hij verhuist naar deze module zodat er één plek is waar
hij gedefinieerd staat en de payrollroute en de tagroute niet uit elkaar kunnen lopen.

`src/lib/tags.test.ts`:

- `normalizeTagName(" Marketing ")` → `"marketing"`.
- `normalizeTagName("MARKETING")` → `"marketing"`.
- Twee schrijfwijzen van dezelfde naam normaliseren naar dezelfde sleutel.
- Een naam die alleen uit spaties bestaat → lege string.
- `isReservedTagName("wbso")`, `("WBSO")` en `(" Wbso ")` → `true`.
- `isReservedTagName("wbso2")` en `("efro")` → `false`.

De rest — de conflictafhandeling bij hernoemen, de bulkroute, de pagina — is querycode en
formuliertoestand en wordt handmatig nagelopen.

Handmatig na te lopen:

- Een tag aanmaken die al bestaat, met andere hoofdletters → weigering.
- In het projectformulier een bestaande tag met andere hoofdletters typen → koppelt aan de
  bestaande tag, er komt geen tweede rij bij.
- Een tag hernoemen naar een vrije naam → slaat op.
- Een tag hernoemen naar een bestaande naam → de samenvoegvraag, met het juiste aantal projecten.
- Samenvoegen bevestigen → de projecten hangen aan de doeltag, de brontag is weg, een project dat
  aan beide hing komt één keer voor.
- `WBSO` proberen te hernoemen → weigering met de reden.
- Een andere tag samenvoegen naar `WBSO` → mag, en de loonverwerking telt de nieuwe projecten mee.
- Vijf projecten aanvinken, een tag toevoegen → de andere tags van die projecten staan er nog.
- Dezelfde vijf nogmaals dezelfde tag toevoegen → `count` is 0 en dat wordt gemeld.
- Vijf projecten aanvinken, een tag verwijderen → alleen die tag verdwijnt.
- Aanvinken, dan het statusfilter wijzigen → de tagknoppen tellen alleen wat nog zichtbaar is.
- Als niet-admin `POST /api/tags`, `PUT /api/tags/[id]` en `POST /api/projects/bulk-tag`
  aanroepen → 403.
- De tagpagina toont `EFRO - WP1 programmeerbare hardware` met de badge "niet in gebruik".

## Uitrol

Geen schemawijziging, geen migratie, geen backfill. Alleen deployen.

## Buiten scope

- **Tags verwijderen.** Bewust niet gekozen. Een weestag verdwijnt alleen via samenvoegen.
- Meerdere tags in één bulkactie.
- Tags op klanten, medewerkers of registraties.
- Filteren van de projectenlijst op tag.
- Een opruimactie voor ongebruikte tags. Ze worden nu zichtbaar gemarkeerd; dat is de eerste stap.
- De naam `wbso` configureerbaar maken in plaats van hardgecodeerd.
