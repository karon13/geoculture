import { LIBERTY_STYLE_URL, THEMES, stripText, recolor } from "./libertyStyle.js";

// The globe's look. Three base maps can be switched between for testing (hamburger menu, or ?map=night):
//   satellite: Esri World Imagery photos
//   night:     OpenFreeMap's Liberty style, text removed, in dark colours (theme A, see libertyStyle.js)
//   natural:   the same Liberty style in calmer natural colours with a deep teal sea (theme D)
// Whichever is used, the game's own country and US state borders are drawn on top, and nothing is
// labelled: no names of places, streets or countries, so the player has to know where things are.

// Satellite tiles. Esri World Imagery is keyless and sharp down to street level in most places.
// Check Esri's terms before a commercial launch; any XYZ raster source can be swapped in here or at
// build time with VITE_IMAGERY_URL (for example a MapTiler or Mapbox satellite URL with your key).
const IMAGERY_URL =
  import.meta.env.VITE_IMAGERY_URL ||
  "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}";
const IMAGERY_ATTRIBUTION =
  import.meta.env.VITE_IMAGERY_ATTRIBUTION ||
  "Imagery © Esri, Maxar, Earthstar Geographics and the GIS User Community";

export const MAP_KINDS = ["satellite", ...Object.keys(THEMES)];
export const MAP_LABELS = { satellite: "satellite (Esri)", ...Object.fromEntries(Object.entries(THEMES).map(([k, t]) => [k, t.label])) };
export const DEFAULT_MAP_KIND = "satellite";

// Border files live in public/ and are resolved against the page so the site works from any sub-path.
const asset = (name) => new URL(name, document.baseURI).href;

function borderSources() {
  return {
    countries: {
      type: "geojson",
      data: asset("borders-countries.json"),
      attribution: "Borders: Natural Earth",
    },
    states: {
      type: "geojson",
      data: asset("borders-us-states.json"),
      attribution: "US states: US Census Bureau",
    },
  };
}

// Drawn on top of whichever base map is showing.
const borderLayers = () => [
  // US state borders: thinner and fainter than country borders, shown once you are zoomed in a bit.
  {
    id: "state-casing",
    type: "line",
    source: "states",
    minzoom: 3,
    layout: { "line-cap": "round", "line-join": "round" },
    paint: {
      "line-color": "rgba(0,0,0,0.35)",
      "line-width": ["interpolate", ["linear"], ["zoom"], 3, 1.6, 8, 3, 14, 5],
      "line-blur": 0.6,
    },
  },
  {
    id: "state-line",
    type: "line",
    source: "states",
    minzoom: 3,
    layout: { "line-cap": "round", "line-join": "round" },
    paint: {
      "line-color": "rgba(255,255,255,0.75)",
      "line-width": ["interpolate", ["linear"], ["zoom"], 3, 0.6, 8, 1.2, 14, 2],
      "line-dasharray": [3, 2],
    },
  },

  // Country borders: a dark edge under a bright line so they read on desert, ice and forest alike.
  {
    id: "country-casing",
    type: "line",
    source: "countries",
    layout: { "line-cap": "round", "line-join": "round" },
    paint: {
      "line-color": "rgba(0,0,0,0.45)",
      "line-width": ["interpolate", ["linear"], ["zoom"], 0, 1.6, 6, 3.6, 12, 6, 16, 9],
      "line-blur": 0.8,
    },
  },
  {
    id: "country-line",
    type: "line",
    source: "countries",
    layout: { "line-cap": "round", "line-join": "round" },
    paint: {
      "line-color": "#ffffff",
      "line-width": ["interpolate", ["linear"], ["zoom"], 0, 0.7, 6, 1.5, 12, 2.4, 16, 3.5],
    },
  },
];

function satelliteStyle() {
  return {
    version: 8,
    name: "GeoCulture satellite",
    sources: {
      imagery: {
        type: "raster",
        tiles: [IMAGERY_URL],
        tileSize: 256,
        maxzoom: 18,
        attribution: IMAGERY_ATTRIBUTION,
      },
      ...borderSources(),
    },
    layers: [
      { id: "space", type: "background", paint: { "background-color": "#050914" } },
      {
        id: "imagery",
        type: "raster",
        source: "imagery",
        paint: { "raster-fade-duration": 150, "raster-resampling": "linear" },
      },
      ...borderLayers(),
    ],
  };
}

// Shown while the Liberty style is still being downloaded.
function placeholderStyle() {
  return { version: 8, name: "GeoCulture loading", sources: {}, layers: [{ id: "space", type: "background", paint: { "background-color": "#050914" } }] };
}

// A Liberty-based map has to be downloaded first, so it is async and can fail (offline, OpenFreeMap down).
async function libertyStyle(theme) {
  const response = await fetch(LIBERTY_STYLE_URL);
  if (!response.ok) throw new Error(`Liberty style: HTTP ${response.status}`);
  const style = recolor(stripText(await response.json()), theme);
  return {
    ...style,
    name: `GeoCulture ${theme}`,
    sources: { ...style.sources, ...borderSources() },
    layers: [...style.layers, ...borderLayers()],
  };
}

// The style to show before anything has loaded: instant for satellite, a plain dark globe for the others.
export function buildStyle(kind = DEFAULT_MAP_KIND) {
  return kind === "satellite" ? satelliteStyle() : placeholderStyle();
}

// The finished style for a map kind.
export async function loadStyle(kind = DEFAULT_MAP_KIND) {
  return kind === "satellite" ? satelliteStyle() : libertyStyle(kind);
}
