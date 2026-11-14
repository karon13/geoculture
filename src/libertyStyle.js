// OpenFreeMap's "Liberty" style, minus anything that says where you are.
//
// Liberty is OpenFreeMap's full-colour map style and it draws terrain nicely even when zoomed out, so we
// fetch the real style from OpenFreeMap when the map starts and remove every text and icon layer (place,
// street and country names, shields, points of interest, house numbers; all of them are layers of type
// "symbol"). Everything else, including Liberty's own country and state border lines, colours, shapes and
// zoom behaviour, stays exactly as OpenFreeMap designed it.
export const LIBERTY_STYLE_URL = "https://tiles.openfreemap.org/styles/liberty";

export function stripText(style) {
  return {
    ...style,
    layers: style.layers.filter((layer) => layer.type !== "symbol"),
  };
}

// ---------- colours ----------

// Reads a CSS colour string (#rgb, #rrggbb, #rrggbbaa, rgb(), rgba(), hsl(), hsla()) into { h, s, l, a }
// with h in degrees and s, l, a between 0 and 1. Returns null for anything that is not a colour.
export function parseColor(text) {
  const t = text.trim().toLowerCase();
  let r, g, b, a = 1;
  let m = t.match(/^#([0-9a-f]{3,8})$/);
  if (m) {
    let hex = m[1];
    if (hex.length === 3 || hex.length === 4) hex = [...hex].map((c) => c + c).join("");
    if (hex.length !== 6 && hex.length !== 8) return null;
    r = parseInt(hex.slice(0, 2), 16) / 255;
    g = parseInt(hex.slice(2, 4), 16) / 255;
    b = parseInt(hex.slice(4, 6), 16) / 255;
    if (hex.length === 8) a = parseInt(hex.slice(6, 8), 16) / 255;
  } else if ((m = t.match(/^rgba?\(\s*([\d.]+%?)[\s,]+([\d.]+%?)[\s,]+([\d.]+%?)(?:[\s,/]+([\d.]+%?))?\s*\)$/))) {
    const ch = (v) => (v.endsWith("%") ? parseFloat(v) / 100 : parseFloat(v) / 255);
    [r, g, b] = [ch(m[1]), ch(m[2]), ch(m[3])];
    if (m[4] !== undefined) a = m[4].endsWith("%") ? parseFloat(m[4]) / 100 : parseFloat(m[4]);
  } else if ((m = t.match(/^hsla?\(\s*([\d.]+)(?:deg)?[\s,]+([\d.]+)%[\s,]+([\d.]+)%(?:[\s,/]+([\d.]+%?))?\s*\)$/))) {
    const out = { h: ((parseFloat(m[1]) % 360) + 360) % 360, s: parseFloat(m[2]) / 100, l: parseFloat(m[3]) / 100, a: 1 };
    if (m[4] !== undefined) out.a = m[4].endsWith("%") ? parseFloat(m[4]) / 100 : parseFloat(m[4]);
    return out;
  } else {
    return null;
  }
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  const d = max - min;
  let h = 0;
  let s = 0;
  if (d > 0) {
    s = d / (1 - Math.abs(2 * l - 1));
    if (max === r) h = ((g - b) / d) % 6;
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h = (h * 60 + 360) % 360;
  }
  return { h, s, l, a };
}

const clamp01 = (n) => Math.min(1, Math.max(0, n));

export function formatColor({ h, s, l, a }) {
  return `hsla(${h.toFixed(1)}, ${(clamp01(s) * 100).toFixed(1)}%, ${(clamp01(l) * 100).toFixed(1)}%, ${clamp01(a).toFixed(3)})`;
}

// Applies `change` to every colour inside a paint value. A value can be a plain colour string, a zoom-stops
// object, or an expression (nested arrays such as ["interpolate", ["linear"], ["zoom"], 5, "#fff", 9, "#000"]
// or ["match", ["get", "class"], "wood", "#3f5c3a", "#566648"]). Only strings that really are colours are
// touched, so class names like "wood" or "grass" in a match are left alone.
export function mapColors(value, change) {
  if (typeof value === "string") {
    const color = parseColor(value);
    return color ? formatColor(change(color)) : value;
  }
  if (Array.isArray(value)) return value.map((item) => mapColors(item, change));
  if (value && typeof value === "object" && Array.isArray(value.stops)) {
    return { ...value, stops: value.stops.map(([stop, v]) => [stop, mapColors(v, change)]) };
  }
  return value;
}

// ---------- the game's colours ----------

// Liberty is a light, bright map. Against the game's dark page we want deeper, more earth-like colours:
//   - the sea and rivers become a deeper blue (SEA);
//   - land fills (forest, grass, farmland, sand, parks and the base colour) get darker with a bit more
//     contrast between light and dark areas, and greens drift toward olive, so it reads like earth;
//   - the low-zoom image layer, if Liberty has one, is darkened to match.
// Roads, buildings and everything else stay as Liberty has them. Change the numbers below to taste.
export const SEA = "#2c6aa3";
const LAND_LAYERS = new Set(["landcover", "landuse", "park", "landuse_overlay"]);
// The low-zoom image layer (Liberty draws a picture of the world there, not vector shapes).
const RASTER = { "raster-brightness-max": 0.82, "raster-contrast": 0.1, "raster-saturation": 0.05 };
const LAND = { darken: 0.78, contrast: 1.5, pivot: 0.55, greenHue: 92, greenPull: 0.5, greenSat: 0.85 };

// Re-tones one land colour. Near-white (snow, ice) is left as it is so poles and glaciers stay bright.
export function earthTone({ h, s, l, a }) {
  if (l > 0.93) return { h, s, l, a };
  let hue = h;
  let sat = s;
  if (h >= 60 && h <= 170) {
    hue = h + (LAND.greenHue - h) * LAND.greenPull;
    sat = s * LAND.greenSat;
  }
  const light = LAND.pivot + (l * LAND.darken - LAND.pivot) * LAND.contrast;
  return { h: hue, s: sat, l: Math.min(0.92, Math.max(0.08, light)), a };
}

export function deepSea(style) {
  return {
    ...style,
    layers: style.layers.map((layer) => {
      const sourceLayer = layer["source-layer"];
      if (layer.type === "fill" && sourceLayer === "water") {
        const paint = { ...layer.paint, "fill-color": SEA };
        delete paint["fill-outline-color"];
        delete paint["fill-pattern"];
        return { ...layer, paint };
      }
      if (layer.type === "line" && sourceLayer === "waterway") {
        return { ...layer, paint: { ...layer.paint, "line-color": SEA } };
      }
      if (layer.type === "background") {
        return { ...layer, paint: { ...layer.paint, "background-color": mapColors(layer.paint?.["background-color"], earthTone) } };
      }
      if (layer.type === "fill" && LAND_LAYERS.has(sourceLayer)) {
        const paint = { ...layer.paint };
        for (const key of ["fill-color", "fill-outline-color"]) if (key in paint) paint[key] = mapColors(paint[key], earthTone);
        return { ...layer, paint };
      }
      if (layer.type === "raster") {
        return { ...layer, paint: { ...layer.paint, ...RASTER } };
      }
      return layer;
    }),
  };
}

// ---------- state borders ----------
// Liberty draws state / province lines (admin level 3 or 4) faintly and only when zoomed in. We keep Liberty's own
// lines, so they follow the same geometry as the country borders, but restyle them: dotted, thinner than
// the country border, and switched on at a much lower zoom. The tiles decide how far out the lines exist at all.
export const STATE_BORDER = {
  minzoom: 2.4, // earliest zoom the layer is drawn
  opacity: ["interpolate", ["linear"], ["zoom"], 2.4, 0, 3.4, 0.85],
  width: ["interpolate", ["linear"], ["zoom"], 3, 0.5, 6, 0.9, 10, 1.4, 14, 2],
  // Dots: a near-zero dash with round caps draws a round dot, the gap is in line widths.
  dasharray: [0.1, 2.2],
  fallbackColor: "hsl(248, 10%, 74%)",
};

// The admin levels a layer filter lets through, for example ["in", "admin_level", 3, 4] gives {3, 4}. Looks for
// filters that mention admin_level, in the old and the new expression syntax, and ignores "not equal" tests.
export function adminLevels(filter) {
  const levels = new Set();
  const numbers = (node) => {
    if (typeof node === "number") levels.add(node);
    else if (Array.isArray(node)) node.forEach(numbers);
  };
  const walk = (node) => {
    if (!Array.isArray(node)) return;
    const [op, ...rest] = node;
    const mentions = rest.some((x) => x === "admin_level" || (Array.isArray(x) && x[0] === "get" && x[1] === "admin_level"));
    if (mentions && op !== "!=" && op !== "!in" && op !== "!has") {
      rest.forEach((x) => (x === "admin_level" ? null : numbers(x)));
      return;
    }
    node.forEach(walk);
  };
  walk(filter);
  return levels;
}

// Layers drawing state-level borders: boundary lines that let admin level 3 or 4 through but not the country level 2.
export function isStateBorderLayer(layer) {
  if (layer.type !== "line" || layer["source-layer"] !== "boundary") return false;
  const levels = adminLevels(layer.filter);
  return !levels.has(2) && (levels.has(3) || levels.has(4));
}

export function emphasizeStateBorders(style) {
  const stateLayers = style.layers.filter(isStateBorderLayer);
  if (!stateLayers.length) {
    console.warn("StoryGlobe: no state border layer found in the map style; state lines keep their default look");
    return style;
  }
  // The country border colour, so state lines read as the same family of line.
  const country = style.layers.filter((l) => l.type === "line" && l["source-layer"] === "boundary" && !isStateBorderLayer(l) && adminLevels(l.filter).has(2));
  const countryColor = country.map((l) => l.paint?.["line-color"]).find((c) => typeof c === "string");
  const color = countryColor || STATE_BORDER.fallbackColor;
  const earliest = Math.min(...stateLayers.map((l) => l.minzoom ?? 0));
  return {
    ...style,
    layers: style.layers.map((layer) => {
      if (!stateLayers.includes(layer)) return layer;
      const paint = { ...layer.paint, "line-color": color, "line-opacity": STATE_BORDER.opacity, "line-width": STATE_BORDER.width };
      paint["line-dasharray"] = STATE_BORDER.dasharray;
      const out = { ...layer, paint, layout: { ...layer.layout, "line-cap": "round", "line-join": "round" } };
      // the earliest layer starts as early as we want; layers that start later (higher zoom) keep their own start
      if ((layer.minzoom ?? 0) <= earliest && earliest > STATE_BORDER.minzoom) out.minzoom = STATE_BORDER.minzoom;
      return out;
    }),
  };
}
