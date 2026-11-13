import { test } from "node:test";
import assert from "node:assert/strict";
import { loadImage, creditParts, figureHTML, forgetImageAttempts } from "../src/revealImage.js";
import { QUESTIONS } from "../src/questions.js";

// A stand-in for the browser's Image that loads, fails or never answers, depending on the address.
function fakeImage(behaviour) {
  return class {
    set src(url) {
      if (!url) return;
      const b = behaviour(url);
      if (b === "load") setTimeout(() => this.onload && this.onload(), 1);
      if (b === "error") setTimeout(() => this.onerror && this.onerror(), 1);
      // "hang": never answers
    }
  };
}

test("loadImage: true when the image loads", async () => {
  forgetImageAttempts();
  assert.equal(await loadImage("https://x/ok.jpg", { ImageCtor: fakeImage(() => "load") }), true);
});

test("loadImage: false for a removed file (404), without throwing", async () => {
  forgetImageAttempts();
  assert.equal(await loadImage("https://x/gone.jpg", { ImageCtor: fakeImage(() => "error") }), false);
});

test("loadImage: false when it takes too long", async () => {
  forgetImageAttempts();
  const t = Date.now();
  assert.equal(await loadImage("https://x/slow.jpg", { timeoutMs: 30, ImageCtor: fakeImage(() => "hang") }), false);
  assert.ok(Date.now() - t < 1000);
});

test("loadImage: false for no url or no Image support", async () => {
  forgetImageAttempts();
  assert.equal(await loadImage("", { ImageCtor: fakeImage(() => "load") }), false);
  assert.equal(await loadImage(undefined), false);
  assert.equal(await loadImage("https://x/a.jpg", { ImageCtor: null }), false);
});

test("loadImage: one attempt per address, failures are remembered", async () => {
  forgetImageAttempts();
  let n = 0;
  const C = fakeImage(() => (n++, "error"));
  await loadImage("https://x/dead.jpg", { ImageCtor: C });
  await loadImage("https://x/dead.jpg", { ImageCtor: C });
  assert.equal(n, 1);
});

test("figureHTML: nothing for questions without a picture", () => {
  assert.equal(figureHTML({ image: null }), "");
  assert.equal(figureHTML({}), "");
  assert.equal(figureHTML(undefined), "");
  assert.match(figureHTML({ image: { url: "https://x/a.jpg" } }), /reveal-figure/);
});

test("creditParts: credit, confirmed licence and a link to the original page", () => {
  const p = creditParts({
    credit: "Horcrux",
    license: "CC BY-SA 4.0",
    page: "https://commons.wikimedia.org/wiki/File:Rocky_Steps_2025-03.jpg",
  });
  assert.deepEqual(p, {
    credit: "Horcrux",
    license: "CC BY-SA 4.0",
    linkText: "Wikimedia Commons",
    href: "https://commons.wikimedia.org/wiki/File:Rocky_Steps_2025-03.jpg",
  });
});

test("creditParts: nothing to print, or an unsafe link, is handled", () => {
  assert.equal(creditParts(null), null);
  assert.equal(creditParts({ credit: "", license: "", page: "" }), null);
  const p = creditParts({ credit: "A", license: "", page: "javascript:alert(1)" });
  assert.equal(p.href, "");
});

test("question bank: images are https, the rest have image null", () => {
  let withImage = 0;
  for (const q of QUESTIONS) {
    assert.ok(q.image === null || typeof q.image === "object", q.id);
    if (!q.image) continue;
    withImage++;
    assert.match(q.image.url, /^https:\/\//, q.id);
    assert.ok(q.image.url.length < 400, q.id);
    assert.ok(q.image.page === "" || q.image.page.startsWith("https://"), q.id);
  }
  assert.ok(withImage > 100);
  assert.ok(withImage < QUESTIONS.length);
});

test("question bank: Commons pictures are requested as thumbnails, not originals", () => {
  for (const q of QUESTIONS) {
    if (q.image && q.image.url.includes("Special:FilePath/")) assert.match(q.image.url, /[?&]width=\d+/, q.id);
  }
});

test("question bank: every question has a known precision level", () => {
  const counts = {};
  for (const q of QUESTIONS) {
    assert.ok(["specific", "district", "city", "region"].includes(q.level), `${q.id}: ${q.level}`);
    counts[q.level] = (counts[q.level] || 0) + 1;
  }
  assert.ok(counts.specific > 100 && counts.city > 50 && counts.district > 0 && counts.region > 0);
});
