import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { buildStyle, loadStyle } from "./mapStyle.js";
import { QUESTIONS } from "./questions.js";
import {
  ROUNDS_PER_DAY,
  POINTS_PER_ROUND,
  haversineKm,
  scoreForDistance,
  dateKey,
  addDays,
  playableDates,
  isPlayableDate,
  pruneDays,
  pickDaily,
  nextStreak,
  currentStreak,
  shareText,
  greatCircle,
  wrapLng,
  zoomForKm,
  globeZoom,
  easeInOutCubic,
  partialLine,
  revealDurationMs,
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

// Progress is kept per date: store.days["2026-11-11"] = { results: [...] }.
// Version 2 changed how a date's questions are chosen (no repeats across days), so days saved before
// that are dropped; the streak is kept.
const STORE_VERSION = 2;
if (store.v !== STORE_VERSION) {
  store.days = {};
  delete store.day;
  store.v = STORE_VERSION;
}
store.days = store.days || {};
// Only today and the last 28 days can be opened, so anything older (or in the future) is dropped.
store.days = pruneDays(store.days, today);
store.days[today] = store.days[today] || { results: [] };
saveStore(store);

// The day on screen. Only today counts toward the streak; past days are for catching up.
let viewKey = today;
const isToday = () => viewKey === today;
const dayState = () => store.days[viewKey];
const results = () => dayState().results;

const QUESTION_BY_ID = new Map(QUESTIONS.map((q) => [q.id, q]));

function questionsForView() {
  // Rounds already played keep their question even if the question bank has changed since.
  return pickDaily(QUESTIONS, viewKey).map((q, i) => {
    const played = results()[i];
    return (played && QUESTION_BY_ID.get(played.id)) || q;
  });
}

let questions = questionsForView();

// ---------- UI state ----------
let revealed = false; // whether the current round has been locked in (answer on screen or on its way)
let finalShown = false; // whether the end-of-day summary is showing
let guess = null; // { lat, lng } the player has pinned but not yet locked in
let guessMarker = null;
let animId = 0; // bumped to cancel a line animation that is still running

const panel = document.getElementById("panel");
const roundLabel = document.getElementById("round-label");
const scoreLabel = document.getElementById("score-label");
const streakLabel = document.getElementById("streak-label");
const topbar = document.querySelector(".topbar");
const menuBtn = document.getElementById("menu-btn");
const menuEl = document.getElementById("menu");
const historyEl = document.getElementById("history");
const historyList = document.getElementById("history-list");

// The top bar can change height (fonts, wrapping on narrow screens), so it is measured instead of assumed.
// The map credit and the camera framing both sit below it.
function measureTopbar() {
  document.documentElement.style.setProperty("--topbar-h", `${Math.round(topbar.getBoundingClientRect().height)}px`);
}
measureTopbar();

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
// The map credit (OpenStreetMap, OpenMapTiles) must stay visible, it is a licence condition.
map.addControl(new maplibregl.AttributionControl({ compact: true }), "top-left");
// The credit starts closed, as a small (i) button; tapping it opens the full text.
function closeAttribution() {
  const attrib = document.querySelector("#globe .maplibregl-ctrl-attrib");
  if (attrib) {
    attrib.classList.remove("maplibregl-compact-show");
    attrib.removeAttribute("open");
  }
}
closeAttribution();
map.once("load", closeAttribution);

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

// A click places (or moves) the pin; the player confirms with the "Lock in guess" button.
map.on("click", (e) => {
  // A click that closes the menu is only that: it must not also drop a pin.
  if (menuOpen()) return closeMenu();
  if (revealed || isFinished()) return;
  const { lng, lat } = e.lngLat.wrap();
  placeGuess({ lat, lng });
});

function placeGuess(pick) {
  guess = pick;
  if (guessMarker) {
    guessMarker.setLngLat([pick.lng, pick.lat]);
  } else {
    // Clicks pass through the pin to the globe, so tapping near it simply moves it.
    guessMarker = new maplibregl.Marker({ element: makePinElement("#60a5fa", "Your guess", "provisional"), anchor: "bottom" })
      .setLngLat([pick.lng, pick.lat])
      .addTo(map);
    markers.push(guessMarker);
  }
  const lock = document.getElementById("lock");
  if (lock) lock.disabled = false;
}

// Pins and the distance label are DOM markers. Pins on the far side of the globe fade out on their own.
let markers = [];

function makePinElement(color, label, extraClass = "") {
  const el = document.createElement("div");
  el.className = `pin ${extraClass}`.trim();
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
  animId++; // stops a line that is still growing
  markers.forEach((m) => m.remove());
  markers = [];
  guessMarker = null;
  guess = null;
  setLink(null);
}

let labelMarker = null;

function drawLine(points) {
  linkLine = points ? { type: "Feature", properties: {}, geometry: { type: "LineString", coordinates: points } } : null;
  const source = map.getSource("link");
  if (source) source.setData(linkLine || EMPTY);
}

function setLabel(points, km) {
  if (labelMarker) {
    labelMarker.remove();
    labelMarker = null;
  }
  if (!points || km < 1) return;
  const el = document.createElement("div");
  el.className = "dist-label";
  el.dataset.km = km;
  el.textContent = fmtKm(km);
  labelMarker = new maplibregl.Marker({ element: el, anchor: "center" })
    .setLngLat(points[Math.floor(points.length / 2)])
    .addTo(map);
}

// Draws the whole line from the guess to the answer with the distance in the middle. null clears it.
function setLink(link) {
  const points = link && link.km >= 1 ? greatCircle(link.a, link.b) : null;
  drawLine(points);
  setLabel(points, link ? link.km : 0);
}

// The line grows from the guess toward the real location, then `done` runs (answer pin, distance, result).
// Reduced-motion players get the finished line straight away.
function animateLink(link, done) {
  const id = ++animId;
  const points = link.km >= 1 ? greatCircle(link.a, link.b, 128) : null;
  const duration = points && !REDUCED_MOTION ? revealDurationMs(link.km) : 0;
  const finish = () => {
    if (id !== animId) return;
    drawLine(points);
    setLabel(points, link.km);
    done();
  };
  if (!duration) return finish();

  const start = performance.now();
  const step = (now) => {
    if (id !== animId) return; // cancelled by reset or a new round
    const t = Math.min(1, (now - start) / duration);
    if (t >= 1) return finish();
    drawLine(partialLine(points, easeInOutCubic(t)));
    requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

// ---------- camera ----------
// The answer panel covers the bottom of the screen, so the map is centred in the space above it.
function framing() {
  const top = Math.round(topbar.getBoundingClientRect().height);
  const bottom = panel.getBoundingClientRect().height + 28;
  const width = window.innerWidth;
  const height = Math.max(160, window.innerHeight - top - bottom);
  return { padding: { top, bottom, left: 12, right: 12 }, width, height };
}

// `fly` makes a gentle trip instead of a straight slide: the globe zooms out, turns, then zooms back in.
// The farther it has to go, the longer it takes, so short hops stay calm and long ones don't whip around.
function moveCamera({ center, zoom, ms = 1200, fly = false }) {
  const f = framing();
  if (fly) {
    const from = map.getCenter();
    const km = haversineKm(from.lat, from.lng, center[1], center[0]);
    map.flyTo({
      center,
      zoom,
      padding: f.padding,
      duration: REDUCED_MOTION ? 0 : Math.round(2200 + (Math.min(km, 12000) / 12000) * 1800),
      curve: 1.2, // lower = less zooming out on the way
      essential: false,
    });
    return;
  }
  map.easeTo({
    center,
    zoom,
    padding: f.padding,
    duration: REDUCED_MOTION ? 0 : ms,
    essential: false,
  });
}

function overview({ fly = false } = {}) {
  const f = framing();
  moveCamera({ center: [10, 25], zoom: globeZoom(Math.min(f.width, f.height) * 0.92), ms: 900, fly });
}

function frameLink(a, b, km) {
  const f = framing();
  const points = greatCircle(a, b);
  const mid = points[Math.floor(points.length / 2)];
  const zoom = zoomForKm(km, mid[1], Math.min(f.width, f.height * 1.4) * 0.6);
  moveCamera({ center: [wrapLng(mid[0]), mid[1]], zoom });
}

window.addEventListener("resize", () => {
  measureTopbar();
  map.resize();
});

// ---------- helpers ----------
const esc = (s) =>
  String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

function isFinished() {
  return results().length >= ROUNDS_PER_DAY;
}

const sumPoints = (list) => list.reduce((s, r) => s + r.points, 0);

function totalPoints() {
  return sumPoints(results());
}

// Distances are scored in km; only the display unit changes. The unit follows the browser's language
// (miles for en-US, en-GB and en-LR) until the player picks one in the menu.
const MILE_REGIONS = ["US", "GB", "LR"];
function detectUnit() {
  try {
    const langs = navigator.languages && navigator.languages.length ? navigator.languages : [navigator.language];
    const region = new Intl.Locale(langs[0]).maximize().region;
    return MILE_REGIONS.includes(region) ? "mi" : "km";
  } catch {
    return "km";
  }
}
let unit = store.unit === "mi" || store.unit === "km" ? store.unit : detectUnit();

function fmtKm(km) {
  const v = unit === "mi" ? km * 0.621371 : km;
  return v < 10 ? `${v.toFixed(1)} ${unit}` : `${Math.round(v).toLocaleString("en-US")} ${unit}`;
}

// Distances already on screen carry their km value so a unit switch can redraw them in place.
function updateDistances() {
  document.querySelectorAll("[data-km]").forEach((el) => {
    el.textContent = fmtKm(Number(el.dataset.km)) + (el.dataset.suffix || "");
  });
}

// "Mon 9 Nov" from a YYYY-MM-DD key, in the player's own calendar.
function fmtDay(key, options = { weekday: "short", day: "numeric", month: "short" }) {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("en-US", options);
}

function updateHeader() {
  const done = results().length;
  // While an answer is on screen we are still in that round; the counter moves on with "Next round".
  const inRound = revealed && !finalShown;
  const round = inRound ? done : done + 1;
  roundLabel.textContent = finalShown || (isFinished() && !inRound)
    ? (isToday() ? "Done for today" : "Day complete")
    : `Round ${Math.min(Math.max(round, 1), ROUNDS_PER_DAY)}/${ROUNDS_PER_DAY}`;
  scoreLabel.textContent = `${totalPoints()} pts`;
  // The streak is about today's habit, so it shows the same on every day.
  const s = currentStreak(store.streak, today);
  streakLabel.textContent = `🔥 ${s}`;
}

// ---------- menu and previous results ----------
// The menu lives in the top bar. "Previous results" opens a list of today and the days before it,
// newest first. There is nothing after today, so you can't go forward in time.
const DAY_KEYS = playableDates(today).reverse();

function dayStatus(key) {
  const list = store.days[key] ? store.days[key].results : [];
  if (list.length >= ROUNDS_PER_DAY) return { kind: "done", text: `${sumPoints(list)} / ${ROUNDS_PER_DAY * POINTS_PER_ROUND}`, spoken: `${sumPoints(list)} points` };
  if (list.length > 0) return { kind: "partial", text: `${list.length}/${ROUNDS_PER_DAY} played`, spoken: `${list.length} of ${ROUNDS_PER_DAY} rounds played` };
  return { kind: "new", text: "Play", spoken: "not played yet" };
}

const menuOpen = () => !menuEl.hidden;

function openMenu() {
  // While a guess is being revealed the story panel is not on screen yet; the menu waits for it.
  if (panel.classList.contains("pending")) return;
  menuEl.hidden = false;
  menuBtn.setAttribute("aria-expanded", "true");
}

function closeMenu() {
  menuEl.hidden = true;
  menuBtn.setAttribute("aria-expanded", "false");
}

const historyOpen = () => !historyEl.hidden;

function openHistory() {
  closeMenu();
  historyList.innerHTML = DAY_KEYS.map((key) => {
    const status = dayStatus(key);
    const long = fmtDay(key, { weekday: "long", day: "numeric", month: "long" });
    const when = key === today ? "Today" : key === addDays(today, -1) ? "Yesterday" : fmtDay(key, { weekday: "long" });
    return `<li><button type="button" class="${status.kind}${key === viewKey ? " current" : ""}" data-key="${key}"
        aria-label="${esc(long)}${key === today ? ", today" : ""}, ${status.spoken}">
      <span class="h-day">${esc(when)}<small>${esc(fmtDay(key, { day: "numeric", month: "long" }))}</small></span>
      <span class="h-state">${esc(status.text)}</span>
    </button></li>`;
  }).join("");
  historyEl.hidden = false;
  document.getElementById("history-close").focus();
}

function closeHistory() {
  historyEl.hidden = true;
  menuBtn.focus();
}

menuBtn.addEventListener("click", () => (menuOpen() ? closeMenu() : openMenu()));
document.getElementById("menu-history").addEventListener("click", openHistory);

// Distance unit: a two-way switch (km | mi) in the menu.
const unitButtons = [...document.querySelectorAll("#menu-unit button")];
function updateUnitToggle() {
  for (const b of unitButtons) b.setAttribute("aria-pressed", String(b.dataset.unit === unit));
}
updateUnitToggle();
for (const b of unitButtons) {
  b.addEventListener("click", () => {
    if (b.dataset.unit === unit) return;
    unit = b.dataset.unit;
    store.unit = unit;
    saveStore(store);
    updateUnitToggle();
    updateDistances();
  });
}

// The map is OpenFreeMap's Liberty style, which has to be downloaded first. The globe starts on a plain dark
// placeholder and the style is swapped in when it arrives (one retry after a short wait). If it still fails
// (offline, OpenFreeMap down) a message says so. diff:false rebuilds the style from scratch, which re-runs the
// "style.load" setup (globe, line layers).
async function loadMap() {
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      map.setStyle(await loadStyle(), { diff: false });
      document.getElementById("map-error").hidden = true;
      return;
    } catch (err) {
      console.warn("Could not load the map style", err);
      if (attempt === 0) await new Promise((resolve) => setTimeout(resolve, 2000));
    }
  }
  document.getElementById("map-error").hidden = false;
}
loadMap();

// How to play / about sheet.
const aboutEl = document.getElementById("about");
const aboutOpen = () => !aboutEl.hidden;
function openAbout() {
  closeMenu();
  aboutEl.hidden = false;
  aboutEl.querySelector(".about-body").scrollTop = 0;
  document.getElementById("about-close").focus();
}
function closeAbout() {
  aboutEl.hidden = true;
  menuBtn.focus();
}
document.getElementById("menu-about").addEventListener("click", openAbout);
document.getElementById("about-close").addEventListener("click", closeAbout);
aboutEl.addEventListener("click", (e) => {
  if (e.target === aboutEl) closeAbout();
});
document.getElementById("history-close").addEventListener("click", closeHistory);
// Tapping the dimmed area around the list closes it too.
historyEl.addEventListener("click", (e) => {
  if (e.target === historyEl) closeHistory();
});
historyList.addEventListener("click", (e) => {
  const row = e.target.closest("button[data-key]");
  if (!row) return;
  historyEl.hidden = true;
  openDay(row.dataset.key);
});
document.addEventListener("keydown", (e) => {
  if (e.key !== "Escape") return;
  if (aboutOpen()) closeAbout();
  else if (historyOpen()) closeHistory();
  else if (menuOpen()) closeMenu();
});
// Tapping elsewhere in the top bar or the panel also dismisses the menu. A tap on the globe is handled
// by the map's click handler, which closes the menu without placing a pin.
document.addEventListener("click", (e) => {
  if (!menuOpen() || menuEl.contains(e.target) || menuBtn.contains(e.target)) return;
  if (!e.target.closest("#globe")) closeMenu();
});

// Switches the screen to another day: its results if it is finished, otherwise where you left off.
function openDay(key) {
  if (!isPlayableDate(key, today) || key === viewKey) return;
  viewKey = key;
  store.days[viewKey] = store.days[viewKey] || { results: [] };
  questions = questionsForView();
  showDay();
}

function showDay() {
  if (isFinished()) completeDay();
  else renderQuestion();
}

// ---------- views ----------
function renderQuestion() {
  const q = questions[results().length];
  revealed = false;
  finalShown = false;
  clearPins();
  updateHeader();
  panel.innerHTML = `
    ${isToday() ? "" : `<p class="past-note">📅 ${esc(fmtDay(viewKey))}</p>`}
    <span class="chip ${q.category}">${esc(q.category)}</span>
    <p class="prompt">${esc(q.prompt)}</p>
    <p class="hint">Click the globe to place your pin (click again to move it). Scroll or pinch to zoom in.</p>
    <button id="lock" disabled>Lock in guess</button>
  `;
  panel.classList.remove("pending", "detail-mode", "final-mode");
  document.getElementById("lock").addEventListener("click", () => {
    if (guess) lockIn(guess);
  });
  overview();
}

function lockIn(pick) {
  if (revealed) return;
  const index = results().length;
  const q = questions[index];
  const km = haversineKm(pick.lat, pick.lng, q.lat, q.lng);
  const points = scoreForDistance(km);
  results().push({
    id: q.id,
    guess: { lat: pick.lat, lng: pick.lng },
    km,
    points,
  });
  saveStore(store);
  revealed = true;
  if (guessMarker) guessMarker.getElement().classList.remove("provisional");

  // The result panel is built now so the camera can frame the space above it, but it stays hidden
  // until the line has reached the real location.
  const last = isFinished();
  panel.classList.add("pending");
  panel.innerHTML = `
    <div class="result-head">
      <span class="pts">+${points}</span>
      <span class="dist" data-km="${km}" data-suffix=" away">${fmtKm(km)} away</span>
    </div>
    <p class="reveal-title">${esc(q.title)}</p>
    <p class="reveal-place">📍 ${esc(q.place)}</p>
    <p class="story">${esc(q.story)}</p>
    ${q.source ? `<p class="source"><a href="${esc(q.source)}" target="_blank" rel="noopener noreferrer">Source</a></p>` : ""}
    <button id="next">${last ? "See your daily score" : "Next round"}</button>
  `;
  document.getElementById("next").addEventListener("click", () => {
    if (last) completeDay();
    else renderQuestion();
  });

  frameLink(pick, q, km);
  animateLink({ a: pick, b: q, km }, () => {
    // The line has arrived: drop the answer pin, then show the score and the story.
    const answer = new maplibregl.Marker({ element: makePinElement("#4ade80", q.place), anchor: "bottom" })
      .setLngLat([q.lng, q.lat])
      .addTo(map);
    markers.push(answer);
    updateHeader();
    panel.classList.remove("pending");
  });
}

function completeDay() {
  // Streak is extended once, when the fifth round of *today* is finished.
  // Catching up on a past day never touches it.
  if (isToday()) {
    store.streak = nextStreak(store.streak, today);
    saveStore(store);
  }
  renderFinal();
}

function renderFinal() {
  revealed = true;
  finalShown = true;
  updateHeader();
  const dayResults = results();
  const pins = [];
  dayResults.forEach((r, i) => {
    const q = questions[i];
    pins.push({ lat: q.lat, lng: q.lng, color: "#4ade80", label: q.place });
    pins.push({ lat: r.guess.lat, lng: r.guess.lng, color: "#60a5fa", label: "Your guess" });
  });
  showPins(pins);
  panel.classList.remove("pending", "detail-mode");
  panel.classList.add("final-mode");

  const total = totalPoints();
  const squares = shareText(viewKey, dayResults).split("\n")[1].split(" ")[0];
  const streak = currentStreak(store.streak, today);
  const last = dayResults.length - 1;
  const streakNote = isToday()
    ? `Streak: 🔥 ${streak} day${streak === 1 ? "" : "s"}. Come back tomorrow for 5 new places.`
    : "";
  panel.innerHTML = `
    <div class="final">
      <div class="final-body">
      <div class="summary">
        <div class="summary-main">
          <h2>${isToday() ? "Today's score" : `${esc(fmtDay(viewKey))} · score`}</h2>
          <p class="total">${total} / ${ROUNDS_PER_DAY * POINTS_PER_ROUND}</p>
        </div>
        <p class="squares">${squares}</p>
      </div>
      <p class="hint">Tap a round to read its story and fly to the place.</p>
      <ul>
        ${dayResults
          .map((r, i) => {
            const q = questions[i];
            return `<li>
              <button class="row" data-i="${i}" aria-expanded="false"><span class="row-title">${i + 1}. ${esc(q.title)}</span><span class="chip ${q.category}">${esc(q.category)}</span><span>${r.points} pts · <span data-km="${r.km}">${fmtKm(r.km)}</span></span></button>
              <div class="detail" hidden>
                <div class="detail-nav">
                  <button type="button" class="nav-btn" data-go="close">‹ All rounds</button>
                  <span class="pager">
                    <button type="button" class="nav-btn" data-go="${i - 1}" aria-label="Previous round" ${i === 0 ? "disabled" : ""}>←</button>
                    <button type="button" class="nav-btn" data-go="${i + 1}" aria-label="Next round" ${i === last ? "disabled" : ""}>→</button>
                  </span>
                </div>
                <p class="reveal-place">📍 ${esc(q.place)}</p>
                <p class="story">${esc(q.story)}</p>
                ${q.source ? `<p class="source"><a href="${esc(q.source)}" target="_blank" rel="noopener noreferrer">Source</a></p>` : ""}
              </div>
            </li>`;
          })
          .join("")}
      </ul>
      </div>
      <div class="final-footer">
        <button id="share">Share result</button>
        ${streakNote ? `<p class="note">${streakNote}</p>` : ""}
      </div>
    </div>
  `;
  overview();

  // Opens one round (or none): shows its story, turns the globe to the real place and draws its line.
  // On phones an open round hides the score summary and the other rounds (see .detail-mode in the CSS)
  // so the card stays small and the map stays visible.
  const finalEl = panel.querySelector(".final");
  let openIndex = null;
  function setOpen(i) {
    openIndex = i;
    panel.querySelectorAll(".row").forEach((b) => {
      const open = Number(b.dataset.i) === i;
      b.setAttribute("aria-expanded", String(open));
      b.classList.toggle("active", open);
      b.nextElementSibling.hidden = !open;
      b.closest("li").classList.toggle("open", open);
    });
    finalEl.classList.toggle("has-open", i !== null);
    panel.classList.toggle("detail-mode", i !== null);
    finalEl.querySelector(".final-body").scrollTop = 0;
    if (i === null) {
      // Back to the overview with every pin and no line.
      setLink(null);
      overview({ fly: true });
      return;
    }
    const q = questions[i];
    const r = dayResults[i];
    setLink({ a: r.guess, b: q, km: r.km });
    // The panel has changed size, so the camera is placed after that (it reads the panel's height).
    moveCamera({ center: [q.lng, q.lat], zoom: r.km < 300 ? zoomForKm(r.km, q.lat, 500) : 6, fly: true });
  }

  panel.querySelectorAll(".row").forEach((btn) => {
    btn.addEventListener("click", () => {
      const i = Number(btn.dataset.i);
      setOpen(openIndex === i ? null : i);
    });
  });
  panel.querySelectorAll("[data-go]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const go = btn.dataset.go;
      setOpen(go === "close" ? null : Number(go));
    });
  });

  document.getElementById("share").addEventListener("click", async (e) => {
    const text = shareText(viewKey, dayResults);
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
// Wipes everything this game saved in the browser (every day's results and the streak) and reloads,
// so the page starts as it does on a first visit. Only this game's key is removed: on GitHub Pages other
// projects of the same account share this origin's storage.
document.getElementById("reset").addEventListener("click", () => {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* storage unavailable: nothing was saved anyway */
  }
  location.reload();
});

// ---------- start ----------
// Left open past midnight, the page would still think it is yesterday: start over on the new date.
document.addEventListener("visibilitychange", () => {
  if (!document.hidden && dateKey() !== today) location.reload();
});

// Web fonts can change the top bar's height after the first measurement, so measure again.
if (document.fonts && document.fonts.ready) document.fonts.ready.then(measureTopbar);
// completeDay is idempotent, so a reload after round 5 still counts the streak.
showDay();
