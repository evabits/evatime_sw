"use client";
import { useEffect, useState } from "react";
import { Sun, Moon, Monitor } from "lucide-react";
import { resolveTheme, readStoredTheme, THEME_STORAGE_KEY, type ThemeChoice } from "@/lib/theme";

const KEUZES: Array<{ waarde: ThemeChoice; label: string; Icon: typeof Sun }> = [
  { waarde: "light", label: "Licht", Icon: Sun },
  { waarde: "dark", label: "Donker", Icon: Moon },
  { waarde: "system", label: "Systeem", Icon: Monitor },
];

export function ThemeToggle() {
  // null betekent "nog niet uit localStorage gelezen". Op de server bestaat
  // localStorage niet, dus lezen kan pas na het hydrateren; tot die tijd mag
  // dit component de klasse niet aanraken, want het inline script in de
  // layout heeft hem dan al goed gezet.
  const [keuze, setKeuze] = useState<ThemeChoice | null>(null);

  useEffect(() => {
    setKeuze(readStoredTheme(localStorage));
  }, []);

  useEffect(() => {
    if (keuze === null) return;
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const pas = () => {
      const thema = resolveTheme(keuze, media.matches);
      document.documentElement.classList.toggle("dark", thema === "dark");
    };
    pas();
    // Alleen meebewegen met het besturingssysteem als de gebruiker daar zelf
    // voor gekozen heeft; anders overrulet het systeem zijn keuze.
    if (keuze !== "system") return;
    media.addEventListener("change", pas);
    return () => media.removeEventListener("change", pas);
  }, [keuze]);

  function kies(waarde: ThemeChoice) {
    // Een geblokkeerde write mag de klik niet breken: de in-memory keuze
    // geldt dan nog steeds voor deze sessie, alleen onthoudt de browser hem niet.
    try {
      localStorage.setItem(THEME_STORAGE_KEY, waarde);
    } catch {
      // stil negeren
    }
    setKeuze(waarde);
  }

  return (
    <div className="flex gap-1 rounded-md border p-1" role="group" aria-label="Thema">
      {KEUZES.map(({ waarde, label, Icon }) => (
        <button
          key={waarde}
          type="button"
          onClick={() => kies(waarde)}
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
