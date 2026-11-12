import test from "node:test";
import assert from "node:assert/strict";
import { stripText } from "../src/libertyStyle.js";

// A tiny stand-in shaped like OpenFreeMap's Liberty style.
const liberty = {
  version: 8,
  name: "Liberty",
  glyphs: "https://example.test/fonts/{fontstack}/{range}.pbf",
  sources: { openmaptiles: { type: "vector", url: "https://example.test/planet" }, natural_earth: { type: "raster", tiles: ["https://example.test/ne/{z}/{x}/{y}.png"] } },
  layers: [
    { id: "background", type: "background", paint: {} },
    { id: "natural_earth", type: "raster", source: "natural_earth" },
    { id: "landcover_wood", type: "fill", source: "openmaptiles", "source-layer": "landcover" },
    { id: "water", type: "fill", source: "openmaptiles", "source-layer": "water" },
    { id: "road_motorway", type: "line", source: "openmaptiles", "source-layer": "transportation" },
    { id: "boundary_country", type: "line", source: "openmaptiles", "source-layer": "boundary" },
    { id: "boundary_state", type: "line", source: "openmaptiles", "source-layer": "boundary" },
    { id: "label_country", type: "symbol", source: "openmaptiles", "source-layer": "place" },
    { id: "label_city", type: "symbol", source: "openmaptiles", "source-layer": "place" },
    { id: "road_name", type: "symbol", source: "openmaptiles", "source-layer": "transportation_name" },
    { id: "poi", type: "symbol", source: "openmaptiles", "source-layer": "poi" },
    { id: "housenumber", type: "symbol", source: "openmaptiles", "source-layer": "housenumber" },
  ],
};

test("stripText: removes every text/icon layer and OpenFreeMap's own boundaries", () => {
  const out = stripText(liberty);
  assert.equal(out.layers.filter((l) => l.type === "symbol").length, 0);
  assert.equal(out.layers.filter((l) => l["source-layer"] === "boundary").length, 0);
});

test("stripText: keeps the terrain, water and road layers in their original order", () => {
  const out = stripText(liberty);
  assert.deepEqual(out.layers.map((l) => l.id), ["background", "natural_earth", "landcover_wood", "water", "road_motorway"]);
  assert.deepEqual(out.sources, liberty.sources);
});

test("stripText: does not change the style it is given", () => {
  const before = JSON.stringify(liberty);
  stripText(liberty);
  assert.equal(JSON.stringify(liberty), before);
});

// ---------- colours and themes ----------
import { parseColor, formatColor, mapColors, recolor, THEMES } from "../src/libertyStyle.js";

const close = (a, b, eps = 0.01) => assert.ok(Math.abs(a - b) < eps, `${a} is not close to ${b}`);

test("parseColor: hex, rgb and hsl forms, and not-a-colour strings", () => {
  const red = parseColor("#ff0000");
  close(red.h, 0); close(red.s, 1); close(red.l, 0.5); close(red.a, 1);
  const short = parseColor("#0f0");
  close(short.h, 120); close(short.l, 0.5);
  const rgb = parseColor("rgb(0, 0, 255)");
  close(rgb.h, 240);
  const hsl = parseColor("hsl(100, 40%, 70%)");
  close(hsl.h, 100); close(hsl.s, 0.4); close(hsl.l, 0.7);
  const alpha = parseColor("rgba(255, 255, 255, 0.5)");
  close(alpha.l, 1); close(alpha.a, 0.5);
  for (const text of ["wood", "grass", "ocean", "residential", "#12", "match"]) assert.equal(parseColor(text), null, text);
});

test("mapColors: changes colours inside expressions and stops, leaves class names alone", () => {
  const dark = ({ h, s, l, a }) => ({ h, s, l: l / 2, a });
  const expr = ["match", ["get", "class"], "wood", "hsl(100, 40%, 40%)", "grass", "#ffffff", "hsl(0, 0%, 100%)"];
  const out = mapColors(expr, dark);
  assert.equal(out[0], "match");
  assert.deepEqual(out[1], ["get", "class"]);
  assert.equal(out[2], "wood");
  assert.equal(out[4], "grass");
  assert.equal(parseColor(out[3]).l.toFixed(2), "0.20");
  assert.equal(parseColor(out[5]).l.toFixed(2), "0.50");
  const stops = mapColors({ base: 1, stops: [[4, "#ffffff"], [10, "#000000"]] }, dark);
  assert.equal(parseColor(stops.stops[0][1]).l.toFixed(2), "0.50");
  assert.equal(stops.base, 1);
  assert.equal(mapColors(7, dark), 7);
});

