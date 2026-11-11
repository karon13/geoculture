import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { buildStyle } from "./mapStyle.js";
import { QUESTIONS } from "./questions.js";
import {
  ROUNDS_PER_DAY,
  POINTS_PER_ROUND,
  haversineKm,
  scoreForDistance,
  dateKey,
  pickDaily,
  nextStreak,
  currentStreak,
  shareText,
  greatCircle,
  wrapLng,
  zoomForKm,
  globeZoom,
} from "./game.js";

// Satellite globe with borders only (see mapStyle.js).
const STORAGE_KEY = "geoculture:v1";
const REDUCED_MOTION = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

// ---------- persistence (browser only, no backend) ----------
function loadStore() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY)) || {};
  } catch {
    return {};
  }
}

function saveStore(store) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
  } catch {
    /* private mode or full storage: the game still works, just without memory */
  }
}

const today = dateKey();
const store = loadStore();
store.streak = store.streak || { streak: 0, lastCompleted: null };
// Keep only today's progress; older days are not needed.
store.day = store.day && store.day.key === today ? store.day : { key: today, results: [] };
saveStore(store);

// Normally the day's 5 questions are fixed by the date. The test reset bumps `reroll`,
// which draws a fresh set so you can try more of the question bank.
function pickKey() {
  return store.day.reroll ? `${today}#${store.day.reroll}` : today;
}

let questions = pickDaily(QUESTIONS, pickKey());

// ---------- UI state ----------
let revealed = false; // whether the current round's answer is on screen

const panel = document.getElementById("panel");
const roundLabel = document.getElementById("round-label");
const scoreLabel = document.getElementById("score-label");
const streakLabel = document.getElementById("streak-label");

// ---------- map ----------
const map = new maplibregl.Map({
  container: "globe",
  style: buildStyle(),
  center: [10, 25],
  zoom: 1.6,
  minZoom: 0.5,
  maxZoom: 17,
  attributionControl: false,
  dragRotate: false, // north stays up; one finger or the mouse just spins the globe
  pitchWithRotate: false,
  renderWorldCopies: false,
});
map.touchZoomRotate.disableRotation();
// Lets automated tests move the camera: open the page with ?debug.
if (new URLSearchParams(location.search).has("debug")) window.__map = map;
map.touchPitch.disable();
// The imagery credit must stay visible (it is a licence condition).
map.addControl(new maplibregl.AttributionControl({ compact: true }), "top-left");

// The line between guess and answer. Kept as plain data so it can be (re)applied after the style loads.
let linkLine = null;
const EMPTY = { type: "FeatureCollection", features: [] };

map.on("style.load", () => {
  map.setProjection({ type: "globe" });
  map.addSource("link", { type: "geojson", data: linkLine || EMPTY, lineMetrics: true });
  map.addLayer({
    id: "link-casing",
    type: "line",
    source: "link",
    layout: { "line-cap": "round", "line-join": "round" },
    paint: { "line-color": "rgba(0,0,0,0.45)", "line-width": 7 },
  });
  map.addLayer({
    id: "link-line",
    type: "line",
    source: "link",
    layout: { "line-cap": "round", "line-join": "round" },
    paint: {
      "line-width": 3.5,
      "line-gradient": ["interpolate", ["linear"], ["line-progress"], 0, "#60a5fa", 1, "#4ade80"],
    },
  });
});

map.on("click", (e) => {
  // A click is the guess: it locks in immediately, no confirm step.
  if (revealed || isFinished()) return;
  const { lng, lat } = e.lngLat.wrap();
  lockIn({ lat, lng });
});

// Pins and the distance label are DOM markers. Pins on the far side of the globe fade out on their own.
let markers = [];

function makePinElement(color, label) {
  const el = document.createElement("div");
  el.className = "pin";
  el.style.setProperty("--pin", color);
  el.title = label || "";
  el.innerHTML = `
    <svg viewBox="0 0 30 38" width="30" height="38" aria-hidden="true">
      <path d="M15 1C7.3 1 1 7.2 1 14.9c0 10.4 14 22.1 14 22.1s14-11.7 14-22.1C29 7.2 22.7 1 15 1z"
            fill="var(--pin)" stroke="rgba(0,0,0,0.55)" stroke-width="1.5" stroke-linejoin="round"/>
      <circle cx="15" cy="15" r="5.2" fill="#fff"/>
    </svg>`;
  return el;
}

