// The globe's look. Two base maps can be switched between for testing (hamburger menu, or ?map=vector):
//   satellite: Esri World Imagery photos
//   vector:    a plain land/water map drawn from OpenFreeMap's vector tiles
// Either way the same country and US state borders are drawn on top, and there are no labels, roads or
// places, so the player has to know where things are.

// Satellite tiles. Esri World Imagery is keyless and sharp down to street level in most places.
// Check Esri's terms before a commercial launch; any XYZ raster source can be swapped in here or at
// build time with VITE_IMAGERY_URL (for example a MapTiler or Mapbox satellite URL with your key).
const IMAGERY_URL =
  import.meta.env.VITE_IMAGERY_URL ||
  "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}";
const IMAGERY_ATTRIBUTION =
  import.meta.env.VITE_IMAGERY_ATTRIBUTION ||
  "Imagery © Esri, Maxar, Earthstar Geographics and the GIS User Community";

// OpenFreeMap: free vector tiles (OpenStreetMap data in the OpenMapTiles layout), no key. We only draw
// the water and land-cover layers from them. There are deliberately no text or symbol layers, so no names.
const OPENFREEMAP_URL = "https://tiles.openfreemap.org/planet";
const OPENFREEMAP_ATTRIBUTION =
  '<a href="https://openfreemap.org" target="_blank" rel="noopener noreferrer">OpenFreeMap</a> © <a href="https://openmaptiles.org/" target="_blank" rel="noopener noreferrer">OpenMapTiles</a> Data from <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap</a>';

export const MAP_KINDS = ["satellite", "vector"];
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

// Land is the background colour, water is drawn over it, and land cover (forest, grass, ice ...) gives the
// land some texture. Rivers appear once zoomed in. Nothing else: no roads, buildings or names.
function vectorStyle() {
  const LAND = "#566648";
  return {
    version: 8,
    name: "GeoCulture vector",
    sources: {
      openmaptiles: {
        type: "vector",
        url: OPENFREEMAP_URL,
        attribution: OPENFREEMAP_ATTRIBUTION,
      },
      ...borderSources(),
    },
    layers: [
      { id: "land", type: "background", paint: { "background-color": LAND } },
      {
        id: "landcover",
        type: "fill",
        source: "openmaptiles",
        "source-layer": "landcover",
        paint: {
          "fill-color": [
            "match",
            ["get", "class"],
            "wood", "#3f5c3a",
            "grass", "#6b7f52",
            "farmland", "#7d8657",
            "wetland", "#4d6f5f",
            "sand", "#b3a577",
            "rock", "#7d786f",
            "ice", "#eef3f6",
            LAND,
          ],
          "fill-antialias": false,
        },
      },
      {
        id: "water",
        type: "fill",
        source: "openmaptiles",
        "source-layer": "water",
        paint: { "fill-color": "#17496f", "fill-antialias": true },
      },
      {
        id: "rivers",
        type: "line",
        source: "openmaptiles",
        "source-layer": "waterway",
        minzoom: 6,
        filter: ["==", ["get", "class"], "river"],
        layout: { "line-cap": "round", "line-join": "round" },
        paint: {
          "line-color": "#17496f",
          "line-width": ["interpolate", ["linear"], ["zoom"], 6, 0.5, 10, 1.6, 14, 3.5],
        },
      },
      ...borderLayers(),
    ],
  };
}

export function buildStyle(kind = DEFAULT_MAP_KIND) {
  return kind === "vector" ? vectorStyle() : satelliteStyle();
}
