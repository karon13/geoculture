# StoryGlobe

A daily game: five prompts from art, music, books and movies, and you pin each one on a globe.
100 points per round, 500 per day. The streak is stored in the browser.

## Scoring

Every question has a `precision_label` in the CSV (Specific Place, District / Neighbourhood, City / Town,
Region). The build turns it into a `level` and the game shows it as a badge next to the category, so the player
knows how exact the answer has to be. The level sets the scoring (`PRECISION` in `src/game.js`):

    points = round(100 * exp(-max(0, km - fullKm) / scaleKm))

| Level                     | Full 100 within | Falloff scale | 100 km off | 1,000 km off | 5,000 km off |
| ------------------------- | --------------- | ------------- | ---------- | ------------ | ------------ |
| Specific Place            | 2 km            | 1,000 km      | 91         | 37           | 1            |
| District / Neighbourhood  | 8 km            | 1,400 km      | 94         | 49           | 3            |
| City / Town               | 25 km           | 1,800 km      | 96         | 58           | 6            |
| Region                    | 100 km          | 2,500 km      | 100        | 70           | 14           |

Inside the full zone you get 100; beyond it points fall off exponentially, faster for more exact targets. A
stricter level never scores higher than a looser one at the same distance (covered by `npm test`). To tune the
game, change the two numbers per level in `PRECISION`, then update this table and the About page. An unknown
`precision_label` fails the build. Results already saved in a player's browser keep the points they were given.

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

## Pages and SEO

The build makes three pages: the game (`/`), `/about/` (the one place for how to play, scoring, FAQ and credits;
there is no separate in-game popup) and `/privacy/`. The last two are plain static HTML
(`about/index.html`, `privacy/index.html`, styled by `src/page.css`) with no globe or map. Each has its own
title, description, canonical link and share-card tags. `sitemap.xml` and `robots.txt` are generated at build time
by `vite.config.js`. All three pages share the top bar and hamburger menu (`src/chrome.css`), so the menu button sits
in the same place everywhere; the static pages' menu script is `src/pageMenu.js`.

Canonical links, share cards and the sitemap need the public address. It defaults to
`https://karon13.github.io/storyglobe`; the live domain is `storyglobe.app`; set it in the host's build settings:

    VITE_SITE_URL=https://storyglobe.app npm run build

(in GitHub Actions, add `env: VITE_SITE_URL: ...` to the build step). Also still to do before launch: a
1200x630 share image (`og:image`), and update `/privacy/` when ads or analytics are added.

## Reveal pictures

After a guess the reveal shows the place, then a picture (artwork, film location...), then the story. Pictures
are **hotlinked**, never stored in the repo: `image_url` in the CSV goes to the player's browser as it is
(Wikimedia Commons addresses get `?width=1000` added by the build script so phones fetch a thumbnail).

A picture is a bonus and the reveal never depends on it (`src/revealImage.js`):

- no `image_url` in the CSV: the question ships `image: null`, no figure is drawn;
- the picture is fetched while the player is still guessing, so it is usually instant at the reveal;
- it is only shown once the browser has really loaded it; a removed file (404), a blocked host or no answer
  within 8 seconds removes the figure and the reveal looks like one without a picture;
- a loading frame of fixed height keeps the story from jumping down if the picture arrives late;
- the caption shows "Photo: credit · licence · Wikimedia Commons" (link to the file page). The licence is only
  printed when the CSV has a confirmed one (CC BY, CC BY-SA, CC0, public domain); "Licence to confirm..."
  values are treated as a to-do and not shown.

Before launch, check each file page for licence and attribution (CC BY and CC BY-SA require the credit that the
caption provides). `npm test` covers the loading, failure, timeout and caption logic.

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

### State borders

OpenFreeMap draws state and province lines faintly and late. `emphasizeStateBorders` in `src/libertyStyle.js` finds
those layers (by their `admin_level` filter) and restyles them in every country: dotted, thinner than the country
border, shown from zoom 2.4. Tune start, strength, width and dot spacing in `STATE_BORDER`. If the style has no
state layer a warning is logged in the browser console. (A US-only version, using an outline of the US as a mask,
was tried and reverted.)

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

The live site runs on Cloudflare Pages (free plan). `.github/workflows/cloudflare.yml` tests, builds and uploads it on every push to `main`; it needs the repository secrets `CLOUDFLARE_API_TOKEN` (permission Cloudflare Pages: Edit) and `CLOUDFLARE_ACCOUNT_ID`.

## Testing before release

Work on the `develop` branch. Every push to `develop` is tested, built and uploaded as a Cloudflare Pages preview at
`https://develop.storyglobe.pages.dev`, while `storyglobe.app` stays untouched. When the preview looks right, merge
`develop` into `main` and the live site updates. (The workflow is `.github/workflows/cloudflare.yml`.)

## Test reset

The hamburger menu has a "Reset everything (testing)" item. It wipes everything saved in the browser (results,
streak, unit choice), as on a first visit. Remove that button from `index.html` and its handler at the bottom
of `src/main.js` before launch.