function showPins(pins) {
  clearPins();
  markers = pins.map((p) =>
    new maplibregl.Marker({ element: makePinElement(p.color, p.label), anchor: "bottom" })
      .setLngLat([p.lng, p.lat])
      .addTo(map)
  );
}

function clearPins() {
  markers.forEach((m) => m.remove());
  markers = [];
  setLink(null);
}

let labelMarker = null;

// Draws the line from the guess to the answer with the distance in the middle. null clears it.
function setLink(link) {
  if (labelMarker) {
    labelMarker.remove();
    labelMarker = null;
  }
  if (!link || link.km < 1) {
    linkLine = null;
  } else {
    const points = greatCircle(link.a, link.b);
    linkLine = { type: "Feature", properties: {}, geometry: { type: "LineString", coordinates: points } };
    const el = document.createElement("div");
    el.className = "dist-label";
    el.textContent = fmtKm(link.km);
    labelMarker = new maplibregl.Marker({ element: el, anchor: "center" })
      .setLngLat(points[Math.floor(points.length / 2)])
      .addTo(map);
  }
  const source = map.getSource("link");
  if (source) source.setData(linkLine || EMPTY);
}

// ---------- camera ----------
// The answer panel covers the bottom of the screen, so the map is centred in the space above it.
function framing() {
  const top = 56;
  const bottom = panel.getBoundingClientRect().height + 28;
  const width = window.innerWidth;
  const height = Math.max(160, window.innerHeight - top - bottom);
  return { padding: { top, bottom, left: 12, right: 12 }, width, height };
}

function moveCamera({ center, zoom, ms = 1200 }) {
  const f = framing();
  map.easeTo({
    center,
    zoom,
    padding: f.padding,
    duration: REDUCED_MOTION ? 0 : ms,
    essential: false,
  });
}

function overview() {
  const f = framing();
  moveCamera({ center: [10, 25], zoom: globeZoom(Math.min(f.width, f.height) * 0.92), ms: 900 });
}

function frameLink(a, b, km) {
  const f = framing();
  const points = greatCircle(a, b);
  const mid = points[Math.floor(points.length / 2)];
  const zoom = zoomForKm(km, mid[1], Math.min(f.width, f.height * 1.4) * 0.6);
  moveCamera({ center: [wrapLng(mid[0]), mid[1]], zoom });
}

window.addEventListener("resize", () => map.resize());

// ---------- helpers ----------
const esc = (s) =>
  String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

function isFinished() {
  return store.day.results.length >= ROUNDS_PER_DAY;
}

function totalPoints() {
  return store.day.results.reduce((s, r) => s + r.points, 0);
}

function fmtKm(km) {
  return km < 10 ? `${km.toFixed(1)} km` : `${Math.round(km).toLocaleString("en-US")} km`;
}

function updateHeader() {
  const done = store.day.results.length;
  roundLabel.textContent = isFinished() ? "Done for today" : `Round ${done + 1}/${ROUNDS_PER_DAY}`;
  scoreLabel.textContent = `${totalPoints()} pts`;
  const s = currentStreak(store.streak, today);
  streakLabel.textContent = `🔥 ${s}`;
}

// ---------- views ----------
function renderQuestion() {
  const q = questions[store.day.results.length];
  revealed = false;
  clearPins();
  updateHeader();
  panel.innerHTML = `
    <span class="chip ${q.category}">${esc(q.category)}</span>
    <p class="prompt">${esc(q.prompt)}</p>
    <p class="hint">Click anywhere on the globe to place your pin. Scroll or pinch to zoom in.</p>
  `;
  overview();
}

