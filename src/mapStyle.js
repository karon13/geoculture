import { LIBERTY_STYLE_URL, stripText, deepSea } from "./libertyStyle.js";

// The globe's look: OpenFreeMap's Liberty style with the text removed and the colours tuned for the dark
// page (see libertyStyle.js). Liberty keeps its own border lines. Nothing is labelled: no names of places,
// streets or countries, so the player has to know where things are.

// Shown while the Liberty style is still being downloaded.
export function buildStyle() {
  return { version: 8, name: "GeoCulture loading", sources: {}, layers: [{ id: "space", type: "background", paint: { "background-color": "#050914" } }] };
}

// The finished style. It has to be downloaded, so this is async and can fail (offline, OpenFreeMap down).
export async function loadStyle() {
  const response = await fetch(LIBERTY_STYLE_URL);
  if (!response.ok) throw new Error(`Liberty style: HTTP ${response.status}`);
  const style = deepSea(stripText(await response.json()));
  return { ...style, name: "GeoCulture Liberty" };
}

// ---------- US state borders ----------
// Liberty's own state lines only show up late and faintly, so the US state borders are drawn here from a small
// line file (public/borders-us-states.json, US Census, no names). They fade in as soon as the US is big enough
// on the globe to tell its states apart and stay a little lighter than the country borders. Liberty's own state
// lines, which show up later, sit under them.
export const STATE_BORDERS_URL = "borders-us-states.json";

export const STATE_BORDER_LAYER = {
  id: "us-state-borders",
  type: "line",
  source: "us-state-borders",
  layout: { "line-cap": "round", "line-join": "round" },
  paint: {
    "line-color": "hsl(248, 10%, 74%)",
    // Invisible when the whole world is in view, fully there by zoom 3.4.
    "line-opacity": ["interpolate", ["linear"], ["zoom"], 2.4, 0, 3.4, 0.8],
    // Thin from afar, a little thicker close up (country borders are the heavier line).
    "line-width": ["interpolate", ["linear"], ["zoom"], 3, 0.6, 6, 1.1, 10, 1.8, 14, 2.4],
  },
};

// Adds the state borders to a map whose style has just loaded. The file is fetched by MapLibre; if it cannot be
// loaded the game simply has no extra state lines (the map and the rest of the game do not depend on it).
export function addUsStateBorders(map, beforeLayerId) {
  const url = new URL(STATE_BORDERS_URL, globalThis.document?.baseURI || "http://localhost/").href;
  if (!map.getSource(STATE_BORDER_LAYER.source)) map.addSource(STATE_BORDER_LAYER.source, { type: "geojson", data: url });
  if (!map.getLayer(STATE_BORDER_LAYER.id)) map.addLayer(STATE_BORDER_LAYER, beforeLayerId);
}
