// The picture shown with the story after a guess (artwork, film location, album cover place...).
//
// Images are hotlinked from their source (mostly Wikimedia Commons) and never stored in the repo. That means
// any of them can be missing (no picture for the question), slow, or gone tomorrow (file renamed or deleted).
// The rule here: a picture is a bonus. It is only shown once the browser has really loaded it, and in every
// other case the figure is removed and the reveal looks exactly like a reveal without a picture.

export const IMAGE_TIMEOUT_MS = 8000;

// One load per address for the whole session: the picture is requested while the player is still guessing,
// so by the time the answer is revealed it is already in the browser cache. Failures are remembered too, so a
// dead link is not retried on every round.
const attempts = new Map();

/**
 * Resolves true if the image loaded, false if it failed or took longer than timeoutMs. Never rejects.
 * ImageCtor is injectable so this can be tested without a browser.
 */
export function loadImage(url, { timeoutMs = IMAGE_TIMEOUT_MS, ImageCtor = globalThis.Image } = {}) {
  if (!url || typeof ImageCtor !== "function") return Promise.resolve(false);
  if (attempts.has(url)) return attempts.get(url);
  const attempt = new Promise((resolve) => {
    let done = false;
    let img;
    let timer;
    const finish = (ok) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      if (!ok && img) {
        img.onload = img.onerror = null;
        img.src = ""; // stop a stalled download
      }
      resolve(ok);
    };
    try {
      img = new ImageCtor();
      img.referrerPolicy = "no-referrer";
      img.decoding = "async";
      img.onload = () => finish(true);
      img.onerror = () => finish(false);
      timer = setTimeout(() => finish(false), timeoutMs);
      img.src = url;
    } catch {
      finish(false);
    }
  });
  attempts.set(url, attempt);
  return attempt;
}

/** Starts loading the pictures of the given questions (those without one are skipped). */
export function preloadImages(questions) {
  for (const q of questions) if (q && q.image) loadImage(q.image.url);
}

export function forgetImageAttempts() {
  attempts.clear();
}

const SOURCE_NAMES = {
  "commons.wikimedia.org": "Wikimedia Commons",
  "www.artic.edu": "Art Institute of Chicago",
  "www.loc.gov": "Library of Congress",
  "tile.loc.gov": "Library of Congress",
};

function hostOf(url) {
  try {
    return new URL(url).hostname;
  } catch {
    return "";
  }
}

/**
 * What the small caption under a picture says: { credit, license, linkText, href }.
 * Returns null when there is nothing worth printing. The licence is only included when the CSV has a
 * confirmed one (see scripts/build-questions.py); the link to the original page is always kept if known.
 */
export function creditParts(image) {
  if (!image) return null;
  const href = /^https:\/\//.test(image.page || "") ? image.page : "";
  const credit = (image.credit || "").trim();
  const license = (image.license || "").trim();
  if (!href && !credit && !license) return null;
  const linkText = href ? SOURCE_NAMES[hostOf(href)] || hostOf(href).replace(/^www\./, "") || "Source" : "";
  return { credit, license, linkText, href };
}

/**
 * The placeholder that goes into the reveal markup. Empty string when the question has no picture.
 * It holds a calm loading frame (so nothing jumps if the picture arrives a moment late) and is filled in or
 * removed by mountImage.
 */
export function figureHTML(q) {
  if (!q || !q.image || !q.image.url) return "";
  return `<figure class="reveal-figure loading" data-image-state="loading"><div class="rf-frame"></div></figure>`;
}

/**
 * Fills the placeholder inside root once the picture has really loaded, or removes it if it can't.
 * Safe to call more than once for the same root (it only acts on a figure still loading).
 * Returns a promise that resolves true when a picture ended up on screen.
 */
export async function mountImage(root, q, { doc = globalThis.document, ...options } = {}) {
  const figure = root && root.querySelector ? root.querySelector(".reveal-figure[data-image-state='loading']") : null;
  if (!figure) return false;
  const ok = !!(q && q.image) && (await loadImage(q.image.url, options));
  if (!root.contains(figure)) return false; // the panel was re-rendered while the picture was loading
  if (!ok) {
    figure.remove();
    return false;
  }
  const img = doc.createElement("img");
  img.className = "rf-img";
  img.alt = q.place ? `${q.title ? q.title + ": " : ""}${q.place}` : q.title || "";
  img.referrerPolicy = "no-referrer";
  img.decoding = "async";
  // A picture that decodes badly after loading, or whose cached copy vanishes, still must not leave a hole.
  img.addEventListener("error", () => figure.remove(), { once: true });
  img.src = q.image.url;
  figure.querySelector(".rf-frame").appendChild(img);

  const parts = creditParts(q.image);
  if (parts) {
    const cap = doc.createElement("figcaption");
    const bits = [];
    if (parts.credit) bits.push(`Photo: ${parts.credit}`);
    if (parts.license) bits.push(parts.license);
    cap.append(bits.join(" · "));
    if (parts.href) {
      if (bits.length) cap.append(" · ");
      const a = doc.createElement("a");
      a.href = parts.href;
      a.target = "_blank";
      a.rel = "noopener noreferrer";
      a.textContent = parts.linkText;
      cap.append(a);
    }
    figure.appendChild(cap);
  }
  figure.dataset.imageState = "ready";
  figure.classList.remove("loading");
  return true;
}