function lockIn(guess) {
  const index = store.day.results.length;
  const q = questions[index];
  const km = haversineKm(guess.lat, guess.lng, q.lat, q.lng);
  const points = scoreForDistance(km);
  store.day.results.push({
    id: q.id,
    guess: { lat: guess.lat, lng: guess.lng },
    km,
    points,
  });
  saveStore(store);
  revealed = true;
  updateHeader();

  showPins([
    { lat: guess.lat, lng: guess.lng, color: "#60a5fa", label: "Your guess" },
    { lat: q.lat, lng: q.lng, color: "#4ade80", label: q.place },
  ]);
  setLink({ a: guess, b: q, km });

  const last = isFinished();
  panel.innerHTML = `
    <div class="result-head">
      <span class="pts">+${points}</span>
      <span class="dist">${fmtKm(km)} away</span>
    </div>
    <p class="reveal-title">${esc(q.title)}</p>
    <p class="reveal-place">📍 ${esc(q.place)}</p>
    <p class="story">${esc(q.story)}</p>
    ${q.source ? `<p class="source"><a href="${esc(q.source)}" target="_blank" rel="noopener noreferrer">Source</a></p>` : ""}
    <button id="next">${last ? "See your daily score" : "Next round"}</button>
  `;
  frameLink(guess, q, km);
  document.getElementById("next").addEventListener("click", () => {
    if (last) completeDay();
    else renderQuestion();
  });
}

function completeDay() {
  // Streak is extended once, when the fifth round is finished.
  store.streak = nextStreak(store.streak, today);
  saveStore(store);
  renderFinal();
}

function renderFinal() {
  revealed = true;
  updateHeader();
  const results = store.day.results;
  const pins = [];
  results.forEach((r, i) => {
    const q = questions[i];
    pins.push({ lat: q.lat, lng: q.lng, color: "#4ade80", label: q.place });
    pins.push({ lat: r.guess.lat, lng: r.guess.lng, color: "#60a5fa", label: "Your guess" });
  });
  showPins(pins);

  const total = totalPoints();
  const squares = shareText(today, results).split("\n")[1].split(" ")[0];
  const streak = currentStreak(store.streak, today);
  panel.innerHTML = `
    <div class="final">
      <h2>Today's score</h2>
      <p class="total">${total} / ${ROUNDS_PER_DAY * POINTS_PER_ROUND}</p>
      <p class="squares">${squares}</p>
      <p class="hint">Tap a round to fly to its location.</p>
      <ul>
        ${results
          .map(
            (r, i) =>
              `<li><button class="row" data-i="${i}"><span>${i + 1}. ${esc(questions[i].title)}</span><span>${r.points} pts · ${fmtKm(r.km)}</span></button></li>`
          )
          .join("")}
      </ul>
      <button id="share">Share result</button>
      <p class="note">Streak: 🔥 ${streak} day${streak === 1 ? "" : "s"}. Come back tomorrow for 5 new places.</p>
    </div>
  `;
  overview();

  // Tapping a round turns the globe to its real location and draws that round's line.
  panel.querySelectorAll(".row").forEach((btn) => {
    btn.addEventListener("click", () => {
      const i = Number(btn.dataset.i);
      const q = questions[i];
      const r = results[i];
      panel.querySelectorAll(".row").forEach((b) => b.classList.toggle("active", b === btn));
      setLink({ a: r.guess, b: q, km: r.km });
      // Centre on the real place at city scale, so the surroundings are visible.
      moveCamera({ center: [q.lng, q.lat], zoom: r.km < 300 ? zoomForKm(r.km, q.lat, 500) : 6, ms: 1400 });
    });
  });

  document.getElementById("share").addEventListener("click", async (e) => {
    const text = shareText(today, results);
    try {
      if (navigator.share) await navigator.share({ text });
      else await navigator.clipboard.writeText(text);
      e.target.textContent = navigator.share ? "Shared" : "Copied to clipboard";
    } catch {
      window.prompt("Copy your result:", text);
    }
  });
}

// ---------- test reset ----------
// Clears today's rounds and draws 5 new questions. The streak is left as it is.
document.getElementById("reset").addEventListener("click", () => {
  store.day = { key: today, results: [], reroll: (store.day.reroll || 0) + 1 };
  saveStore(store);
  questions = pickDaily(QUESTIONS, pickKey());
  renderQuestion();
});

// ---------- start ----------
// completeDay is idempotent, so a reload after round 5 still counts the streak.
if (isFinished()) completeDay();
else renderQuestion();
