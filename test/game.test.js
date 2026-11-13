import test from "node:test";
import assert from "node:assert/strict";
import {
  haversineKm,
  scoreForDistance,
  PRECISION,
  pickDaily,
  dayNumber,
  MAX_DAYS_BACK,
  nextStreak,
  currentStreak,
  previousDateKey,
  addDays,
  playableDates,
  isPlayableDate,
  pruneDays,
  shareText,
  greatCircle,
  wrapLng,
  zoomForKm,
  globeZoom,
  easeInOutCubic,
  partialLine,
  revealDurationMs,
} from "../src/game.js";
import { QUESTIONS } from "../src/questions.js";

test("haversine: Paris to London is about 344 km", () => {
  const d = haversineKm(48.8566, 2.3522, 51.5074, -0.1278);
  assert.ok(d > 340 && d < 348, `got ${d}`);
});

test("haversine: same point is 0", () => {
  assert.equal(haversineKm(10, 20, 10, 20), 0);
});

test("score: city level (the default) is full 100 within 25 km, far away is near 0", () => {
  assert.equal(scoreForDistance(0), 100);
  assert.equal(scoreForDistance(25), 100);
  assert.equal(scoreForDistance(25, "city"), 100);
  assert.ok(scoreForDistance(1000) > 50 && scoreForDistance(1000) < 65);
  assert.ok(scoreForDistance(15000) < 1);
});

test("score: the more exact the target, the stricter the scoring", () => {
  const order = ["specific", "district", "city", "region"];
  // full points inside each level's own zone, and not beyond it
  for (const level of order) {
    const { fullKm } = PRECISION[level];
    assert.equal(scoreForDistance(fullKm, level), 100, level);
    assert.ok(scoreForDistance(fullKm * 3 + 20, level) < 100, level);
  }
  // at any distance, a stricter level never scores higher than a looser one
  for (const km of [0, 1, 5, 20, 50, 100, 300, 1000, 3000, 8000]) {
    for (let i = 0; i < order.length - 1; i++) {
      assert.ok(scoreForDistance(km, order[i]) <= scoreForDistance(km, order[i + 1]), `${km} km ${order[i]}`);
    }
  }
  // a 40 km miss: fine for a region, clearly costly for a specific place
  assert.equal(scoreForDistance(40, "region"), 100);
  assert.ok(scoreForDistance(40, "specific") < 97);
  // unknown level falls back to city rules
  assert.equal(scoreForDistance(1000, "nonsense"), scoreForDistance(1000, "city"));
});

test("daily pick: deterministic, 5 unique questions, differs by date", () => {
  const a = pickDaily(QUESTIONS, "2026-11-10");
  const b = pickDaily(QUESTIONS, "2026-11-10");
  const c = pickDaily(QUESTIONS, "2026-11-11");
  assert.deepEqual(a.map((q) => q.id), b.map((q) => q.id));
  assert.equal(new Set(a.map((q) => q.id)).size, 5);
  assert.notDeepEqual(a.map((q) => q.id), c.map((q) => q.id));
});

test("daily pick: no question repeats across any 26 consecutive days (the whole bank is used first)", () => {
  const days = Math.floor(QUESTIONS.length / 5);
  for (const start of ["2026-11-11", "2026-02-20", "2026-12-20", "2028-02-15"]) {
    const seen = new Set();
    for (let d = 0; d < days; d++) {
      for (const q of pickDaily(QUESTIONS, addDays(start, d))) {
        assert.ok(!seen.has(q.id), `${q.id} repeated within ${days} days from ${start}`);
        seen.add(q.id);
      }
    }
  }
  // Consecutive days are consecutive slices, also across month and year ends.
  assert.equal(dayNumber("2026-11-12") - dayNumber("2026-11-11"), 1);
  assert.equal(dayNumber("2027-01-01") - dayNumber("2026-12-31"), 1);
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

test("addDays crosses month, year and leap-day boundaries in both directions", () => {
  assert.equal(addDays("2026-11-11", -7), "2026-11-04");
  assert.equal(addDays("2026-11-03", -7), "2026-10-27");
  assert.equal(addDays("2027-01-03", -7), "2026-12-27");
  assert.equal(addDays("2028-03-01", -1), "2028-02-29");
  assert.equal(addDays("2026-12-31", 1), "2027-01-01");
  assert.equal(addDays("2026-11-11", 0), "2026-11-11");
});

test("playableDates: today and the 28 days before it, oldest first", () => {
  assert.equal(MAX_DAYS_BACK, 28);
  const days = playableDates("2026-11-11");
  assert.equal(days.length, 29);
  assert.equal(days[0], "2026-10-14");
  assert.equal(days[28], "2026-11-11");
  assert.deepEqual(playableDates("2026-11-11", 3), ["2026-11-08", "2026-11-09", "2026-11-10", "2026-11-11"]);
  // Across a clock change (Europe: 2026-10-25) every key is still a distinct calendar day.
  const across = playableDates("2026-10-27");
  assert.equal(new Set(across).size, 29);
  assert.equal(across[0], "2026-09-29");
});

test("isPlayableDate: no future days, nothing older than 28 days back", () => {
  const today = "2026-11-11";
  assert.equal(isPlayableDate("2026-11-11", today), true);
  assert.equal(isPlayableDate("2026-11-10", today), true);
  assert.equal(isPlayableDate("2026-10-14", today), true);
  assert.equal(isPlayableDate("2026-10-13", today), false);
  assert.equal(isPlayableDate("2026-11-12", today), false);
  assert.equal(isPlayableDate("2027-01-01", today), false);
  assert.equal(isPlayableDate(undefined, today), false);
  assert.equal(isPlayableDate("2026-11-04", today, 3), false);
});

test("pruneDays keeps the playable window and drops old or future days", () => {
  const days = {
    "2026-09-30": { results: [1] },
    "2026-11-04": { results: [2] },
    "2026-11-10": { results: [3] },
    "2026-11-11": { results: [4] },
    "2026-11-13": { results: [5] },
  };
  assert.deepEqual(Object.keys(pruneDays(days, "2026-11-11")), ["2026-11-04", "2026-11-10", "2026-11-11"]);
  assert.deepEqual(pruneDays(undefined, "2026-11-11"), {});
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

test("partialLine: grows from the start and reaches the full line", () => {
  const pts = Array.from({ length: 11 }, (_, i) => [i * 10, i * 5]);
  assert.equal(partialLine(pts, 0), null);
  const half = partialLine(pts, 0.5);
  assert.deepEqual(half[0], [0, 0]);
  assert.deepEqual(half[half.length - 1], [50, 25]);
  const quarter = partialLine(pts, 0.25);
  assert.deepEqual(quarter[quarter.length - 1], [25, 12.5]);
  const full = partialLine(pts, 1);
  assert.equal(full.length, 11);
  assert.deepEqual(full[full.length - 1], [100, 50]);
  assert.equal(partialLine([[0, 0]], 0.5), null);
});

test("easing and reveal duration stay in range", () => {
  assert.equal(easeInOutCubic(0), 0);
  assert.equal(easeInOutCubic(1), 1);
  assert.ok(easeInOutCubic(0.25) < 0.25 && easeInOutCubic(0.75) > 0.75);
  assert.equal(revealDurationMs(0), 1500);
  assert.equal(revealDurationMs(50000), 3000);
});
