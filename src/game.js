// Pure game logic: no DOM, so it can be unit-tested with `node --test`.

export const ROUNDS_PER_DAY = 5;
export const POINTS_PER_ROUND = 100;

const EARTH_RADIUS_KM = 6371;

export function haversineKm(lat1, lng1, lat2, lng2) {
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(a)));
}

// How exact the answer is, and what that means for scoring. A guess inside `fullKm` earns all 100 points;
// beyond it the score falls off exponentially, faster when `scaleKm` is smaller. The more exact the target, the
// smaller the free zone and the faster the falloff. These are the only numbers to tune; the README and the About
// page describe them.
export const PRECISION = {
  specific: { label: "Specific place", icon: "🎯", fullKm: 2, scaleKm: 1000 },
  district: { label: "District", icon: "🏘️", fullKm: 8, scaleKm: 1400 },
  city: { label: "City / town", icon: "🏙️", fullKm: 25, scaleKm: 1800 },
  region: { label: "Region", icon: "🗺️", fullKm: 100, scaleKm: 2500 },
};

export function scoreForDistance(km, level = "city") {
  const { fullKm, scaleKm } = PRECISION[level] || PRECISION.city;
  const effective = Math.max(0, km - fullKm);
  return Math.round(POINTS_PER_ROUND * Math.exp(-effective / scaleKm));
}

// Local calendar date as YYYY-MM-DD, so "daily" follows the player's own midnight.
export function dateKey(date = new Date()) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function previousDateKey(key) {
  return addDays(key, -1);
}

// Calendar arithmetic on YYYY-MM-DD keys (local dates, so month ends and clock changes are handled).
export function addDays(key, n) {
  const [y, m, d] = key.split("-").map(Number);
  return dateKey(new Date(y, m - 1, d + n));
}

// How many days back a missed day can still be played.
export const MAX_DAYS_BACK = 28;

// The days a player can open, oldest first and ending with today: [today-7, ..., today].
export function playableDates(today, maxBack = MAX_DAYS_BACK) {
  return Array.from({ length: maxBack + 1 }, (_, i) => addDays(today, i - maxBack));
}

// Today and up to `maxBack` days before it. Nothing after today, nothing older than the window.
// (Keys are zero-padded YYYY-MM-DD, so plain string comparison is date order.)
export function isPlayableDate(key, today, maxBack = MAX_DAYS_BACK) {
  return typeof key === "string" && key <= today && key >= addDays(today, -maxBack);
}

// Drops saved days that fell out of the window (or are in the future, e.g. after a clock change).
export function pruneDays(days = {}, today, maxBack = MAX_DAYS_BACK) {
  const kept = {};
  for (const [key, value] of Object.entries(days)) {
    if (isPlayableDate(key, today, maxBack)) kept[key] = value;
  }
  return kept;
}

