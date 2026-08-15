import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "EVAtime",
  description: "Time registration and invoicing",
};

/**
 * Zet de thema-klasse voordat de browser iets schildert.
 *
 * Elke pagina is server-gerenderd. Zonder dit script schildert de browser
 * eerst het lichte thema en pas na het laden van React het donkere — een
 * witte flits bij élke navigatie. Daarom inline en blokkerend.
 *
 * Dit is dezelfde regel als resolveTheme in src/lib/theme.ts, met de hand
 * uitgeschreven: een script dat vóór de bundel draait kan niet importeren.
 * Wijzigt die functie, wijzig hier dan mee — de test op THEME_STORAGE_KEY
 * bewaakt alleen de sleutel, niet deze regel.
 */
const themaScript = `
try {
  var keuze = localStorage.getItem("theme");
  var donker = keuze === "dark"
    || (keuze !== "light" && matchMedia("(prefers-color-scheme: dark)").matches);
  if (donker) document.documentElement.classList.add("dark");
} catch (e) {}
`;

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    // suppressHydrationWarning omdat het script hieronder de class van <html>
    // wijzigt vóórdat React hydrateert; de server-HTML wijkt dan per definitie af.
    <html
      lang="nl"
      className={`${geistSans.variable} ${geistMono.variable} h-full`}
      suppressHydrationWarning
    >
      <body className="h-full antialiased">
        {/* Geen handgeschreven <head> (zie
            node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/layout.md:
            geen <title>/<meta> zelf zetten, ivm de Metadata API). Dit is een
            gewoon <script>-element, geen next/script: de inline-variant van
            next/script met strategy="beforeInteractive" wordt in de App
            Router niet als uitvoerbaar script uitgestuurd maar als stub die
            pas na het laden van de clientbundel wordt gedraind
            (node_modules/next/dist/client/script.js en app-bootstrap.js) —
            te laat om de flits te voorkomen. Een kaal <script>-element vóór
            children wordt door de browser tijdens het parsen van de <body>
            uitgevoerd, dus vóór er iets geschilderd is. */}
        <script dangerouslySetInnerHTML={{ __html: themaScript }} />
        {children}
      </body>
    </html>
  );
}
