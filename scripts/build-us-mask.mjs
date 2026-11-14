// Builds src/usMask.js: a rough outline of the contiguous United States, pushed outward by about 30 km.
//
//   node scripts/build-us-mask.mjs
//
// The map style uses it as a mask ("within" filter) so that only state borders inside the US are restyled;
// Canadian provinces and Mexican states keep the default look. It is deliberately a little too big, so state
// lines that run right up to the national border or the coast are fully inside. No names, just a shape.
import { readFileSync, writeFileSync } from "node:fs";
import { feature } from "topojson-client";

const OFFSET_DEG = 0.3; // outward push, in degrees of latitude (~33 km)
const SIMPLIFY_DEG = 0.05; // Douglas-Peucker tolerance (~4 km)
const KX = Math.cos((38 * Math.PI) / 180); // longitude squeeze at US latitudes, so offsets are round

const us = JSON.parse(readFileSync(new URL("../node_modules/us-atlas/states-10m.json", import.meta.url), "utf8"));
const collection = feature(us, us.objects.nation); // a FeatureCollection with the one outline
const geometry = (collection.features ? collection.features[0] : collection).geometry;
const polygons = geometry.type === "MultiPolygon" ? geometry.coordinates : [geometry.coordinates];
const area = (ring) => Math.abs(ring.reduce((a, p, i) => a + (ring[(i + 1) % ring.length][0] * p[1] - p[0] * ring[(i + 1) % ring.length][1]), 0)) / 2;
const ring0 = polygons.map((p) => p[0]).sort((a, b) => area(b) - area(a))[0]; // contiguous US = biggest piece

const proj = ([x, y]) => [x * KX, y];
const unproj = ([x, y]) => [x / KX, y];

function simplify(points, tol) {
  const dist = (p, a, b) => {
    const dx = b[0] - a[0], dy = b[1] - a[1];
    const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / (dx * dx + dy * dy || 1)));
    return Math.hypot(p[0] - (a[0] + t * dx), p[1] - (a[1] + t * dy));
  };
  const keep = new Array(points.length).fill(false);
  keep[0] = keep[points.length - 1] = true;
  const stack = [[0, points.length - 1]];
  while (stack.length) {
    const [i, j] = stack.pop();
    let max = 0, idx = -1;
    for (let k = i + 1; k < j; k++) {
      const d = dist(points[k], points[i], points[j]);
      if (d > max) [max, idx] = [d, k];
    }
    if (max > tol) {
      keep[idx] = true;
      stack.push([i, idx], [idx, j]);
    }
  }
  return points.filter((_, i) => keep[i]);
}

