# Optionele dark mode

**Datum:** 2026-08-05

## Waarom

EvaTime is altijd licht. Wie de rest van zijn dag in een donkere editor zit, krijgt
bij het boeken van uren een wit scherm in zijn gezicht. De kleuren zitten al
volledig in CSS-variabelen, dus het thema kantelen is vooral een kwestie van een
tweede set waarden — het werk zit in de plekken die die variabelen omzeilen.

## Wat het wordt

Een schakelaar met drie standen — licht, donker, systeem — onderin de sidebar,
onthouden in `localStorage`. Geen migratie, geen serverwerk, geen extra
dependency.

De keuze geldt per browser. Dat is bewust: hem per gebruiker opslaan vraagt een
kolom op `User`, een migratie op de live database en een API-route, en dat weegt
niet op tegen "thuis en op kantoor apart instellen".

## Het mechanisme

**Tailwind 4.2.4 laat `dark:` standaard naar `prefers-color-scheme` kijken.** Dat
moet naar de klasse. Eén regel bovenin `src/app/globals.css`:

```css
@custom-variant dark (&:where(.dark, .dark *));
```

Daaronder een `.dark { … }`-blok dat dezelfde negentien tokens overschrijft die
`:root` nu al zet. Alles in de app leest die tokens via `hsl(var(--token))`,
inclusief de bestaande `* { border-color: hsl(var(--border)) }`, dus daarmee
kantelt de hele app in één keer mee.

De negentien waarden:

```css
.dark {
  --background: 222 47% 7%;
  --foreground: 210 40% 98%;
  --card: 222 40% 11%;
  --card-foreground: 210 40% 98%;
  --popover: 222 40% 11%;
  --popover-foreground: 210 40% 98%;
  --primary: 121 40% 55%;
  --primary-foreground: 222 47% 9%;
  --secondary: 217 33% 18%;
  --secondary-foreground: 210 40% 98%;
  --muted: 217 33% 18%;
  --muted-foreground: 215 20% 65%;
  --accent: 217 33% 18%;
  --accent-foreground: 210 40% 98%;
  --destructive: 0 72% 58%;
  --destructive-foreground: 210 40% 98%;
  --border: 217 33% 20%;
  --input: 217 33% 20%;
  --ring: 121 40% 55%;
}
```

Drie keuzes daarin verdienen uitleg.

**`--card` is lichter dan `--background`**, waar de lichte variant ze allebei op
wit heeft. In het donker verdwijnt een kaart die exact de paginakleur heeft; het
verschil van vier procentpunt geeft hem terug zijn rand zonder een lijn te
tekenen. Dat de hoofdinhoud al op `bg-muted/30` staat, werkt daarin mee.

**`--primary` gaat van 36% naar 55% helderheid** met dezelfde tint. Het
EVAbits-groen is gekozen tegen wit; tegen een bijna-zwarte achtergrond zakt het
weg. De tint blijft ongemoeid, dus het is herkenbaar hetzelfde groen.
`--primary-foreground` kantelt mee van bijna-wit naar bijna-zwart, want de tekst
staat nu op een lichte knop.

**`--destructive` verliest verzadiging maar houdt zijn helderheid** — van
`0 84% 60%` naar `0 72% 58%`. Fel verzadigd rood op bijna-zwart gaat trillen.
De helderheid blijft vrijwel gelijk omdat deze token in deze codebase vooral als
`text-destructive` op foutmeldingen staat, en dan is leesbaarheid wat telt; hij
mag niet wegzakken zoals `--primary` dat zou doen.

## Geen witte flits

Elke pagina is server-gerenderd. Zonder maatregel schildert de browser eerst het
lichte thema en pas daarna, als React geladen is, het donkere. Daarom een klein
inline script in de `<head>` van `src/app/layout.tsx` dat vóór het schilderen de
klasse zet, gelezen uit `localStorage` met `matchMedia` als het op systeem staat.

`<html>` krijgt `suppressHydrationWarning`, omdat dat script het element wijzigt
voordat React hydrateert en de server-HTML dus per definitie afwijkt.

