"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { ChevronDown, ChevronRight, ChevronUp, Plus, Trash2 } from "lucide-react";
import { differenceInCalendarDays } from "date-fns";
import { formatDate } from "@/lib/utils";
import {
  groupByCustomer, projectBar, unplannedProjects, timelineWindow,
  barGeometry, todayOffsetPct, timelineHeader, type PlanningProject,
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
  const router = useRouter();
  const [fout, setFout] = useState("");
  const [bezig, setBezig] = useState(false);
  // Welk venster openstaat. Eén stuk state, want er kan er maar één tegelijk open zijn.
  const [venstertje, setVenstertje] = useState<
    | { soort: "project"; project: PlanningProject }
    | { soort: "taak-nieuw"; project: PlanningProject }
    | { soort: "taak-bewerk"; project: PlanningProject; taak: PlanningProject["tasks"][number] }
    | null
  >(null);
  const [formNaam, setFormNaam] = useState("");
  const [formStart, setFormStart] = useState("");
  const [formEind, setFormEind] = useState("");

  /** ISO voor een <input type="date">; die accepteert niets anders. */
  const isoVoorInvoer = (d: string | Date | null | undefined) =>
    d ? new Date(d).toISOString().slice(0, 10) : "";

  function openProject(project: PlanningProject) {
    setFout("");
    setFormStart(isoVoorInvoer(project.plannedStart));
    setFormEind(isoVoorInvoer(project.plannedEnd));
    setVenstertje({ soort: "project", project });
  }

  function openNieuweTaak(project: PlanningProject) {
    setFout("");
    setFormNaam("");
    setFormStart("");
    setFormEind("");
    setVenstertje({ soort: "taak-nieuw", project });
  }

  function openTaak(project: PlanningProject, taak: PlanningProject["tasks"][number]) {
    setFout("");
    setFormNaam(taak.name);
    setFormStart(isoVoorInvoer(taak.startDate));
    setFormEind(isoVoorInvoer(taak.endDate));
    setVenstertje({ soort: "taak-bewerk", project, taak });
  }

  /** Eén plek voor elke schrijfactie: verstuurt, meldt de fout, en ververst bij succes. */
  async function verstuur(url: string, method: string, body?: unknown) {
    setBezig(true);
    setFout("");
    const res = await fetch(url, {
      method,
      ...(body ? { headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) } : {}),
    });
    setBezig(false);
    if (!res.ok) {
      const payload = await res.json().catch(() => ({}));
      setFout(payload.error ?? "Opslaan mislukt");
      return false;
    }
    setVenstertje(null);
    router.refresh();
    return true;
  }

  async function bewaar() {
    if (!venstertje) return;
    if (venstertje.soort === "project") {
      // De PUT van een project eist naam en status; die sturen we onveranderd mee.
      await verstuur(`/api/projects/${venstertje.project.id}`, "PUT", {
        name: venstertje.project.name,
        status: "ACTIVE",
        plannedStart: formStart || null,
        plannedEnd: formEind || null,
      });
      return;
    }
    if (venstertje.soort === "taak-nieuw") {
      await verstuur(`/api/projects/${venstertje.project.id}/tasks`, "POST", {
        name: formNaam, startDate: formStart, endDate: formEind,
      });
      return;
    }
    await verstuur(`/api/project-tasks/${venstertje.taak.id}`, "PUT", {
      name: formNaam, startDate: formStart, endDate: formEind,
    });
  }

  async function verwijderTaak(taakId: string) {
    if (!confirm("Weet u zeker dat u deze taak wilt verwijderen?")) return;
    await verstuur(`/api/project-tasks/${taakId}`, "DELETE");
  }

  async function verplaats(taakId: string, move: "up" | "down") {
    await verstuur(`/api/project-tasks/${taakId}`, "PATCH", { move });
  }

  const vandaag = new Date();
  const venster = timelineWindow(projects, vandaag);
  // Via date-fns en niet via milliseconden: bij de overgang naar wintertijd
  // duurt een dag hier 25 uur en telt een deling door 86.400.000 verkeerd.
  const dagen = differenceInCalendarDays(venster.end, venster.start) + 1;
  const breedte = dagen * ZOOM[zoom].pxPerDag;
  const vandaagPct = todayOffsetPct(vandaag, venster);
  const kop = timelineHeader(venster, zoom);

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

            {/* Tijdas: uitgelijnd met dezelfde NAAMKOLOM_PX-insprong en breedte als
                de balken eronder, zodat een datum boven precies bij zijn dag staat. */}
            <div className="border-b">
              <div className="flex items-stretch">
                <div className="sticky left-0 z-[1] shrink-0 bg-card" style={{ width: NAAMKOLOM_PX }} />
                <div className="relative shrink-0 h-6" style={{ width: breedte }}>
                  {kop.boven.map((seg) => (
                    <div
                      key={seg.key}
                      className="absolute top-0 h-6 flex items-center justify-center border-l text-xs font-medium text-muted-foreground"
                      style={{ left: `${seg.leftPct}%`, width: `${seg.widthPct}%` }}
                    >
                      {seg.label}
                    </div>
                  ))}
                </div>
              </div>
              {kop.onder.length > 0 && (
                <div className="flex items-stretch">
                  <div className="sticky left-0 z-[1] shrink-0 bg-card" style={{ width: NAAMKOLOM_PX }} />
                  <div className="relative shrink-0 h-5" style={{ width: breedte }}>
                    {kop.onder.map((seg) => (
                      <div
                        key={seg.key}
                        className="absolute top-0 h-5 flex items-center justify-center border-l text-[10px] text-muted-foreground"
                        style={{ left: `${seg.leftPct}%`, width: `${seg.widthPct}%` }}
                      >
                        {seg.label}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {groepen.map((groep) => (
              <div key={groep.customerName}>
                <div className="sticky left-0 z-[1] px-3 py-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground bg-muted/50">
                  {groep.customerName}
                </div>
                {groep.projects.map((project) => {
                  const bar = projectBar(project)!;
                  const geo = barGeometry(bar.start, bar.end, venster);
                  const uitgeklapt = open[project.id] ?? false;
                  return (
                    <div key={project.id}>
                      <div className="flex items-stretch border-b">
                        {/* Sticky naamkolom: blijft links staan bij horizontaal scrollen.
                            bg-card (ondoorzichtig) zodat balken er straks niet doorheen
                            schijnen als ze onder de kolom door scrollen. */}
                        <div
                          className="sticky left-0 z-[1] flex items-stretch shrink-0 bg-card"
                          style={{ width: NAAMKOLOM_PX }}
                        >
                          <button
                            type="button"
                            className="flex items-center gap-1 shrink-0 px-3 py-2 text-sm text-left hover:bg-muted/50"
                            style={{ width: NAAMKOLOM_PX - 28 }}
                            onClick={() => setOpen((o) => ({ ...o, [project.id]: !uitgeklapt }))}
                          >
                            {project.tasks.length > 0
                              ? (uitgeklapt ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />)
                              : <span className="w-3.5" />}
                            <span className="truncate">{project.name}</span>
                          </button>
                          <Button
                            variant="ghost" size="icon" className="h-7 w-7 shrink-0 self-center"
                            title="Taak toevoegen"
                            onClick={() => openNieuweTaak(project)}
                          >
                            <Plus className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                        <div className="relative shrink-0 py-2" style={{ width: breedte }}>
                          <button
                            type="button"
                            className="absolute h-4 rounded bg-primary hover:bg-primary/80"
                            style={{ left: `${geo.leftPct}%`, width: `${geo.widthPct}%`, minWidth: 4 }}
                            title={`${project.name} — ${formatDate(bar.start)} t/m ${formatDate(bar.end)} — klik om te plannen`}
                            onClick={() => openProject(project)}
                          />
                        </div>
                      </div>

                      {uitgeklapt && project.tasks.map((taak) => {
                        const tGeo = barGeometry(taak.startDate, taak.endDate, venster);
                        return (
                          <div key={taak.id} className="flex items-stretch border-b bg-muted/20">
                            <div
                              className="sticky left-0 z-[1] shrink-0 flex items-center gap-0.5 px-3 pl-8 py-1.5 text-sm bg-card"
                              style={{ width: NAAMKOLOM_PX }}
                            >
                              <button
                                type="button"
                                className="truncate text-muted-foreground hover:text-foreground text-left flex-1"
                                onClick={() => openTaak(project, taak)}
                                title="Taak bewerken"
                              >
                                {taak.name}
                              </button>
                              <Button variant="ghost" size="icon" className="h-5 w-5" title="Omhoog" disabled={bezig} onClick={() => verplaats(taak.id, "up")}>
                                <ChevronUp className="h-3 w-3" />
                              </Button>
                              <Button variant="ghost" size="icon" className="h-5 w-5" title="Omlaag" disabled={bezig} onClick={() => verplaats(taak.id, "down")}>
                                <ChevronDown className="h-3 w-3" />
                              </Button>
                              <Button variant="ghost" size="icon" className="h-5 w-5" title="Verwijderen" disabled={bezig} onClick={() => verwijderTaak(taak.id)}>
                                <Trash2 className="h-3 w-3" />
                              </Button>
                            </div>
                            <div className="relative shrink-0 py-1.5" style={{ width: breedte }}>
                              <div
                                className="absolute h-3 rounded bg-primary/50"
                                style={{ left: `${tGeo.leftPct}%`, width: `${tGeo.widthPct}%`, minWidth: 4 }}
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
              <Button key={p.id} variant="outline" size="sm" onClick={() => openProject(p)}>
                {p.name}
              </Button>
            ))}
          </CardContent>
        </Card>
      )}

      <Dialog open={venstertje !== null} onOpenChange={(o) => { if (!o) setVenstertje(null); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>
              {venstertje?.soort === "project" ? `Planning van ${venstertje.project.name}`
                : venstertje?.soort === "taak-nieuw" ? "Nieuwe taak"
                : "Taak bewerken"}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-3">
            {venstertje?.soort !== "project" && (
              <div className="space-y-1">
                <Label>Naam</Label>
                <Input value={formNaam} onChange={(e) => setFormNaam(e.target.value)} autoFocus />
              </div>
            )}
            <div className="space-y-1">
              <Label>Start</Label>
              <Input type="date" value={formStart} onChange={(e) => setFormStart(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label>Eind</Label>
              <Input type="date" value={formEind} onChange={(e) => setFormEind(e.target.value)} />
            </div>
            {venstertje?.soort === "project" && (
              <p className="text-xs text-muted-foreground">
                Laat allebei leeg om de balk de taken te laten volgen.
              </p>
            )}
            {fout && <p className="text-sm text-destructive">{fout}</p>}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setVenstertje(null)} disabled={bezig}>Annuleren</Button>
            <Button onClick={bewaar} disabled={bezig}>{bezig ? "Opslaan..." : "Opslaan"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
