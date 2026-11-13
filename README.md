# GeoCulture

A daily game: five prompts from art, music, books and movies, and you pin each one on a globe.
100 points per round, 500 per day. The streak is stored in the browser.

## Run it

    npm install
    npm run dev          # http://localhost:5173
    npm test             # scoring, daily pick, streak and map maths
    npm run build        # static site in dist/

Needs Node.js 18 or newer and an internet connection (the map style and tiles load from OpenFreeMap).

## Questions

`data/questions.csv` is the source of truth. After editing it run:

    python3 scripts/build-questions.py

which regenerates `src/questions.js`.

## Map

MapLibre GL JS on a 3D globe, using OpenFreeMap's **Liberty** style. It is free, needs no key and allows
commercial use (see its terms at openfreemap.org/tos). The style is downloaded when the page opens and then
changed in code (`src/libertyStyle.js`, applied in `src/mapStyle.js`):

1. `stripText` removes every text and icon layer (place, street and country names, shields, points of
   interest, house numbers), so nothing is labelled. Liberty's own border lines stay.
2. `deepSea` paints the sea and rivers a deeper blue, re-tones the land (darker, more contrast, greens pulled
   toward olive) and darkens the low-zoom image layer to match. Roads, buildings and borders keep Liberty's colours.

If the style can't be downloaded the page retries once and then shows a "map could not be loaded" message.
The map credit (the small (i), OpenStreetMap and OpenMapTiles) must stay visible; it is a licence condition.

### Changing the colours

Everything is in the "the game's colours" section of `src/libertyStyle.js`. Edit, save, and the dev server
(`npm run dev`) reloads. Refresh the page after each change.

| What                                | Where                | Notes                                                                    |
| ----------------------------------- | -------------------- | ------------------------------------------------------------------------ |
| Sea and rivers                      | `SEA`                | Any hex colour. Lower lightness is deeper, e.g. `#1f5a94`.               |
| How dark the land is                | `LAND.darken`        | 1 = as Liberty, lower is darker (0.78 now).                              |
| Contrast between light and dark land| `LAND.contrast`      | 1 = unchanged, higher pushes light and dark areas apart (1.5 now).       |
| Where "mid" is for the contrast     | `LAND.pivot`         | Lightness (0 to 1) that stays put when contrast changes.                 |
| Greens' hue                         | `LAND.greenHue`      | Degrees on the colour wheel: 60 yellow-olive, 90 olive, 120 pure green.  |
| How far greens move to that hue     | `LAND.greenPull`     | 0 = keep Liberty's greens, 1 = fully `greenHue`.                         |
| How colourful greens are            | `LAND.greenSat`      | 1 = as Liberty, lower is more muted.                                     |
| Zoomed-out world picture            | `RASTER`             | Brightness, contrast and saturation of Liberty's low-zoom image.         |

Notes:
- The zoomed-out picture is an image, so `RASTER` darkens the sea in it too. If the sea looks different
  zoomed out than zoomed in, adjust `RASTER["raster-brightness-max"]` (higher = brighter).
- Which layers count as land is the `LAND_LAYERS` set (forest, grass, farmland, parks...). To also re-colour
  something else, such as roads or buildings, add a branch in `deepSea` that runs `mapColors(value, earthTone)`
  on its paint colours, the same way land fills are handled.
- For free-form editing, open Liberty in Maputnik (maputnik.github.io), change colours visually and export the
  JSON. That file can replace the downloaded style: save it as `public/liberty.json`, fetch it in `loadStyle`
  instead of `LIBERTY_STYLE_URL` and keep the `stripText` call so no text comes back.
- `npm test` covers the colour maths (`test/liberty.test.js`).

### Satellite imagery (Esri): good option, licensing issue

An earlier version used Esri World Imagery photos with our own country and US state borders on top. It looks
great and is sharp down to street level, but it was removed because of licensing:

- It used Esri's keyless tile address. Esri's terms say apps that earn revenue need an authenticated
  (keyed) account, so a site with ads or other income should not use it. The keyless address can also be
  limited or changed by Esri without notice.
- A keyed ArcGIS account has a free monthly allowance (about 2 million tiles a month at the time of writing)
  and pay-as-you-go is off by default, so you are not billed unless you turn it on. Check Esri's current
  pricing and terms before relying on it. Mapbox and MapTiler satellite are paid alternatives, and
  Sentinel-2 cloudless (EOX) is free but blurrier and has attribution requirements.

To bring it back, take `src/mapStyle.js` from git commit `47e79e2` (it has the satellite style and the border
layers). The border data is still in the repo: `public/borders-countries.json` (Natural Earth) and
`public/borders-us-states.json` (US Census), built by `node scripts/build-borders.mjs`. They carry no names
and only shared borders are drawn, not coastlines. Set `VITE_IMAGERY_URL` (an XYZ address containing
`{z}/{x}/{y}`) and `VITE_IMAGERY_ATTRIBUTION` when building to point it at a keyed source.

### Testing the map

Open the page with `?debug` to expose the map as `window.__map` for automated tests.

## Deploy

`npm run build` produces a plain static site in `dist/` that works from any folder or sub-path.
Upload the folder to Netlify (drag and drop at app.netlify.com/drop), Vercel, Cloudflare Pages or GitHub Pages.

## Test reset

The hamburger menu has a "Reset everything (testing)" item. It wipes everything saved in the browser (results,
streak, unit choice), as on a first visit. Remove that button from `index.html` and its handler at the bottom
of `src/main.js` before launch.