**Geen `next-themes`.** Dat is een dependency erbij voor iets wat hier vijftien
regels is, in een app die verder al zijn eigen tokens beheert.

## De schakelaar

Onderin `src/components/layout/sidebar.tsx`, bij de gebruikersnaam en de
uitlogknop. Drie standen: licht, donker, systeem. Hij schrijft `localStorage` en
zet de klasse op `<html>`. Staat hij op systeem, dan luistert hij ook naar
wijzigingen van de systeeminstelling, zodat de app meebeweegt zonder herladen.

De enige echte logica is: opgeslagen keuze plus systeemvoorkeur wordt een
toegepast thema. Die komt als pure functie in `src/lib/theme.ts`:

```ts
resolveTheme(stored: string | null, prefersDark: boolean): "light" | "dark"
```

`"light"` en `"dark"` geven zichzelf terug; `"system"`, `null` en elke onbekende
waarde volgen `prefersDark`. Dat laatste is belangrijk: een kapotte of
handmatig aangepaste `localStorage`-waarde mag nooit een leeg scherm opleveren.

Het inline script kan niet importeren en schrijft dezelfde regel uit. Dat is de
enige bewuste duplicatie in dit ontwerp, en de reden staat als commentaar op
beide plekken.

## De vaste kleuren

Drieënvijftig plekken in negen bestanden gebruiken vaste Tailwind-kleuren in
plaats van tokens. Ze worden allemaal meegenomen, maar niet als drieënvijftig
losse keuzes — één recept, zodat het resultaat consistent is en de diff te
reviewen valt:

| Patroon nu | Wat erbij komt |
|---|---|
| `bg-X-100 text-X-800` (badges, verlofchips) | `dark:bg-X-900/40 dark:text-X-200` |
| `text-X-600` (statuskleuren) | `dark:text-X-400` |
| `bg-X-50`, `bg-X-500/5` (getinte panelen) | `dark:bg-X-950/30` |
| `border-X-200`, `border-X-500/40` | `dark:border-X-900` |

De zwaarste concentratie zit in `src/components/vacation/absence-client.tsx`
(32 plekken: statusbadges en de vijf verlofsoort-chips).

## De grafiek

`src/components/dashboard/dashboard-chart.tsx` viel buiten die telling omdat de
kleuren daar geen Tailwind-klassen zijn. Drie dingen:

- De balk staat hardgecodeerd op `fill="hsl(121 37% 36%)"` — een tweede kopie van
  de primaire kleur. Wordt `hsl(var(--primary))`, waarmee hij meteen ook meebeweegt
  als dat groen ooit verandert.
- De astekst gebruikt de standaardkleur van recharts en krijgt
  `fill: hsl(var(--muted-foreground))`.
- De tooltip tekent standaard een witte doos met een lichte rand. Krijgt een
  `contentStyle` met de card-tokens.

## Wat expres licht blijft

- **`src/lib/email.ts`** — de factuur-e-mails. Die HTML is voor de ontvanger en
  wordt gerenderd door zijn mailclient, die zijn eigen thema heeft. Een donkere
  factuurmail sturen omdat de verzender donker werkt, is onzin.
- **De PDF** via `@react-pdf/renderer`. Een factuur wordt geprint.
- **Het Google-logo** op de loginpagina (`#4285F4` en verder) — merkkleuren.
- **`src/app/icon.svg`** — het favicon.

## Testbaarheid

`resolveTheme` is een pure functie en krijgt tests in `src/lib/theme.test.ts`,
conform de conventie dat alleen pure functies getest worden. Minstens: beide
expliciete keuzes, `"system"` in allebei de richtingen, en de rommelgevallen
(`null` en een onbekende string).

De rest is CSS en één clientcomponent; daar heeft deze repo geen testvorm voor.
Verificatie is `npx tsc --noEmit`, de bestaande suite, en met de hand kijken:
schakelen zonder herladen, herladen zonder flits, en de systeemstand die meebeweegt
als je het thema van je besturingssysteem omzet.
