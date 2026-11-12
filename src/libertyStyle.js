// OpenFreeMap's "Liberty" style, minus anything that says where you are, in the game's own colours.
//
// Liberty is OpenFreeMap's full-colour map style and it draws terrain nicely even when zoomed out, so we
// fetch the real style from OpenFreeMap when the map starts and change it in three steps:
//   1. stripText:  remove every text and icon layer (place, street and country names, shields, points of
//                  interest, house numbers; all of them are layers of type "symbol") and OpenFreeMap's own
//                  boundary lines, because the game draws its own country and US state borders;
//   2. recolor:    re-tone all its colours to one of the themes below, set the sea colour, and add a soft
//                  glow along the coasts so the sea is not one flat colour;
//   3. (in mapStyle.js) put our borders on top.
// Everything else (shapes, roads, buildings, how things fade in with zoom) stays as OpenFreeMap designed it.
export const LIBERTY_STYLE_URL = "https://tiles.openfreemap.org/styles/liberty";

export function stripText(style) {
  return {
    ...style,
    layers: style.layers.filter((layer) => layer.type !== "symbol" && layer["source-layer"] !== "boundary"),
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

// ---------- themes ----------

// Each theme sets the sea and the land base, how every other colour is re-toned (`tone`), how the low-zoom
// image layer, if Liberty has one, is darkened, and the coastal glow colour. Very light colours (white roads,
// snow) are kept light on purpose so they still stand out.
export const THEMES = {
  // A: dark and modern, close to the game's own dark interface.
  night: {
    label: "A · night",
    ocean: "#0a1727",
    river: "#12304d",
    glow: "#17385a",
    land: "#2b3732",
    tone: ({ h, s, l, a }) => ({ h, s: s * 0.5, l: l > 0.93 ? 0.62 : 0.1 + l * 0.26, a }),
    raster: { "raster-brightness-max": 0.35, "raster-saturation": -0.35, "raster-contrast": 0.1 },
  },
  // D: close to the satellite look, but calmer: deep teal sea, earthy olive land.
  natural: {
    label: "D · natural sea",
    ocean: "#0b3556",
    river: "#13506f",
    glow: "#1c6d8f",
    land: "#5f6c4b",
    tone: ({ h, s, l, a }) => ({ h, s: s * 0.8, l: l > 0.93 ? l : l * 0.62, a }),
    raster: { "raster-brightness-max": 0.7, "raster-saturation": -0.1 },
  },
};

const COLOR_KEY = /-color$/;

export function recolor(style, themeName) {
  const theme = THEMES[themeName];
  if (!theme) throw new Error(`Unknown map theme: ${themeName}`);

  const layers = style.layers.map((layer) => {
    const paint = { ...(layer.paint || {}) };
    if (layer.type === "background") {
      paint["background-color"] = theme.land;
    } else if (layer.type === "raster") {
      Object.assign(paint, theme.raster);
    } else if (layer.type === "fill" && layer["source-layer"] === "water") {
      paint["fill-color"] = theme.ocean;
      delete paint["fill-outline-color"];
      delete paint["fill-pattern"];
    } else if (layer.type === "line" && layer["source-layer"] === "waterway") {
      paint["line-color"] = theme.river;
    } else {
      for (const key of Object.keys(paint)) {
        if (COLOR_KEY.test(key)) paint[key] = mapColors(paint[key], theme.tone);
      }
    }
    return { ...layer, paint };
  });

  // A soft glow along the coasts, drawn inside the water just above the water fill, like shallow shelf
  // water. The line is offset to the right of its direction, which for the outline of a water polygon is
  // the water side. It fades out once zoomed in, where it would only make ponds and rivers look blurry.
  let lastWater = -1;
  layers.forEach((layer, i) => {
    if (layer.type === "fill" && layer["source-layer"] === "water") lastWater = i;
  });
  if (lastWater >= 0) {
    const source = layers[lastWater].source;
    const glow = (id, width, opacity) => ({
      id,
      type: "line",
      source,
      "source-layer": "water",
      maxzoom: 10,
      layout: { "line-join": "round" },
      paint: {
        "line-color": theme.glow,
        "line-width": width,
        "line-offset": width / 2,
        "line-blur": width * 0.8,
        "line-opacity": ["interpolate", ["linear"], ["zoom"], 0, opacity, 7, opacity, 10, 0],
      },
    });
    layers.splice(lastWater + 1, 0, glow("shelf-glow-wide", 26, 0.4), glow("shelf-glow", 10, 0.7));
  }

  return { ...style, layers };
}
