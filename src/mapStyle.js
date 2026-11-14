import { LIBERTY_STYLE_URL, stripText, deepSea, emphasizeStateBorders } from "./libertyStyle.js";

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
  const style = emphasizeStateBorders(deepSea(stripText(await response.json())));
  return { ...style, name: "GeoCulture Liberty" };
}
