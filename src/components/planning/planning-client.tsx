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
import { cycleThrough, shiftPlan, arrowPath, planningWarnings, type TaakSignaal } from "@/lib/task-dependencies";

/**
 * De taken waar deze taak op zou kunnen wachten: die van hetzelfde project,
 * zichzelf niet meegerekend. Een aparte functie omdat TypeScript de soort van
 * het venster anders niet meeneemt in de filter.
 */
function andereTaken(
  venstertje: { soort: "taak-nieuw"; project: PlanningProject } | { soort: "taak-bewerk"; project: PlanningProject; taak: PlanningProject["tasks"][number] },
) {
  return venstertje.soort === "taak-bewerk"
    ? venstertje.project.tasks.filter((t) => t.id !== venstertje.taak.id)
    : venstertje.project.tasks;
}

/** Alle koppelingen van een project, in de vorm die task-dependencies verwacht. */
function alleKoppelingen(project: PlanningProject) {
  return project.tasks.flatMap((t) =>
    (t.waitsOn ?? []).map((w) => ({ taskId: t.id, dependsOnId: w.dependsOnId })),
  );
}

/**
 * Kleur van de taakbalk aan de hand van de zwaarste markering. `te-vroeg` en
 * `buiten-project` zijn een alarm; `verlopen` alleen is een gedempte hint —
 * zonder een "gereed"-vlag is een afgelopen taak meestal gewoon afgerond werk,
 * en die mag niet even hard opvallen als een echte schending.
 */
function taakKleur(signalen: TaakSignaal[] | undefined): string {
  if (!signalen) return "bg-primary/50";
  if (signalen.some((s) => s.soort !== "verlopen")) return "bg-destructive";
  return "bg-muted-foreground/40";
}

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

/**
 * Vaste hoogte van een taakrij, inclusief de onderrand. Vast en niet door de
 * inhoud bepaald, want de pijlen rekenen ermee: rij × deze hoogte is het
 * middelpunt van de balk.
 */
