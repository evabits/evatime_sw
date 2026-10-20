// Photon: OpenStreetMap-zoekdienst van Komoot, gemaakt voor zoeken-tijdens-typen
// (Nominatim verbiedt dat). Gratis, zonder sleutel.
// ponytail: publieke server zonder SLA; eigen Photon of betaalde dienst als dat gaat haperen.
export const OSM_UA = { "User-Agent": "EVAtime/1.0 (time.evabits.work)" };

export type AdresSuggestie = { label: string; coord: string };

/** Adressen die op de invoer lijken, met Nederland voorop. */
export async function zoekAdressen(q: string, limit = 5): Promise<AdresSuggestie[]> {
  const url = `https://photon.komoot.io/api/?${new URLSearchParams({ q, limit: String(limit), lat: "52.2", lon: "5.3" })}`;
  const res = await fetch(url, { headers: OSM_UA });
  if (!res.ok) return [];
  const { features = [] } = await res.json();
  return features.map((f: any) => {
    const p = f.properties ?? {};
    const straat = p.street ? [p.street, p.housenumber].filter(Boolean).join(" ") : p.name;
    const plaats = [p.postcode, p.city ?? (p.name !== straat ? p.name : null)].filter(Boolean).join(" ");
    const land = p.countrycode && p.countrycode !== "NL" ? p.country : null;
    return {
      // Een bedrijf of andere plek heeft een naam naast zijn straat; die voorop.
      label: [p.name !== straat ? p.name : null, straat, plaats, land].filter(Boolean).join(", "),
      coord: f.geometry.coordinates.join(","),
    };
  });
}
