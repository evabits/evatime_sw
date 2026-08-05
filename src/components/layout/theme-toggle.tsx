"use client";
import { useEffect, useRef, useSyncExternalStore } from "react";
import { Sun, Moon, Monitor } from "lucide-react";
import { resolveTheme, readStoredTheme, THEME_STORAGE_KEY, type ThemeChoice } from "@/lib/theme";

const KEUZES: Array<{ waarde: ThemeChoice; label: string; Icon: typeof Sun }> = [
  { waarde: "light", label: "Licht", Icon: Sun },
  { waarde: "dark", label: "Donker", Icon: Moon },
  { waarde: "system", label: "Systeem", Icon: Monitor },
];

// --- Kleine externe store rond localStorage[THEME_STORAGE_KEY] ---
//
// useSyncExternalStore leest hier in plaats van een useEffect die
// localStorage naar useState kopieert (dat is een set-state-in-effect en
// mist bovendien wijzigingen uit een ander tabblad). De module-scope
// hieronder is de "store": subscribe/getSnapshot/getServerSnapshot moeten
// stabiele referenties zijn, en dat zijn ze vanzelf buiten de component.

type Listener = () => void;
const listeners = new Set<Listener>();

// Als setItem gooit (geblokkeerde site-data), blijft de keuze voor deze
// sessie toch gelden: de store leest dan uit het geheugen in plaats van
// localStorage, tot een schrijf-actie wél lukt of de pagina herlaadt (dan
// is deze module opnieuw geladen en is het geheugen leeg).
let noodgeheugen: ThemeChoice | null = null;

function meldWijziging() {
  for (const luisteraar of listeners) luisteraar();
}

function abonneer(onStoreChange: Listener) {
  listeners.add(onStoreChange);
  // Vuurt niet in het tabblad dat zelf schrijft (zie schrijfThema), maar wel
  // in andere tabbladen — daarmee pikt deze store een wijziging elders op.
  const opStorage = (event: StorageEvent) => {
    if (event.key === THEME_STORAGE_KEY || event.key === null) onStoreChange();
  };
  window.addEventListener("storage", opStorage);
  return () => {
    listeners.delete(onStoreChange);
    window.removeEventListener("storage", opStorage);
  };
}

// Geeft de ThemeChoice-string zelf terug, nooit een nieuw object: bij
// ongewijzigde inhoud moet dit voor React via Object.is gelijk blijven aan
// de vorige aanroep, anders rendert useSyncExternalStore eindeloos door.
//
// De try/catch hier vangt iets anders dan die in readStoredTheme: een
// geblokkeerde browser (Chrome "Alle cookies blokkeren" e.d.) laat al de
// property-access `localStorage` zélf een SecurityError gooien, nog vóór
// `.getItem` wordt aangeroepen. readStoredTheme vangt alleen een gooiende
// getItem op; zonder deze extra laag gooit haalSnapshot tijdens het
// hydrateren, en zonder error boundary onder src/app neemt dat de hele app
// mee. Beide guards blijven dus nodig — niet "vereenvoudigen" tot één.
function haalSnapshot(): ThemeChoice {
  try {
    return noodgeheugen ?? readStoredTheme(localStorage);
  } catch {
    return "system";
  }
}

// Op de server bestaat localStorage niet; deze waarde moet gelijk zijn aan
// wat de allereerste client-render ook gebruikt (zie ThemeToggle hieronder),
// anders klaagt React over een hydratatie-mismatch.
function haalServerSnapshot(): ThemeChoice {
  return "system";
}

function schrijfThema(waarde: ThemeChoice) {
  try {
    localStorage.setItem(THEME_STORAGE_KEY, waarde);
    noodgeheugen = null;
  } catch {
    // Geblokkeerd (bv. Chrome "Alle cookies blokkeren"): onthoud de keuze
    // in het geheugen zodat dit tabblad hem toch toont.
    noodgeheugen = waarde;
  }
  meldWijziging();
}

export function ThemeToggle() {
  const keuze = useSyncExternalStore(abonneer, haalSnapshot, haalServerSnapshot);

  // De allereerste client-render gebruikt haalServerSnapshot() ("system"),
  // ook als de echte opgeslagen keuze "light" of "dark" is — useSyncExternalStore
  // corrigeert dat vanzelf met een extra render zodra het de echte waarde
  // kent. Tot dat zeker is, mag dit effect de klasse op <html> niet zetten
  // op basis van die placeholder: het inline script in layout.tsx heeft hem
  // dan al goed gezet, en "system" toepassen zou hem ten onrechte kunnen
  // overschrijven. Een ref (geen state!) onthoudt of dit de eerste aanroep
  // is, zonder zelf een extra render te veroorzaken.
  const eersteAanroep = useRef(true);

  useEffect(() => {
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const magVertrouwen = !(eersteAanroep.current && keuze === "system");
    eersteAanroep.current = false;
    const pas = () => {
      const thema = resolveTheme(keuze, media.matches);
      document.documentElement.classList.toggle("dark", thema === "dark");
    };
    if (magVertrouwen) pas();
    // Alleen meebewegen met het besturingssysteem als de gebruiker daar zelf
    // voor gekozen heeft; anders overrulet het systeem zijn keuze.
    if (keuze !== "system") return;
    media.addEventListener("change", pas);
    return () => media.removeEventListener("change", pas);
  }, [keuze]);

  return (
    <div className="flex gap-1 rounded-md border p-1" role="group" aria-label="Thema">
      {KEUZES.map(({ waarde, label, Icon }) => (
        <button
          key={waarde}
          type="button"
          onClick={() => schrijfThema(waarde)}
          aria-pressed={keuze === waarde}
          title={label}
          className={`flex flex-1 items-center justify-center rounded-sm p-1.5 transition-colors ${
            keuze === waarde
              ? "bg-accent text-accent-foreground"
              : "text-muted-foreground hover:bg-accent/50"
          }`}
        >
          <Icon className="h-4 w-4" />
          <span className="sr-only">{label}</span>
        </button>
      ))}
    </div>
  );
}
