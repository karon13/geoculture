// OpenFreeMap's "Liberty" style, minus anything that says where you are.
//
// Liberty is OpenFreeMap's full-colour map style and it draws terrain nicely even when zoomed out, so we
// fetch the real style from OpenFreeMap when the map starts and remove every text and icon layer (place,
// street and country names, shields, points of interest, house numbers; all of them are layers of type
// "symbol"). Everything else, including Liberty's own country and state border lines, colours, shapes and
// zoom behaviour, stays exactly as OpenFreeMap designed it.
export const LIBERTY_STYLE_URL = "https://tiles.openfreemap.org/styles/liberty";

export function stripText(style) {
  return {
    ...style,
    layers: style.layers.filter((layer) => layer.type !== "symbol"),
  };
}
