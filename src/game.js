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

// 100 points for a guess within 25 km, then exponential falloff.
// ~1,000 km away is about 57 points, ~5,000 km about 7 points.
export function scoreForDistance(km) {
  const effective = Math.max(0, km - 25);
  return Math.round(POINTS_PER_ROUND * Math.exp(-effective / 1800));
}

// Local calendar date as YYYY-MM-DD, so "daily" follows the player's own midnight.
export function dateKey(date = new Date()) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function previousDateKey(key) {
  const [y, m, d] = key.split("-").map(Number);
  return dateKey(new Date(y, m - 1, d - 1));
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

// Same date => same 5 questions for every player. Categories are a natural random mix.
export function pickDaily(questions, key, n = ROUNDS_PER_DAY) {
  const rand = mulberry32(hashString(`geoculture:${key}`));
  const pool = [...questions];
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  return pool.slice(0, n);
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
