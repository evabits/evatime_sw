# Meekijken als medewerker

**Datum:** 2026-08-14

## Het probleem

Een beheerder kan niet zien wat een medewerker ziet. Of iemands vakantiesaldo
klopt, of het weekrooster goed doorwerkt, of de juiste projecten in de
keuzelijst staan — dat is nu alleen te achterhalen door de data te lezen en te
redeneren over wat het scherm ermee zou doen. Precies daar sluipen de fouten in
die deze app de afgelopen weken opleverde.

## Het ontwerp

### 1. De identiteit gaat in de sessie

Elke pagina en elke route in deze app haalt de gebruiker uit `auth()` en leest
daar `session.user.id` en `role`. Zet je die twee om naar een andere
medewerker, dan volgt de hele app vanzelf: dezelfde code, andere invoer. Geen
enkel scherm hoeft aangepast, en juist daarom is wat je ziet werkelijk wat zij
ziet — niet een tweede weergave die ernaast kan gaan lopen.

De sessie is een JWT. Tijdens het meekijken bevat het token:

| Veld | Betekenis |
|---|---|
| `id`, `role`, `name`, `email` | de medewerker die je bekijkt |
| `realId`, `realRole`, `realName` | de beheerder die je werkelijk bent |

Ontbreekt `realId`, dan kijk je niet mee. Ook `name` en `email` gaan mee om,
zodat het gebruikersmenu de medewerker toont en niet jou; `realName` houdt jouw
naam vast voor de balk.

Het token is servergetekend, dus een browser kan dit niet zelf zetten. Het
omzetten gebeurt in de `jwt`-callback van NextAuth, die zelf controleert dat je
échte rol ADMIN is — `realRole` als je al meekijkt, anders `role`. Wissel je
van de ene medewerker naar de andere, dan blijven de `real*`-velden staan zoals
ze waren; je wordt nooit "de beheerder die je aan het bekijken was".

De doelmedewerker moet bestaan en niet gearchiveerd zijn.

### 2. Alleen-lezen

`src/proxy.ts` — in Next.js 16 de naam voor wat vroeger middleware heette — ziet
elke aanvraag naar de app, inclusief alle API-routes. Bevat de sessie een
`realId` en is de methode geen GET, HEAD of OPTIONS, dan antwoordt hij
onmiddellijk met `403` en `{ "error": "Meekijken is alleen-lezen" }`.

Eén controle dekt daarmee alle schermen en alle routes tegelijk, ook server
actions, want die zijn eveneens POST. De schermen tonen die tekst vanzelf: hun
foutafhandeling zet `err.error` al in beeld.

De route die het meekijken zelf aan- en uitzet is uitgezonderd, anders kun je
er niet meer uit.

De matcher van de proxy laat vier paden erlangs: `api/auth` (in- en uitloggen),
`login`, en de openbare `invoice/<token>`- en `quote/<token>`-pagina's. De
eerste twee gaan over de sessie, de laatste twee zijn leespagina's zonder
schrijfpad. Geen ervan raakt medewerkerdata, dus het gat is dicht genoeg —
maar het staat hier zodat een volgende lezer het weet.

De documentatie van Next.js waarschuwt dat proxy geen volwaardige
autorisatielaag is. Dat klopt, en daarom hangt de beveiliging er ook niet aan:
wie je bent staat in een getekend token en wordt in de `jwt`-callback bepaald.
De proxy is de grendel op het schrijven, niet op het wie.

De grendel is "geen GET", niet "leest alleen". Drie cron-routes zijn zelf een
GET en versturen daarbinnen mail en schrijven naar de database:
`src/app/api/cron/hours-reminder/route.ts`,
`src/app/api/cron/review-reminder/route.ts` en
`src/app/api/cron/contract-expiry/route.ts` (die ook `expiryReminderSentAt`
stempelt). Die zijn uitgezonderd van de grendel omdat ze een GET zijn, niet
omdat ze met opzet zijn vrijgesteld — de bewering hierboven dat er tijdens het
meekijken geen enkele schrijfactie kan plaatsvinden is dus niet helemaal
waar.

### 3. Het scherm

Zolang het aanstaat, staat er bovenaan elke pagina een balk: *"Je kijkt mee als
Merlijn Kunst — alleen-lezen"* met een knop **Stoppen**. Hij zit in de
app-layout, dus hij is overal zichtbaar en niet weg te klikken. Je kunt niet
vergeten dat je meekijkt.

Starten doe je op /personeel, met een knop **Bekijk als** per medewerker — daar
sla je die persoon toch al open voor contract en rooster.

### 4. Hoe het omzetten gebeurt

Er komt één route bij, `POST /api/impersonate`, met `{ userId }` om te starten
en `{ stop: true }` om te stoppen. Die roept NextAuth's `unstable_update` aan,
waarna de `jwt`-callback met `trigger === "update"` het token omzet.

Deze app heeft geen `SessionProvider` en gebruikt nergens `useSession` — alles
loopt via `auth()` in servercomponenten. Blijkt `unstable_update` vanuit een
route handler de sessiecookie niet te herschrijven, dan is de terugvaloptie een
minimale `SessionProvider` in de app-layout met `useSession().update()` vanaf
de knop. Dat is meer bedrading, dus alleen als het moet.

## Wat er verandert in de code

- `src/lib/impersonation.ts` (nieuw) — de twee pure functies: mag deze aanvraag
  schrijven, en hoe ziet het token eruit na starten of stoppen.
- `src/lib/impersonation.test.ts` (nieuw) — testen daarvan.
- `src/lib/auth.ts` — de `jwt`-callback verwerkt `trigger === "update"`, de
  `session`-callback geeft de balk zijn gegevens door.
- `src/proxy.ts` — de alleen-lezen grendel.
- `src/app/api/impersonate/route.ts` (nieuw) — starten en stoppen.
- `src/app/(app)/layout.tsx` — de balk.
- `src/components/personeel/personeel-list-client.tsx` — de knop "Bekijk als"
  per medewerker.

Geen schemawijziging, dus geen migratie.

## Testen

Pure functies, in `src/lib/impersonation.test.ts`:

- een GET mag altijd, ook tijdens meekijken;
- een POST mag wanneer je niet meekijkt;
- een POST wordt geweigerd tijdens meekijken;
- de route die het meekijken omzet mag ook tijdens meekijken;
- PUT, PATCH en DELETE worden net zo geweigerd als POST;
- starten vanaf een beheerderstoken zet id en rol om en bewaart de echte
  identiteit;
- starten vanaf een niet-beheerderstoken wordt geweigerd;
- wisselen van medewerker terwijl je al meekijkt houdt de oorspronkelijke
  `real*`-velden vast;
- stoppen zet alles terug en laat geen `real*`-velden achter;
- stoppen terwijl je niet meekijkt verandert niets.

De balk, de knop en de sessiebedrading zijn React en NextAuth en worden hier
niet automatisch getest. In de draaiende app na te lopen: "Bekijk als" op een
medewerker toont haar dashboard met haar vakantiesaldo en haar weekrooster; de
balk staat er op elk scherm; uren toevoegen levert "Meekijken is alleen-lezen";
Stoppen brengt je terug als jezelf met je eigen rechten; en een medewerker die
zelf de route aanroept krijgt niets voor elkaar.
