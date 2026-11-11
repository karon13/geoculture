import test from "node:test";
import assert from "node:assert/strict";
import {
  haversineKm,
  scoreForDistance,
  pickDaily,
  nextStreak,
  currentStreak,
  previousDateKey,
  shareText,
  greatCircle,
  wrapLng,
  zoomForKm,
  globeZoom,
} from "../src/game.js";
import { QUESTIONS } from "../src/questions.js";

test("haversine: Paris to London is about 344 km", () => {
  const d = haversineKm(48.8566, 2.3522, 51.5074, -0.1278);
  assert.ok(d > 340 && d < 348, `got ${d}`);
});

test("haversine: same point is 0", () => {
  assert.equal(haversineKm(10, 20, 10, 20), 0);
});

test("score: within 25 km is full 100, far away is near 0", () => {
  assert.equal(scoreForDistance(0), 100);
  assert.equal(scoreForDistance(25), 100);
  assert.ok(scoreForDistance(1000) > 50 && scoreForDistance(1000) < 65);
  assert.ok(scoreForDistance(15000) < 1);
});

test("daily pick: deterministic, 5 unique questions, differs by date", () => {
  const a = pickDaily(QUESTIONS, "2026-11-10");
  const b = pickDaily(QUESTIONS, "2026-11-10");
  const c = pickDaily(QUESTIONS, "2026-11-11");
  assert.deepEqual(a.map((q) => q.id), b.map((q) => q.id));
  assert.equal(new Set(a.map((q) => q.id)).size, 5);
  assert.notDeepEqual(a.map((q) => q.id), c.map((q) => q.id));
});

test("question data: valid coordinates, unique ids, all four categories", () => {
  const ids = new Set();
  const cats = new Set();
  for (const q of QUESTIONS) {
    assert.ok(!ids.has(q.id), `duplicate id ${q.id}`);
    ids.add(q.id);
    cats.add(q.category);
    assert.ok(q.lat >= -90 && q.lat <= 90, q.id);
    assert.ok(q.lng >= -180 && q.lng <= 180, q.id);
    assert.ok(q.prompt && q.story && q.title && q.place, q.id);
  }
  assert.deepEqual([...cats].sort(), ["art", "books", "movies", "music"]);
});

test("streak: consecutive days extend, gaps reset, same day is idempotent", () => {
  assert.equal(previousDateKey("2026-03-01"), "2026-02-28");
  assert.equal(previousDateKey("2027-01-01"), "2026-12-31");
  let s = nextStreak({}, "2026-11-10");
  assert.deepEqual(s, { streak: 1, lastCompleted: "2026-11-10" });
  s = nextStreak(s, "2026-11-10");
  assert.equal(s.streak, 1);
  s = nextStreak(s, "2026-11-11");
  assert.equal(s.streak, 2);
  s = nextStreak(s, "2026-11-13");
  assert.equal(s.streak, 1);
});

test("currentStreak shows 0 once a day has been missed", () => {
  const s = { streak: 4, lastCompleted: "2026-11-10" };
  assert.equal(currentStreak(s, "2026-11-10"), 4);
  assert.equal(currentStreak(s, "2026-11-11"), 4);
  assert.equal(currentStreak(s, "2026-11-12"), 0);
});

test("share text includes date, squares and total", () => {
  const t = shareText("2026-11-10", [
    { points: 100 },
    { points: 60 },
    { points: 30 },
    { points: 5 },
    { points: 0 },
  ]);
  assert.match(t, /2026-11-10/);
  assert.match(t, /195\/500/);
});

test("greatCircle: endpoints match and the route is continuous across the antimeridian", () => {
  const ams = { lat: 52.37, lng: 4.9 };
  const akl = { lat: -36.85, lng: 174.76 };
  const pts = greatCircle(ams, akl);
  assert.equal(pts.length, 65);
  assert.ok(Math.abs(pts[0][0] - 4.9) < 1e-6 && Math.abs(pts[0][1] - 52.37) < 1e-6);
  assert.ok(Math.abs(wrapLng(pts[64][0]) - 174.76) < 1e-6);
  for (let i = 1; i < pts.length; i++) {
    assert.ok(Math.abs(pts[i][0] - pts[i - 1][0]) < 20, `jump at ${i}`);
  }
  // A Pacific crossing: Tokyo to Los Angeles must not flip from +180 to -180.
  const pac = greatCircle({ lat: 35.7, lng: 139.7 }, { lat: 34.05, lng: -118.24 });
  for (let i = 1; i < pac.length; i++) {
    assert.ok(Math.abs(pac[i][0] - pac[i - 1][0]) < 20, `pacific jump at ${i}`);
  }
});

test("greatCircle: identical points do not produce NaN", () => {
  const pts = greatCircle({ lat: 10, lng: 10 }, { lat: 10, lng: 10 });
  assert.ok(pts.every(([x, y]) => Number.isFinite(x) && Number.isFinite(y)));
});

test("wrapLng brings any longitude into -180..180", () => {
  assert.equal(wrapLng(190), -170);
  assert.equal(wrapLng(-190), 170);
  assert.equal(wrapLng(45), 45);
});

test("zoomForKm: closer guesses zoom in more, clamped to a sane range", () => {
  const far = zoomForKm(8000, 30, 600);
  const near = zoomForKm(25, 30, 600);
  assert.ok(near > far + 4);
  assert.ok(zoomForKm(0, 30, 600) <= 14);
  assert.ok(zoomForKm(40000, 30, 600) >= 0.8);
});

test("globeZoom fits the globe: bigger screens zoom in further", () => {
  assert.ok(globeZoom(900) > globeZoom(400));
});
