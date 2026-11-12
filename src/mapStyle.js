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

// NASA Blue Marble (shaded relief + sea-floor depth), served as free map tiles by NASA GIBS: no key, NASA
// data is CC0 and GIBS asks for an acknowledgement, which the attribution below gives. It is only 500 m per
// pixel, so it is used for the far-out views, where it shows at a glance where it is green, desert, ice or
// sea; the sharp vector map fades in over it as you zoom in. If NASA's tiles ever fail to load, the map
// still works, it just falls back to the flat land colour.
const TERRAIN_URL =
  "https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/BlueMarble_ShadedRelief_Bathymetry/default/GoogleMapsCompatible_Level8/{z}/{y}/{x}.jpeg";
const TERRAIN_ATTRIBUTION =
  'Terrain: NASA <a href="https://earthdata.nasa.gov/gibs" target="_blank" rel="noopener noreferrer">GIBS</a> / Blue Marble';

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
// land some texture. On top of that come the things you could also make out on a satellite photo: built-up
// areas, roads (more of them the closer you zoom), runways and, zoomed in, building outlines. Still no text
// anywhere: no names of places, streets or countries.
// Road tiers, drawn bottom to top, so bigger roads sit over smaller ones. `width` is zoom, pixels pairs.
const ROAD_TIERS = [
  { id: "service", classes: ["service", "track"], minzoom: 13, color: "#b3b0a4", width: [13, 0.5, 16, 2.5] },
  { id: "minor", classes: ["minor"], minzoom: 11, color: "#c4c1b4", width: [11, 0.4, 14, 1.4, 17, 4] },
  { id: "tertiary", classes: ["tertiary"], minzoom: 9, color: "#d3d0c3", width: [9, 0.5, 14, 2, 17, 6] },
  { id: "secondary", classes: ["secondary"], minzoom: 8, color: "#e3ddc6", width: [8, 0.6, 14, 2.6, 17, 7] },
  { id: "primary", classes: ["primary"], minzoom: 6, color: "#efdca8", width: [6, 0.6, 14, 3.2, 17, 8] },
  { id: "major", classes: ["motorway", "trunk"], minzoom: 4, color: "#f2c46a", width: [4, 0.7, 10, 1.8, 14, 4, 17, 9] },
];

function vectorStyle() {
  const LAND = "#566648";
  return {
    version: 8,
    name: "GeoCulture vector",
    sources: {
      terrain: {
        type: "raster",
        tiles: [TERRAIN_URL],
        tileSize: 256,
        maxzoom: 8,
        attribution: TERRAIN_ATTRIBUTION,
      },
      openmaptiles: {
        type: "vector",
        url: OPENFREEMAP_URL,
        attribution: OPENFREEMAP_ATTRIBUTION,
      },
      ...borderSources(),
    },
    layers: [
      { id: "land", type: "background", paint: { "background-color": LAND } },
      // Far out: real terrain colours. It stays fully visible until the vector layers below have taken over.
      {
        id: "terrain",
        type: "raster",
        source: "terrain",
        paint: { "raster-resampling": "linear", "raster-fade-duration": 150, "raster-saturation": 0.1 },
      },
      {
        id: "landcover",
        type: "fill",
        source: "openmaptiles",
        "source-layer": "landcover",
        paint: {
          // Fades in between zoom 6 and 9, so it sharpens the terrain instead of flattening it.
          "fill-opacity": ["interpolate", ["linear"], ["zoom"], 6, 0, 9, 1],
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
        paint: {
          "fill-color": "#17496f",
          "fill-antialias": true,
          // Far out the sea comes from the terrain image (with its depth shading); the crisp coastline
          // takes over as you zoom in.
          "fill-opacity": ["interpolate", ["linear"], ["zoom"], 6, 0, 8, 1],
        },
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

      // Built-up areas: a soft grey patch where a town or city is, like the glow of a city on a photo.
      {
        id: "urban",
        type: "fill",
        source: "openmaptiles",
        "source-layer": "landuse",
        filter: ["in", ["get", "class"], ["literal", ["residential", "suburb", "neighbourhood", "commercial", "retail", "industrial"]]],
        paint: {
          "fill-color": "#8c8a80",
          "fill-opacity": ["interpolate", ["linear"], ["zoom"], 4, 0.55, 12, 0.75],
          "fill-antialias": false,
        },
      },

      // Building outlines, only once you are close enough to see them.
      {
        id: "buildings",
        type: "fill",
        source: "openmaptiles",
        "source-layer": "building",
        minzoom: 13,
        paint: {
          "fill-color": "#a9a597",
          "fill-opacity": ["interpolate", ["linear"], ["zoom"], 13, 0, 15, 0.9],
        },
      },

      // Airports: runways show up as long straight strips.
      {
        id: "runways",
        type: "line",
        source: "openmaptiles",
        "source-layer": "aeroway",
        minzoom: 9,
        filter: ["==", ["get", "class"], "runway"],
        paint: {
          "line-color": "#cfcabb",
          "line-width": ["interpolate", ["linear"], ["zoom"], 9, 1, 14, 8],
        },
      },

      // Roads, from motorways (visible from far away) down to side streets (only up close).
      // Tunnels are left out. Each tier is its own layer so it can start at its own zoom.
      ...ROAD_TIERS.map((tier) => ({
        id: `road-${tier.id}`,
        type: "line",
        source: "openmaptiles",
        "source-layer": "transportation",
        minzoom: tier.minzoom,
        filter: ["all", ["in", ["get", "class"], ["literal", tier.classes]], ["!=", ["get", "brunnel"], "tunnel"]],
        layout: { "line-cap": "round", "line-join": "round" },
        paint: {
          "line-color": tier.color,
          "line-width": ["interpolate", ["linear"], ["zoom"], ...tier.width],
        },
      })),

      ...borderLayers(),
    ],
  };
}

export function buildStyle(kind = DEFAULT_MAP_KIND) {
  return kind === "vector" ? vectorStyle() : satelliteStyle();
}