function hashString(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function mulberry32(seed) {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Whole days since 1970-01-01 for a YYYY-MM-DD key (UTC arithmetic, so clock changes don't matter).
export function dayNumber(key) {
  const [y, m, d] = key.split("-").map(Number);
  return Math.round(Date.UTC(y, m - 1, d) / 86400000);
}

// One fixed shuffle of the whole question bank, walked through 5 at a time: day N gets the next 5 after
// day N-1. So the same date gives every player the same 5 questions, and no question comes back until the
// whole bank has been used (256 questions = 51 days). Categories stay a natural random mix.
// Questions are ordered by id before shuffling, so the order doesn't depend on how the bank file is sorted.
export function pickDaily(questions, key, n = ROUNDS_PER_DAY) {
  const rand = mulberry32(hashString("geoculture:order"));
  const order = [...questions].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  for (let i = order.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [order[i], order[j]] = [order[j], order[i]];
  }
  const size = order.length;
  const start = (((dayNumber(key) * n) % size) + size) % size;
  return Array.from({ length: Math.min(n, size) }, (_, i) => order[(start + i) % size]);
}

// Streak rules: finishing a day's 5 rounds extends the streak if you also finished yesterday,
// otherwise it restarts at 1. Finishing the same day twice changes nothing.
export function nextStreak({ streak = 0, lastCompleted = null }, today) {
  if (lastCompleted === today) return { streak, lastCompleted };
  if (lastCompleted === previousDateKey(today)) {
    return { streak: streak + 1, lastCompleted: today };
  }
  return { streak: 1, lastCompleted: today };
}

// A streak that has already lapsed (last completion before yesterday) shows as 0.
export function currentStreak({ streak = 0, lastCompleted = null }, today) {
  if (!lastCompleted) return 0;
  if (lastCompleted === today || lastCompleted === previousDateKey(today)) return streak;
  return 0;
}

export function shareText(key, results) {
  const total = results.reduce((s, r) => s + r.points, 0);
  const squares = results
    .map((r) => (r.points >= 80 ? "🟩" : r.points >= 50 ? "🟨" : r.points >= 20 ? "🟧" : "🟥"))
    .join("");
  return `GeoCulture ${key}\n${squares} ${total}/${ROUNDS_PER_DAY * POINTS_PER_ROUND}`;
}

// ---------- map helpers (pure, no DOM) ----------
const toRad = (d) => (d * Math.PI) / 180;
const toDeg = (r) => (r * 180) / Math.PI;

// Points along the shortest route between two { lat, lng } coordinates, as [lng, lat] pairs.
// Longitudes are unwrapped so the line never jumps across the 180° meridian: a route from
// Amsterdam to Auckland continues past 180 (e.g. 190) instead of flipping to -170.
export function greatCircle(a, b, steps = 64) {
  const vec = (p) => [
    Math.cos(toRad(p.lat)) * Math.cos(toRad(p.lng)),
    Math.cos(toRad(p.lat)) * Math.sin(toRad(p.lng)),
    Math.sin(toRad(p.lat)),
  ];
  const [va, vb] = [vec(a), vec(b)];
  const dot = Math.min(1, Math.max(-1, va[0] * vb[0] + va[1] * vb[1] + va[2] * vb[2]));
  const omega = Math.acos(dot);
  const out = [];
  let prevLng = null;
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const sa = omega < 1e-9 ? 1 - t : Math.sin((1 - t) * omega) / Math.sin(omega);
    const sb = omega < 1e-9 ? t : Math.sin(t * omega) / Math.sin(omega);
    const x = sa * va[0] + sb * vb[0];
    const y = sa * va[1] + sb * vb[1];
    const z = sa * va[2] + sb * vb[2];
    let lng = toDeg(Math.atan2(y, x));
    if (prevLng !== null) {
      while (lng - prevLng > 180) lng -= 360;
      while (lng - prevLng < -180) lng += 360;
    }
    prevLng = lng;
    out.push([lng, toDeg(Math.atan2(z, Math.hypot(x, y)))]);
  }
  return out;
}

export function wrapLng(lng) {
  return ((((lng + 180) % 360) + 360) % 360) - 180;
}

// Map zoom at which `km` of ground spans about `pixels` on screen (web-mercator zoom, 512px tiles).
export function zoomForKm(km, latDeg, pixels, { min = 0.8, max = 14 } = {}) {
  const cos = Math.max(0.2, Math.cos(toRad(Math.abs(latDeg))));
  const z = Math.log2((pixels * 40075 * cos) / (Math.max(km, 1) * 512));
  return Math.min(max, Math.max(min, z));
}

// Zoom at which the whole globe fits in `pixels`.
export function globeZoom(pixels) {
  return Math.min(4, Math.max(0.5, Math.log2((pixels * Math.PI) / 512)));
}

// ---------- reveal animation helpers ----------
export function easeInOutCubic(t) {
  const x = Math.min(1, Math.max(0, t));
  return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2;
}

// The first `fraction` (0..1) of a line, ending exactly on that fraction of its length by point count.
// Returns [lng, lat] pairs, or null while there is not yet a visible segment.
export function partialLine(points, fraction) {
  const n = points.length - 1;
  if (n < 1) return null;
  const f = Math.min(1, Math.max(0, fraction));
  const x = f * n;
  const i = Math.min(n - 1, Math.floor(x));
  const frac = x - i;
  const out = points.slice(0, i + 1);
  const [a, b] = [points[i], points[i + 1]];
  out.push([a[0] + (b[0] - a[0]) * frac, a[1] + (b[1] - a[1]) * frac]);
  return out.length >= 2 && (x > 0) ? out : null;
}

// How long the line takes to grow: always a moment of suspense, a little longer for far misses.
export function revealDurationMs(km) {
  return Math.round(1500 + (Math.min(Math.max(km, 0), 10000) / 10000) * 1500);
}
