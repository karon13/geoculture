// OpenFreeMap's "Liberty" style, minus anything that says where you are.
//
// Liberty is OpenFreeMap's own full-colour map style and it draws terrain nicely even when zoomed out, so
// we fetch the real style from OpenFreeMap when the map starts and strip out:
//   - every text and icon layer (place, street and country names, shields, points of interest, house
//     numbers), which is every layer of type "symbol";
//   - OpenFreeMap's own boundary lines, because the game draws its own country and US state borders.
// Everything else (land, water, parks, roads, buildings ...) stays exactly as OpenFreeMap designed it.
export const LIBERTY_STYLE_URL = "https://tiles.openfreemap.org/styles/liberty";

export function stripText(style) {
  return {
    ...style,
    layers: style.layers.filter((layer) => layer.type !== "symbol" && layer["source-layer"] !== "boundary"),
  };
}
