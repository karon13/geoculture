import test from "node:test";
import assert from "node:assert/strict";
import { featureFilter } from "@maplibre/maplibre-gl-style-spec";
import { readFileSync } from "node:fs";
import { US_MASK } from "../src/usMask.js";
import { stripText, deepSea, SEA, earthTone, parseColor, adminLevels, isStateBorderLayer, emphasizeStateBorders, toExpressionFilter, STATE_BORDER } from "../src/libertyStyle.js";

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

test("adminLevels reads old and new filter syntax and ignores not-equal", () => {
  assert.deepEqual([...adminLevels(["all", ["in", "admin_level", 3, 4], ["!=", "maritime", 1]])], [3, 4]);
  assert.deepEqual([...adminLevels(["==", "admin_level", 2])], [2]);
  assert.deepEqual([...adminLevels(["==", ["get", "admin_level"], 4])], [4]);
  assert.deepEqual([...adminLevels(["match", ["get", "admin_level"], [3, 4], true, false])].sort(), [3, 4]);
  assert.deepEqual([...adminLevels(["all", ["!=", "admin_level", 2], ["==", "disputed", 1]])], []);
  assert.deepEqual([...adminLevels(undefined)], []);
});

test("emphasizeStateBorders adds a stronger US-only copy of each state layer and leaves the rest alone", () => {
  const style = {
    layers: [
      { id: "boundary_3", type: "line", source: "openmaptiles", "source-layer": "boundary", minzoom: 4,
        filter: ["all", ["in", "admin_level", 3, 4], ["!=", "maritime", 1]], paint: { "line-color": "#aaa", "line-width": 0.5, "line-dasharray": [2, 2], "line-opacity": 0.3 } },
      { id: "boundary_2", type: "line", source: "openmaptiles", "source-layer": "boundary",
        filter: ["==", "admin_level", 2], paint: { "line-color": "hsl(248, 7%, 66%)", "line-width": 1.5 } },
      { id: "road", type: "line", source: "openmaptiles", "source-layer": "transportation", paint: {} },
    ],
  };
  assert.equal(isStateBorderLayer(style.layers[0]), true);
  assert.equal(isStateBorderLayer(style.layers[1]), false);
  const out = emphasizeStateBorders(style);
  assert.deepEqual(out.layers.map((l) => l.id), ["boundary_3", "boundary_3-us", "boundary_2", "road"]);
  assert.deepEqual(out.layers[0], style.layers[0]); // Liberty's own layer is untouched, so other countries look as before
  assert.deepEqual(out.layers[2], style.layers[1]);
  assert.deepEqual(out.layers[3], style.layers[2]);
  const us = out.layers[1];
  assert.equal(us.paint["line-color"], "hsl(248, 7%, 66%)");
  assert.equal(us.paint["line-dasharray"], undefined);
  assert.deepEqual(us.paint["line-opacity"], STATE_BORDER.opacity);
  assert.equal(us.minzoom, STATE_BORDER.minzoom);
  // old-style filter rewritten as an expression, then limited to the US outline
  assert.equal(us.filter[0], "all");
  assert.deepEqual(us.filter[1], ["all", ["in", ["get", "admin_level"], ["literal", [3, 4]]], ["!=", ["get", "maritime"], 1]]);
  assert.equal(us.filter[2][0], "within");
  assert.equal(us.filter[2][1].type, "Polygon");
});

test("toExpressionFilter agrees with MapLibre's own converter on sample features", () => {
  const filters = [
    ["all", ["in", "admin_level", 3, 4], ["!=", "maritime", 1]],
    ["==", "admin_level", 2],
    ["any", ["==", "class", "state"], ["!in", "admin_level", 2, 3]],
    ["none", ["==", "disputed", 1]],
    ["has", "name"],
    ["!has", "name"],
    ["==", "$type", "LineString"],
    ["all", ["==", ["get", "admin_level"], 4], ["!=", ["get", "maritime"], 1]], // already an expression
  ];
  const features = [
    { properties: { admin_level: 2, maritime: 0 } },
    { properties: { admin_level: 3, maritime: 0 } },
    { properties: { admin_level: 4, maritime: 1, name: "x" } },
    { properties: { admin_level: 4, class: "state", disputed: 1 } },
    { properties: { admin_level: 6 } },
  ].map((f) => ({ type: 2, geometry: [], id: 1, ...f }));
  for (const f of filters) {
    const mine = featureFilter(toExpressionFilter(f)).filter({ zoom: 5 }, features[0]);
    assert.equal(typeof mine, "boolean");
    for (const feat of features) {
      const ours = featureFilter(toExpressionFilter(f)).filter({ zoom: 5 }, feat);
      const theirs = featureFilter(f).filter({ zoom: 5 }, feat);
      assert.equal(ours, theirs, `${JSON.stringify(f)} on ${JSON.stringify(feat.properties)}`);
    }
  }
});

test("the US outline: contains every US state line, none of the neighbours' provinces or states", () => {
  const data = JSON.parse(readFileSync(new URL("../public/borders-us-states.json", import.meta.url)));
  const ring = US_MASK.coordinates[0];
  const inside = ([x, y]) => {
    let ins = false;
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const [xi, yi] = ring[i], [xj, yj] = ring[j];
      if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) ins = !ins;
    }
    return ins;
  };
  const points = data.features.flatMap((f) => f.geometry.coordinates.flat());
  assert.ok(points.length > 1000);
  assert.deepEqual(points.filter((p) => !inside(p)), []);
  for (const [name, p] of Object.entries({ "Alberta/BC": [-114.5, 50.5], Manitoba: [-98, 50.5], Ontario: [-89, 48.6], Quebec: [-73.5, 45.5], Sonora: [-110.5, 30], Chihuahua: [-106, 29], Baja: [-115.5, 30] })) {
    assert.equal(inside(p), false, name);
  }
});

test("MapLibre's own 'within' filter keeps a US line and drops a Canadian one", () => {
  const filter = featureFilter(["within", US_MASK]);
  // tile z4 x3 y6 covers roughly lng -112.5..-90, lat 36.6..21.9 mirrored; use a z3 tile over North America instead
  const canonical = { z: 3, x: 1, y: 2 }; // lng -135..-90, lat 40.98..0 ... see below
  const toTile = (lng, lat) => {
    const n = 2 ** canonical.z;
    const fx = ((lng + 180) / 360) * n;
    const fy = ((1 - Math.log(Math.tan((lat * Math.PI) / 180) + 1 / Math.cos((lat * Math.PI) / 180)) / Math.PI) / 2) * n;
    return { x: Math.round((fx - canonical.x) * 8192), y: Math.round((fy - canonical.y) * 8192) };
  };
  const line = (...pts) => ({ type: 2, properties: {}, geometry: [pts.map(([lng, lat]) => toTile(lng, lat))] });
  // canonical tile z3/x1/y2 spans lng -135..-90 and lat 40.98..0; both test lines must lie inside it
  assert.equal(filter.filter({ zoom: 5 }, line([-110, 37], [-109, 36]), canonical), true); // Four Corners area, US
  assert.equal(filter.filter({ zoom: 5 }, line([-110, 30], [-109, 29]), canonical), false); // Sonora, Mexico
});

test("emphasizeStateBorders leaves a style without state lines alone", () => {
  const style = { layers: [{ id: "bg", type: "background", paint: {} }] };
  const warn = console.warn;
  console.warn = () => {};
  try {
    assert.deepEqual(emphasizeStateBorders(style), style);
  } finally {
    console.warn = warn;
  }
});