const TAAKRIJ_PX = 25;

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
  const [formWachtOp, setFormWachtOp] = useState<string[]>([]);
  // Het voorgerekende overzicht, of null als er niets te verschuiven valt. De
  // projectperiode staat er zelf bij: op het moment dat bewaar() dit vastlegt
  // heeft hij het project nog in handen, en dat is betrouwbaarder dan hem later
  // terugzoeken in `projects` — die prop is nog niet ververst, en bij een net
  // aangemaakte taak staat diens id daar sowieso nog niet in.
  const [verschuiving, setVerschuiving] = useState<
    { taakId: string; regels: ReturnType<typeof shiftPlan>; periode: { start: Date; eind: Date } | null } | null
  >(null);

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
    setFormWachtOp([]);
    setVenstertje({ soort: "taak-nieuw", project });
  }

  function openTaak(project: PlanningProject, taak: PlanningProject["tasks"][number]) {
    setFout("");
    setFormNaam(taak.name);
    setFormStart(isoVoorInvoer(taak.startDate));
    setFormEind(isoVoorInvoer(taak.endDate));
    setFormWachtOp(taak.waitsOn?.map((w) => w.dependsOnId) ?? []);
    setVenstertje({ soort: "taak-bewerk", project, taak });
  }

  /**
   * Eén plek voor elke schrijfactie: verstuurt, meldt de fout, en ververst bij
   * succes. Geeft bij succes de json-respons terug (elke route antwoordt met
   * json) zodat een aanroeper — zoals het aanmaken van een taak — bij het
   * aangemaakte record kan; bij een fout is het `false`.
   */
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
    return await res.json().catch(() => true);
  }

  /**
   * Rekent voor of het net opgeslagene iets verderop in de keten laat
   * verschuiven, en toont het overzicht alleen als dat daadwerkelijk zo is.
   * Gedeeld door aanmaken én bewerken, want de rekenkunde erachter — shiftPlan
   * over de eigen net-verstuurde gegevens heen, niet over wat er nog op het
   * scherm staat — is voor allebei hetzelfde.
   */
  function toonVerschuivingAlsNodig(
    taakId: string,
    taken: Parameters<typeof shiftPlan>[0],
    koppelingen: Parameters<typeof shiftPlan>[1],
    periode: { start: Date; eind: Date } | null,
  ) {
    const regels = shiftPlan(taken, koppelingen);
    if (regels.length > 0) setVerschuiving({ taakId, regels, periode });
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
    const project = venstertje.project;
    // Nu vastleggen, terwijl we het project nog rechtstreeks in handen hebben —
    // niet pas bij het tonen van het overzicht ergens anders naar terugzoeken.
    const periode =
      project.plannedStart && project.plannedEnd
        ? { start: new Date(project.plannedStart), eind: new Date(project.plannedEnd) }
        : null;
    if (venstertje.soort === "taak-nieuw") {
      const nieuw = await verstuur(`/api/projects/${project.id}/tasks`, "POST", {
        name: formNaam, startDate: formStart, endDate: formEind, dependsOnIds: formWachtOp,
      });
      if (!nieuw) return;

      // Dezelfde redenering als bij bewerken: de POST is al geslaagd, dus we
      // rekenen door met de taken zoals ze op het scherm stonden, aangevuld met
      // de nieuwe taak — met het echte id uit de respons, niet ervoor gegokt.
      const taken = [
        ...project.tasks,
        { id: nieuw.id, name: formNaam, startDate: formStart, endDate: formEind },
      ];
      const koppelingen = alleKoppelingen(project)
        .concat(formWachtOp.map((dependsOnId) => ({ taskId: nieuw.id, dependsOnId })));
      toonVerschuivingAlsNodig(nieuw.id, taken, koppelingen, periode);
      return;
    }
    const taak = venstertje.taak;
    const opgeslagen = await verstuur(`/api/project-tasks/${taak.id}`, "PUT", {
      name: formNaam, startDate: formStart, endDate: formEind, dependsOnIds: formWachtOp,
    });
    if (!opgeslagen) return;

    // router.refresh() (in verstuur) haalt de verse gegevens pas later op; het
    // scherm heeft ze nu nog niet. Reken het voorbeeld daarom door met wat we
    // zelf net verstuurd hebben: deze taak met haar nieuwe datums, en haar
    // koppelingen vervangen door wat er in de aanvinklijst stond.
    const taken = project.tasks.map((t) =>
      t.id === taak.id ? { ...t, startDate: formStart, endDate: formEind } : t,
    );
    const koppelingen = alleKoppelingen(project)
      .filter((k) => k.taskId !== taak.id)
      .concat(formWachtOp.map((dependsOnId) => ({ taskId: taak.id, dependsOnId })));
    toonVerschuivingAlsNodig(taak.id, taken, koppelingen, periode);
  }

  /** "Alleen deze taak": het overzicht dicht, de keten blijft staan zoals hij stond. */
  function alleenDezeTaak() {
    setVerschuiving(null);
    router.refresh();
  }

  /** "Alles verschuiven": dezelfde PUT nogmaals, nu met applyShift zodat de server de keten doorrekent. */
  async function verschuifAlles() {
    if (!verschuiving) return;
    const ok = await verstuur(`/api/project-tasks/${verschuiving.taakId}`, "PUT", {
      name: formNaam, startDate: formStart, endDate: formEind, dependsOnIds: formWachtOp, applyShift: true,
    });
    if (ok) setVerschuiving(null);
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
  // Ook per klant, en met dezelfde sortering als de tijdlijn erboven. De lijst
  // kwam anders in de volgorde waarin de database hem toevallig teruggaf.
  const ongepland = groupByCustomer(unplannedProjects(projects));

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
                  // Ook als het project is ingeklapt uitrekenen: de projectbalk zelf
                  // moet altijd kunnen oplichten, niet pas na uitklappen.
                  const { perTaak: signalen, projectLooptUit, projectUitleg } = planningWarnings(
                    project, project.tasks, alleKoppelingen(project), vandaag,
                  );
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
                            className={`absolute h-4 rounded ${projectLooptUit ? "bg-destructive hover:bg-destructive/80" : "bg-primary hover:bg-primary/80"}`}
                            style={{ left: `${geo.leftPct}%`, width: `${geo.widthPct}%`, minWidth: 4 }}
                            title={[
                              `${project.name} — ${formatDate(bar.start)} t/m ${formatDate(bar.end)} — klik om te plannen`,
                              ...(projectUitleg ? [projectUitleg] : []),
                            ].join("\n")}
                            onClick={() => openProject(project)}
                          />
                        </div>
                      </div>

                      {uitgeklapt && (
                        // relative: draagt de pijlenlaag, die anders geen aanknopingspunt
                        // heeft om zich op de taakrijen te leggen.
                        <div className="relative">
                          <svg
                            className="absolute top-0 z-0 pointer-events-none text-muted-foreground"
                            style={{
                              left: NAAMKOLOM_PX,
                              width: breedte,
                              height: project.tasks.length * TAAKRIJ_PX,
                            }}
                          >
                            {alleKoppelingen(project).map((koppeling) => {
                              const vanIdx = project.tasks.findIndex((t) => t.id === koppeling.dependsOnId);
                              const naarIdx = project.tasks.findIndex((t) => t.id === koppeling.taskId);
                              // Beide kanten horen bij dit project; is dat toch niet zo,
                              // dan is er niets te tekenen in plaats van een gok te wagen.
                              if (vanIdx === -1 || naarIdx === -1) return null;
                              const van = project.tasks[vanIdx];
                              const naar = project.tasks[naarIdx];
                              const punten = arrowPath(
                                { ...barGeometry(van.startDate, van.endDate, venster), rij: vanIdx },
                                { ...barGeometry(naar.startDate, naar.endDate, venster), rij: naarIdx },
                                { breedte, rijHoogte: TAAKRIJ_PX },
                              );
                              const laatste = punten[punten.length - 1];
                              // Geschonden: de opvolger begint op of vóór de einddatum van
                              // de voorganger — die is dan nog niet klaar.
                              const geschonden = new Date(naar.startDate) <= new Date(van.endDate);
                              return (
                                <g key={`${koppeling.dependsOnId}-${koppeling.taskId}`} className={geschonden ? "text-destructive" : undefined}>
                                  <polyline
                                    points={punten.map((p) => `${p.x},${p.y}`).join(" ")}
                                    fill="none"
                                    stroke="currentColor"
                                    strokeWidth={1.5}
                                  />
                                  <polygon
                                    points={`${laatste.x},${laatste.y} ${laatste.x - 5},${laatste.y - 3} ${laatste.x - 5},${laatste.y + 3}`}
                                    fill="currentColor"
                                  />
                                </g>
                              );
                            })}
                          </svg>

                          {project.tasks.map((taak) => {
                            const tGeo = barGeometry(taak.startDate, taak.endDate, venster);
                            return (
                              <div
                                key={taak.id}
                                className="flex items-stretch border-b bg-muted/20"
                                style={{ height: TAAKRIJ_PX }}
                              >
                                <div
                                  className="sticky left-0 z-[1] shrink-0 flex items-center gap-0.5 px-3 pl-8 text-sm bg-card"
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
                                    className={`absolute h-3 rounded ${taakKleur(signalen[taak.id])}`}
                                    style={{ left: `${tGeo.leftPct}%`, width: `${tGeo.widthPct}%`, minWidth: 4 }}
                                    title={[
                                      `${taak.name} — ${formatDate(taak.startDate)} t/m ${formatDate(taak.endDate)}`,
                                      ...(signalen[taak.id] ?? []).map((s) => s.uitleg),
                                    ].join("\n")}
                                  />
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
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
          <CardContent className="space-y-3">
            {ongepland.map((groep) => (
              <div key={groep.customerName}>
                <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  {groep.customerName}
                </p>
                <div className="flex flex-wrap gap-2">
                  {groep.projects.map((p) => (
                    <Button key={p.id} variant="outline" size="sm" onClick={() => openProject(p)}>
                      {p.name}
                    </Button>
                  ))}
                </div>
              </div>
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
            {venstertje && venstertje.soort !== "project" && andereTaken(venstertje).length > 0 && (
              <div className="space-y-1">
                <Label>Wacht op</Label>
                <div className="max-h-40 space-y-1 overflow-y-auto rounded border p-2">
                  {andereTaken(venstertje).map((t) => {
                      // Een keuze die een kringloop zou sluiten laten we zien maar
                      // niet aanklikken, met de reden erbij — anders zoek je je
                      // wezenloos naar waarom iets niet kan.
                      const keten =
                        venstertje.soort === "taak-bewerk"
                          ? cycleThrough(alleKoppelingen(venstertje.project), venstertje.taak.id, t.id)
                          : null;
                      const naam = (id: string) =>
                        venstertje.project.tasks.find((x) => x.id === id)?.name ?? "?";
                      return (
                        <label
                          key={t.id}
                          className={`flex items-center gap-2 text-sm ${keten ? "text-muted-foreground" : ""}`}
                          title={keten ? `Zou een kringloop sluiten: ${keten.map(naam).join(" → ")}` : undefined}
                        >
                          <input
                            type="checkbox"
                            className="h-4 w-4 rounded border-input accent-primary"
                            disabled={Boolean(keten)}
                            checked={formWachtOp.includes(t.id)}
                            onChange={(e) =>
                              setFormWachtOp((huidig) =>
                                e.target.checked ? [...huidig, t.id] : huidig.filter((x) => x !== t.id),
                              )
                            }
                          />
                          <span className="truncate">{t.name}</span>
                          {keten && <span className="text-xs">(kringloop)</span>}
                        </label>
                      );
                    })}
                </div>
              </div>
            )}
            {fout && <p className="text-sm text-destructive">{fout}</p>}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setVenstertje(null)} disabled={bezig}>Annuleren</Button>
            <Button onClick={bewaar} disabled={bezig}>{bezig ? "Opslaan..." : "Opslaan"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={verschuiving !== null} onOpenChange={(o) => { if (!o) alleenDezeTaak(); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Taken die meeschuiven</DialogTitle>
          </DialogHeader>

          <div className="space-y-2">
            {verschuiving?.regels.map((regel) => {
              // Alleen relevant met een eigen projectperiode; zonder die spant
              // de balk zich toch om de taken, dus dan kan niets uitsteken.
              // De periode is al vastgelegd toen bewaar() het project nog in
              // handen had (zie hierboven), niet hier achteraf teruggezocht.
              const periode = verschuiving.periode;
              const buitenPeriode =
                periode !== null && (regel.naarStart < periode.start || regel.naarEind > periode.eind);
              return (
                <div key={regel.id} className="text-sm">
                  <p className="truncate">{regel.name}</p>
                  <p className="text-muted-foreground">
                    {formatDate(regel.vanStart)} t/m {formatDate(regel.vanEind)}
                    {" → "}
                    {formatDate(regel.naarStart)} t/m {formatDate(regel.naarEind)}
                  </p>
                  {buitenPeriode && (
                    <p className="text-destructive">Valt buiten de projectperiode</p>
                  )}
                </div>
              );
            })}
            {fout && <p className="text-sm text-destructive">{fout}</p>}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={alleenDezeTaak} disabled={bezig}>Alleen deze taak</Button>
            <Button onClick={verschuifAlles} disabled={bezig}>Alles verschuiven</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
