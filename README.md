# GeoCulture

A daily game: five prompts from art, music, books and movies, and you pin each one on a globe.
100 points per round, 500 per day. The streak is stored in the browser.

## Run it

    npm install
    npm run dev          # http://localhost:5173
    npm test             # scoring, daily pick, streak and map maths
    npm run build        # static site in dist/

Needs Node.js 18 or newer and an internet connection (satellite tiles load from Esri).

## Questions

`data/questions.csv` is the source of truth. After editing it run:

    python3 scripts/build-questions.py

which regenerates `src/questions.js`.

## Map

Two base maps can be compared while testing: **satellite** (Esri imagery, the default) and **vector** (a plain
land and water map from OpenFreeMap's free vector tiles with built-up areas, roads, runways and buildings, but no text). Switch with the
hamburger menu ("Switch to vector map"), or open the page with `?map=vector` / `?map=satellite`. The choice is
remembered in the browser. Both draw the same country and US state borders on top.

MapLibre GL JS on a 3D globe: satellite imagery with country borders and US state borders on top.
There are no labels, roads or place names.

- Imagery: Esri World Imagery tiles (no key). Check Esri's terms before a commercial launch. To use another
  satellite source (MapTiler, Mapbox, Sentinel-2) set `VITE_IMAGERY_URL` (an XYZ URL with `{z}/{x}/{y}`) and
  `VITE_IMAGERY_ATTRIBUTION` when building. Keep the credit visible, it is a licence condition.
- Borders: Natural Earth (countries) and US Census (states), built into `public/borders-*.json` by
  `node scripts/build-borders.mjs`. They carry no names. Only shared borders are drawn, not coastlines.
- Styling lives in `src/mapStyle.js`.
- Open the page with `?debug` to expose the map as `window.__map` for tests.

## Deploy

`npm run build` produces a plain static site in `dist/` that works from any folder or sub-path.
Upload the folder to Netlify (drag and drop at app.netlify.com/drop), Vercel, Cloudflare Pages or GitHub Pages.

## Test reset

The "Reset" button in the top bar clears today's rounds and draws five new questions. Remove the
button in `index.html` and the handler at the bottom of `src/main.js` before launch.
