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

// Liberty's sea is a light, bright blue that looks washed out against the game's dark page. This paints the
// sea (and rivers) a deeper blue and darkens the low-zoom image layer a little so zoomed out it matches.
// Everything else stays as Liberty has it. Change SEA to taste.
export const SEA = "#2c6aa3";

export function deepSea(style) {
  return {
    ...style,
    layers: style.layers.map((layer) => {
      const sourceLayer = layer["source-layer"];
      if (layer.type === "fill" && sourceLayer === "water") {
        const paint = { ...layer.paint, "fill-color": SEA };
        delete paint["fill-outline-color"];
        delete paint["fill-pattern"];
        return { ...layer, paint };
      }
      if (layer.type === "line" && sourceLayer === "waterway") {
        return { ...layer, paint: { ...layer.paint, "line-color": SEA } };
      }
      if (layer.type === "raster") {
        return { ...layer, paint: { ...layer.paint, "raster-brightness-max": 0.88, "raster-saturation": 0.1 } };
      }
      return layer;
    }),
  };
}
