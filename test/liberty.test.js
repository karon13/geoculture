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
