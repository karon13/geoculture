// Builds the border lines drawn over the satellite imagery.
// Output: public/borders-countries.json and public/borders-us-states.json (GeoJSON line work, no names).
//
//   node scripts/build-borders.mjs
//
// Only shared borders are kept (country next to country, state next to state). Coastlines are left out
// because the imagery already shows them.
import { readFileSync, writeFileSync } from "node:fs";
import { mesh } from "topojson-client";

const read = (p) => JSON.parse(readFileSync(new URL(`../node_modules/${p}`, import.meta.url), "utf8"));
const round = (n) => Math.round(n * 1e4) / 1e4; // ~10 m, far finer than the 1:10M source

function roundGeometry(g) {
  const walk = (c) => (typeof c[0] === "number" ? [round(c[0]), round(c[1])] : c.map(walk));
  return { type: g.type, coordinates: walk(g.coordinates) };
}

function out(name, geometry) {
  const fc = { type: "FeatureCollection", features: [{ type: "Feature", properties: {}, geometry: roundGeometry(geometry) }] };
  const text = JSON.stringify(fc);
  writeFileSync(new URL(`../public/${name}`, import.meta.url), text);
  console.log(name, (text.length / 1024).toFixed(0), "KB");
}

const world = read("world-atlas/countries-10m.json");
out("borders-countries.json", mesh(world, world.objects.countries, (a, b) => a !== b));

const us = read("us-atlas/states-10m.json");
out("borders-us-states.json", mesh(us, us.objects.states, (a, b) => a !== b));