const base = () => ({
  version: 8,
  sources: { openmaptiles: { type: "vector", url: "https://example.test/planet" }, natural_earth: { type: "raster", tiles: ["https://example.test/ne/{z}/{x}/{y}.png"] } },
  layers: [
    { id: "background", type: "background", paint: { "background-color": "#f8f4f0" } },
    { id: "natural_earth", type: "raster", source: "natural_earth", paint: { "raster-opacity": 1 } },
    { id: "landcover_wood", type: "fill", source: "openmaptiles", "source-layer": "landcover", paint: { "fill-color": ["match", ["get", "class"], "wood", "hsl(100, 40%, 70%)", "hsl(60, 30%, 90%)"], "fill-opacity": 0.8 } },
    { id: "water", type: "fill", source: "openmaptiles", "source-layer": "water", paint: { "fill-color": "hsl(205, 56%, 73%)", "fill-outline-color": "#aabbcc" } },
    { id: "river", type: "line", source: "openmaptiles", "source-layer": "waterway", paint: { "line-color": "hsl(205, 56%, 73%)", "line-width": 1 } },
    { id: "road", type: "line", source: "openmaptiles", "source-layer": "transportation", paint: { "line-color": { stops: [[5, "#ffffff"], [12, "#ffcc88"]] } } },
  ],
});

test("recolor: unknown theme is an error, input is left unchanged", () => {
  const style = base();
  const before = JSON.stringify(style);
  assert.throws(() => recolor(style, "pink"), /Unknown map theme/);
  recolor(style, "liberty");
  assert.equal(JSON.stringify(style), before);
});

for (const name of Object.keys(THEMES)) {
  test(`recolor ${name}: background, sea, rivers and the low-zoom image follow the theme`, () => {
    const t = THEMES[name];
    const out = recolor(base(), name);
    const byId = Object.fromEntries(out.layers.map((l) => [l.id, l]));
    assert.equal(byId.background.paint["background-color"], "#f8f4f0", "land base is left as Liberty has it");
    assert.equal(byId.water.paint["fill-color"], t.ocean);
    assert.equal(byId.water.paint["fill-outline-color"], undefined);
    assert.equal(byId.river.paint["line-color"], t.river);
    for (const [k, v] of Object.entries(t.raster)) assert.equal(byId.natural_earth.paint[k], v);
    assert.equal(byId.natural_earth.paint["raster-opacity"], 1);
  });

  test(`recolor ${name}: land colours and opacity are left exactly as Liberty has them`, () => {
    const before = base();
    const out = recolor(base(), name);
    for (const id of ["landcover_wood", "road"]) {
      assert.deepEqual(out.layers.find((l) => l.id === id).paint, before.layers.find((l) => l.id === id).paint);
    }
  });

  test(`recolor ${name}: a coastal glow is added right after the water fill, inside the water`, () => {
    const out = recolor(base(), name);
    const ids = out.layers.map((l) => l.id);
    assert.deepEqual(ids.slice(ids.indexOf("water"), ids.indexOf("water") + 3), ["water", "shelf-glow-wide", "shelf-glow"]);
    const glow = out.layers.find((l) => l.id === "shelf-glow");
    assert.equal(glow.source, "openmaptiles");
    assert.equal(glow["source-layer"], "water");
    assert.ok(glow.paint["line-offset"] > 0, "positive offset is the water side of a polygon outline");
    assert.equal(glow.paint["line-color"], THEMES[name].glow);
  });
}

test("recolor: a style without a water layer still works (no glow)", () => {
  const style = base();
  style.layers = style.layers.filter((l) => l.id !== "water");
  const out = recolor(style, "liberty");
  assert.equal(out.layers.some((l) => l.id.startsWith("shelf-glow")), false);
});

test("formatColor: round trip", () => {
  const c = parseColor("hsl(205, 56%, 73%)");
  const back = parseColor(formatColor(c));
  close(back.h, 205, 0.1); close(back.s, 0.56); close(back.l, 0.73);
});
