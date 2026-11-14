import test from "node:test";
import assert from "node:assert/strict";
import { stripText, deepSea, SEA, earthTone, parseColor } from "../src/libertyStyle.js";

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

test("stripText: removes every text/icon layer but keeps Liberty's own boundaries", () => {
  const out = stripText(liberty);
  assert.equal(out.layers.filter((l) => l.type === "symbol").length, 0);
  assert.equal(out.layers.filter((l) => l["source-layer"] === "boundary").length, 2);
});

test("stripText: keeps the terrain, water and road layers in their original order", () => {
  const out = stripText(liberty);
  assert.deepEqual(out.layers.map((l) => l.id), ["background", "natural_earth", "landcover_wood", "water", "road_motorway", "boundary_country", "boundary_state"]);
  assert.deepEqual(out.sources, liberty.sources);
});

test("stripText: does not change the style it is given", () => {
  const before = JSON.stringify(liberty);
  stripText(liberty);
  assert.equal(JSON.stringify(liberty), before);
});

test("deepSea: sea, rivers and the low-zoom image change; land and roads stay as they were", () => {
  const style = {
    ...liberty,
    layers: [
      ...liberty.layers,
      { id: "waterway", type: "line", source: "openmaptiles", "source-layer": "waterway", paint: { "line-color": "#aaccee" } },
    ].map((l) => (l.id === "water" ? { ...l, paint: { "fill-color": "#aaccee", "fill-outline-color": "#fff" } } : l)),
  };
  const out = deepSea(style);
  const by = (id) => out.layers.find((l) => l.id === id);
  assert.equal(by("water").paint["fill-color"], SEA);
  assert.equal(by("water").paint["fill-outline-color"], undefined);
  assert.equal(by("waterway").paint["line-color"], SEA);
  assert.ok(by("natural_earth").paint["raster-brightness-max"] < 1);
  assert.deepEqual(by("road_motorway"), style.layers.find((l) => l.id === "road_motorway"));
  assert.equal(out.layers.length, style.layers.length);
});

test("earthTone: land gets darker with more contrast, greens move toward olive, snow stays white", () => {
  const light = earthTone(parseColor("hsl(98, 61%, 72%)"));
  assert.ok(light.l < 0.72, "light green gets darker");
  assert.ok(light.h < 98 && light.h > 90, "green drifts toward olive");
  const lighter = earthTone(parseColor("hsl(47, 13%, 90%)"));
  const darker = earthTone(parseColor("hsl(47, 13%, 60%)"));
  assert.ok(lighter.l - darker.l > 0.9 - 0.6, "contrast between light and dark land grows");
  assert.equal(earthTone(parseColor("#f8f8f8")).l, parseColor("#f8f8f8").l);
});

test("deepSea: land fills and the base colour are re-toned, roads are not", () => {
  const style = {
    ...liberty,
    layers: liberty.layers.map((l) =>
      l.id === "background" ? { ...l, paint: { "background-color": "hsl(47, 26%, 88%)" } }
      : l.id === "landcover_wood" ? { ...l, paint: { "fill-color": ["match", ["get", "class"], "wood", "hsl(98, 61%, 72%)", "hsl(75, 45%, 85%)"], "fill-opacity": 0.8 } }
      : l.id === "road_motorway" ? { ...l, paint: { "line-color": "hsl(28, 80%, 70%)" } }
      : l,
    ),
  };
  const out = deepSea(style);
  const by = (id) => out.layers.find((l) => l.id === id);
  assert.notEqual(by("background").paint["background-color"], "hsl(47, 26%, 88%)");
  const wood = by("landcover_wood").paint;
  assert.equal(wood["fill-opacity"], 0.8);
  assert.equal(wood["fill-color"][0], "match");
  assert.equal(wood["fill-color"][2], "wood", "class names are left alone");
  assert.notEqual(wood["fill-color"][3], "hsl(98, 61%, 72%)");
  assert.equal(by("road_motorway").paint["line-color"], "hsl(28, 80%, 70%)");
});

import { readFileSync } from "node:fs";
import { STATE_BORDER_LAYER, STATE_BORDERS_URL, addUsStateBorders } from "../src/mapStyle.js";

test("US state borders: the line file is shipped and is plain border lines", () => {
  const data = JSON.parse(readFileSync(new URL(`../public/${STATE_BORDERS_URL}`, import.meta.url)));
  assert.equal(data.type, "FeatureCollection");
  assert.ok(data.features.length >= 1);
  assert.ok(data.features.every((f) => /LineString/.test(f.geometry.type)));
  // no names or other properties that could give an answer away
  assert.ok(data.features.every((f) => Object.keys(f.properties || {}).length === 0));
});

test("US state borders: fade in before zoom 4 and are added once, below the layer given", () => {
  const stops = STATE_BORDER_LAYER.paint["line-opacity"];
  const fullAt = stops[stops.indexOf(stops.find((v, i) => i > 3 && v > 0.5)) - 1];
  assert.ok(fullAt <= 4);
  const calls = [];
  const fake = {
    getSource: () => calls.some((c) => c[0] === "source"),
    getLayer: () => calls.some((c) => c[0] === "layer"),
    addSource: (...a) => calls.push(["source", ...a]),
    addLayer: (...a) => calls.push(["layer", ...a]),
  };
  addUsStateBorders(fake, "link-casing");
  addUsStateBorders(fake, "link-casing");
  assert.equal(calls.length, 2);
  assert.equal(calls[1][2], "link-casing");
});
