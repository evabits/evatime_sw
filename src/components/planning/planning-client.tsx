"use client";
import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ChevronDown, ChevronRight } from "lucide-react";
import { differenceInCalendarDays } from "date-fns";
import { formatDate } from "@/lib/utils";
import {
  groupByCustomer, projectBar, unplannedProjects, timelineWindow,
  barGeometry, todayOffsetPct, type PlanningProject,
} from "@/lib/planning";

/**
 * Pixels per dag per zoomstand. Alleen de totale breedte verandert; de plaatsing
 * blijft percentueel, dus de rekenkunde hoeft niets van de zoom te weten.
 */
const ZOOM = {
  weken: { label: "Weken", pxPerDag: 24 },
  maanden: { label: "Maanden", pxPerDag: 6 },
  kwartalen: { label: "Kwartalen", pxPerDag: 2 },
} as const;
type ZoomStand = keyof typeof ZOOM;

const NAAMKOLOM_PX = 224;

export function PlanningClient({ projects }: { projects: PlanningProject[] }) {
  const [zoom, setZoom] = useState<ZoomStand>("maanden");
  const [open, setOpen] = useState<Record<string, boolean>>({});

  const vandaag = new Date();
  const venster = timelineWindow(projects, vandaag);
  // Via date-fns en niet via milliseconden: bij de overgang naar wintertijd
  // duurt een dag hier 25 uur en telt een deling door 86.400.000 verkeerd.
  const dagen = differenceInCalendarDays(venster.end, venster.start) + 1;
  const breedte = dagen * ZOOM[zoom].pxPerDag;
  const vandaagPct = todayOffsetPct(vandaag, venster);

  const groepen = groupByCustomer(projects.filter((p) => projectBar(p) !== null));
  const ongepland = unplannedProjects(projects);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <h1 className="text-2xl font-bold">Tijdlijn</h1>
        <div className="flex gap-1">
          {(Object.keys(ZOOM) as ZoomStand[]).map((stand) => (
            <Button
              key={stand}
              size="sm"
              variant={zoom === stand ? "default" : "outline"}
              onClick={() => setZoom(stand)}
            >
              {ZOOM[stand].label}
            </Button>
          ))}
        </div>
      </div>

      <Card>
        <CardContent className="p-0 overflow-x-auto">
          <div className="relative" style={{ minWidth: NAAMKOLOM_PX + breedte }}>
            {vandaagPct !== null && (
              <div
                className="absolute top-0 bottom-0 w-px bg-destructive/70 z-10"
                style={{ left: NAAMKOLOM_PX + (vandaagPct / 100) * breedte }}
                title={`Vandaag — ${formatDate(vandaag)}`}
              />
            )}

            {groepen.map((groep) => (
              <div key={groep.customerName}>
                <div className="px-3 py-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground bg-muted/50">
                  {groep.customerName}
                </div>
                {groep.projects.map((project) => {
                  const bar = projectBar(project)!;
                  const geo = barGeometry(bar.start, bar.end, venster);
                  const uitgeklapt = open[project.id] ?? false;
                  return (
                    <div key={project.id}>
                      <div className="flex items-stretch border-b">
                        <button
                          type="button"
                          className="flex items-center gap-1 shrink-0 px-3 py-2 text-sm text-left hover:bg-muted/50"
                          style={{ width: NAAMKOLOM_PX }}
                          onClick={() => setOpen((o) => ({ ...o, [project.id]: !uitgeklapt }))}
                        >
                          {project.tasks.length > 0
                            ? (uitgeklapt ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />)
                            : <span className="w-3.5" />}
                          <span className="truncate">{project.name}</span>
                        </button>
                        <div className="relative flex-1 py-2" style={{ width: breedte }}>
                          <div
                            className="absolute h-4 rounded bg-primary"
                            style={{ left: `${geo.leftPct}%`, width: `${geo.widthPct}%` }}
                            title={`${project.name} — ${formatDate(bar.start)} t/m ${formatDate(bar.end)}`}
                          />
                        </div>
                      </div>

                      {uitgeklapt && project.tasks.map((taak) => {
                        const tGeo = barGeometry(taak.startDate, taak.endDate, venster);
                        return (
                          <div key={taak.id} className="flex items-stretch border-b bg-muted/20">
                            <div
                              className="shrink-0 px-3 py-1.5 pl-8 text-sm text-muted-foreground truncate"
                              style={{ width: NAAMKOLOM_PX }}
                            >
                              {taak.name}
                            </div>
                            <div className="relative flex-1 py-1.5" style={{ width: breedte }}>
                              <div
                                className="absolute h-3 rounded bg-primary/50"
                                style={{ left: `${tGeo.leftPct}%`, width: `${tGeo.widthPct}%` }}
                                title={`${taak.name} — ${formatDate(taak.startDate)} t/m ${formatDate(taak.endDate)}`}
                              />
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  );
                })}
              </div>
            ))}

            {groepen.length === 0 && (
              <p className="p-6 text-sm text-muted-foreground">
                Nog niets gepland. Geef hieronder een project een start- en einddatum.
              </p>
            )}
          </div>
        </CardContent>
      </Card>

      {ongepland.length > 0 && (
        <Card>
          <CardHeader><CardTitle className="text-base">Nog niet gepland</CardTitle></CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            {ongepland.map((p) => (
              <span key={p.id} className="rounded border px-2 py-1 text-sm">{p.name}</span>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
