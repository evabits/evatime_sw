"use client";
import { useState } from "react";
import { Eye } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * Blijft staan zolang het meekijken aanstaat, op elk scherm. Niet weg te
 * klikken: vergeten dat je met andermans ogen kijkt is precies wat je hier
 * niet wilt.
 */
export function ImpersonationBanner({ naam, realName }: { naam: string; realName: string }) {
  const [bezig, setBezig] = useState(false);

  async function stoppen() {
    setBezig(true);
    const res = await fetch("/api/impersonate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ stop: true }),
    });
    if (!res.ok) {
      setBezig(false);
      alert("Stoppen is niet gelukt");
      return;
    }
    // Volledig herladen: elke servercomponent heeft zijn data nog als de
    // medewerker opgehaald.
    window.location.href = "/personeel";
  }

  return (
    <div className="sticky top-0 z-50 flex flex-wrap items-center justify-between gap-2 bg-amber-500 px-4 py-2 text-sm text-amber-950">
      <span className="flex items-center gap-2">
        <Eye className="h-4 w-4" />
        Je kijkt mee als <strong>{naam}</strong> — alleen-lezen. Je bent ingelogd als {realName}.
      </span>
      <Button size="sm" variant="secondary" onClick={stoppen} disabled={bezig}>
        {bezig ? "Bezig..." : "Stoppen"}
      </Button>
    </div>
  );
}
