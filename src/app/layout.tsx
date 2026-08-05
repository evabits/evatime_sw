import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Script from "next/script";
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
  title: "EvaTime",
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
        {children}
        {/* App Router-lagouts mogen geen handgeschreven <head> hebben (zie
            node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/layout.md,
            "You should not manually add <head> tags"). next/script met
            strategy="beforeInteractive" is het gedocumenteerde alternatief:
            het draait vóór hydratatie en Next.js hijst het zelf naar <head>,
            ongeacht waar het component staat (zie .../02-components/script.md). */}
        <Script
          id="theme-script"
          strategy="beforeInteractive"
          dangerouslySetInnerHTML={{ __html: themaScript }}
        />
      </body>
    </html>
  );
}