// --- 1. a raster of the US, grown by OFFSET_DEG -------------------------------------------------------------
// (Offsetting the outline itself makes it cross itself around bays and lakes, so the shape is drawn on a coarse
// grid, grown, and traced again instead. The result is one simple outline with no holes.)
const outline = simplify(ring0.map(proj), SIMPLIFY_DEG);
const CELL = 0.12; // degrees
const [X0, X1, Y0, Y1] = [-128, -64, 22, 51];
const cols = Math.ceil((X1 - X0) / CELL), rows = Math.ceil((Y1 - Y0) / CELL);
const inPoly = ([x, y]) => {
  let inside = false;
  for (let i = 0, j = outline.length - 1; i < outline.length; j = i++) {
    const [xi, yi] = outline[i], [xj, yj] = outline[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
};
const distToOutline = ([x, y]) => {
  let best = Infinity;
  for (let i = 0; i < outline.length; i++) {
    const a = outline[i], b = outline[(i + 1) % outline.length];
    const dx = b[0] - a[0], dy = b[1] - a[1];
    const t = Math.max(0, Math.min(1, ((x - a[0]) * dx + (y - a[1]) * dy) / (dx * dx + dy * dy || 1)));
    best = Math.min(best, Math.hypot(x - (a[0] + t * dx), y - (a[1] + t * dy)));
  }
  return best;
};
const grid = Array.from({ length: rows }, (_, r) =>
  Array.from({ length: cols }, (_, c) => {
    const p = proj([X0 + (c + 0.5) * CELL, Y0 + (r + 0.5) * CELL]);
    return inPoly(p) || distToOutline(p) <= OFFSET_DEG;
  }),
);
// fill holes (lakes, bays closed off by the growth): everything not reachable from the grid edge is inside
const outside = Array.from({ length: rows }, () => new Array(cols).fill(false));
const queue = [];
for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) if ((r === 0 || c === 0 || r === rows - 1 || c === cols - 1) && !grid[r][c]) { outside[r][c] = true; queue.push([r, c]); }
while (queue.length) {
  const [r, c] = queue.pop();
  for (const [dr, dc] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
    const rr = r + dr, cc = c + dc;
    if (rr >= 0 && cc >= 0 && rr < rows && cc < cols && !grid[rr][cc] && !outside[rr][cc]) { outside[rr][cc] = true; queue.push([rr, cc]); }
  }
}
const filled = (r, c) => r >= 0 && c >= 0 && r < rows && c < cols && !outside[r][c];

// --- 2. trace the outline of the filled cells ---------------------------------------------------------------
// directed edges with the filled cell on the left; linked into loops; the biggest loop is the mainland.
const edges = new Map(); // "x,y" -> [[x2,y2], ...]
const addEdge = (a, b) => { const k = a.join(","); (edges.get(k) || edges.set(k, []).get(k)).push(b); };
for (let r = 0; r < rows; r++)
  for (let c = 0; c < cols; c++) {
    if (!filled(r, c)) continue;
    if (!filled(r - 1, c)) addEdge([c + 1, r], [c, r]); // bottom side (west-going keeps fill on the left when y is up)
    if (!filled(r + 1, c)) addEdge([c, r + 1], [c + 1, r + 1]);
    if (!filled(r, c - 1)) addEdge([c, r], [c, r + 1]);
    if (!filled(r, c + 1)) addEdge([c + 1, r + 1], [c + 1, r]);
  }
const loops = [];
while (edges.size) {
  const [startKey] = edges.keys();
  const start = startKey.split(",").map(Number);
  const loop = [start];
  let cur = start;
  for (;;) {
    const options = edges.get(cur.join(","));
    if (!options || !options.length) break;
    const next = options.pop();
    if (!options.length) edges.delete(cur.join(","));
    if (next[0] === start[0] && next[1] === start[1]) break;
    loop.push(next);
    cur = next;
  }
  loops.push(loop);
}
const loopArea = (l) => Math.abs(l.reduce((a, p, i) => a + (l[(i + 1) % l.length][0] * p[1] - p[0] * l[(i + 1) % l.length][1]), 0)) / 2;
let loop = loops.sort((a, b) => loopArea(b) - loopArea(a))[0];
const toLonLat = ([c, r]) => [X0 + c * CELL, Y0 + r * CELL];
let finalRing = simplify([...loop, loop[0]].map(toLonLat).map(proj), 0.06);
finalRing = finalRing.slice(0, -1);

// self-intersection check (O(n^2), n is a few hundred)
const seg = (a, b, c, d) => {
  const o = (p, q, r) => Math.sign((q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0]));
  return o(a, b, c) !== o(a, b, d) && o(c, d, a) !== o(c, d, b);
};
let crossings = 0;
for (let i = 0; i < finalRing.length; i++)
  for (let j = i + 2; j < finalRing.length; j++) {
    if (i === 0 && j === finalRing.length - 1) continue;
    if (seg(finalRing[i], finalRing[(i + 1) % finalRing.length], finalRing[j], finalRing[(j + 1) % finalRing.length])) crossings++;
  }

const r3 = (v) => Math.round(v * 1000) / 1000;
const out = finalRing.map(unproj).map(([x, y]) => [r3(x), r3(y)]);
out.push(out[0]);
const text = `// Generated by scripts/build-us-mask.mjs, do not edit by hand.
// Rough outline of the contiguous United States, about 30 km larger than the real one (see the script).
export const US_MASK = ${JSON.stringify({ type: "Polygon", coordinates: [out] })};
`;
writeFileSync(new URL("../src/usMask.js", import.meta.url), text);
console.log(`src/usMask.js: ${out.length - 1} points, ${(text.length / 1024).toFixed(1)} KB, self-crossings: ${crossings}`);
