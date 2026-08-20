"use client";
import { format } from "date-fns";
import { cn } from "@/lib/utils";

/**
 * De rij "Op kantoor" onder het weekraster van het urenscherm.
 *
 * Een eigen rij en geen kolom in `WeekGrid`, om twee redenen: dat raster is
 * gedeeld met het km-scherm, dat niets met kantoordagen te maken heeft, en elke
 * dag is daar al een knop — een vinkje daarin nestelen levert geneste
 * klikgebieden op. De rij gebruikt hetzelfde raster van acht kolommen en
 * dezelfde minimumbreedte, zodat de vakjes onder hun dag staan.
 */
export function OfficeDayRow({
  days,
  actief,
  template,
  bewerkbaar,
  bezig,
  onToggle,
}: {
  days: Date[];
  actief: string[];
  template: { name: string; km: number } | null;
  bewerkbaar: boolean;
  /** De dag die op dit moment verwerkt wordt, of null. */
  bezig: string | null;
  onToggle: (dayStr: string, present: boolean) => void;
}) {
  // `template` is altijd dat van de ingelogde gebruiker (zie commuteTemplate
  // in TimeEntriesClient), niet van de eventueel bekeken medewerker. Tooltip
  // en bijschrift gaan dus alleen over de eigen dagen: bij andermans dagen
  // (bewerkbaar = false) blijven de vinkjes zichtbaar, maar zonder tekst die
  // over de verkeerde persoon zou gaan.
  const redenGeenSjabloon = "Geen sjabloon — instellen bij Personeel";
  const uitleg = !bewerkbaar
    ? undefined
    : template
      ? `${template.name} — ${template.km.toLocaleString("nl-NL")} km`
      : "Er is nog geen woon-werksjabloon ingesteld. Vraag een beheerder dit onder Personeel in te stellen.";

  return (
    <div className="overflow-x-auto border-b">
      <div className="grid grid-cols-8 min-w-[560px] items-center">
        {days.map((day) => {
          const dayStr = format(day, "yyyy-MM-dd");
          const aan = actief.includes(dayStr);
          return (
            <label
              key={dayStr}
              className={cn(
                "flex items-center gap-2 px-3 py-2 text-xs",
                bewerkbaar && template ? "cursor-pointer" : "cursor-default",
              )}
              title={uitleg}
            >
              <input
                type="checkbox"
                className="h-4 w-4 rounded border-input accent-primary"
                checked={aan}
                disabled={!bewerkbaar || !template || bezig === dayStr}
                onChange={(e) => onToggle(dayStr, e.target.checked)}
              />
              <span className="text-muted-foreground">Kantoor</span>
            </label>
          );
        })}
        {/* Eigen label ("Sjabloon") in plaats van alleen een getal: zonder
            label staat deze cel direct onder de kolomkop "Totaal" van het
            weekraster erboven en leest de sjabloonafstand als een
            weektotaal. De sjabloonnaam (in plaats van alleen de afstand)
            maakt meteen ook zichtbaar wélk sjabloon het vinkje gebruikt. */}
        <div className="flex flex-col items-end px-3 py-2 text-xs" title={uitleg}>
          {bewerkbaar && (
            <>
              <span className="font-semibold text-muted-foreground">Sjabloon</span>
              <span className="text-muted-foreground mt-0.5 truncate max-w-full">
                {template ? `${template.name} · ${template.km.toLocaleString("nl-NL")} km` : redenGeenSjabloon}
              </span>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
