# GeoCulture

A daily game: five prompts from art, music, books and movies, and you pin each one on a globe.
100 points per round, 500 per day. The streak is stored in the browser.

## Run it

    npm install
    npm run dev          # http://localhost:5173
    npm test             # scoring, daily pick, streak and map maths
    npm run build        # static site in dist/

Needs Node.js 18 or newer and an internet connection (map tiles load from OpenFreeMap).

## Questions

`data/questions.csv` is the source of truth. After editing it run:

    python3 scripts/build-questions.py

which regenerates `src/questions.js`.

## Map

MapLibre GL JS (globe projection) with vector tiles from OpenFreeMap, no API key.
Change the look with a different style, for example at build time:

    VITE_MAP_STYLE=https://tiles.openfreemap.org/styles/positron npm run build

OpenFreeMap styles: liberty (default), bright, positron. The OpenStreetMap / OpenFreeMap credit in the
corner of the map is a licence condition, so keep it visible.

## Deploy

`npm run build` produces a plain static site in `dist/` that works from any folder or sub-path.
Upload the folder to Netlify (drag and drop at app.netlify.com/drop), Vercel, Cloudflare Pages or GitHub Pages.

## Test reset

The "Reset" button in the top bar clears today's rounds and draws five new questions. Remove the
button in `index.html` and the handler at the bottom of `src/main.js` before launch.
