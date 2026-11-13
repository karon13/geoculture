import { defineConfig } from "vite";
import { resolve } from "node:path";

// base "./" lets the built site work from any folder or sub-path (Netlify, GitHub Pages, S3, ...).
//
// Pages: the game (/), /about/ and /privacy/. The last two are plain static pages with no globe or map.
//
// SITE_URL is the public address of the site, without a trailing slash. Canonical links, share cards and the
// sitemap need a full address, so set it when the final domain is known:
//   VITE_SITE_URL=https://geoculture.example npm run build
// (in GitHub Actions: add it as an env var on the build step).
const SITE_URL = (process.env.VITE_SITE_URL || "https://karon13.github.io/geoculture").replace(/\/+$/, "");
const PAGES = ["/", "/about/", "/privacy/"];

function siteFiles() {
  return {
    name: "geoculture-site-files",
    transformIndexHtml: (html) => html.replaceAll("%SITE_URL%", SITE_URL),
    generateBundle() {
      const lastmod = new Date().toISOString().slice(0, 10);
      const urls = PAGES.map((p) => `  <url><loc>${SITE_URL}${p}</loc><lastmod>${lastmod}</lastmod></url>`).join("\n");
      this.emitFile({
        type: "asset",
        fileName: "sitemap.xml",
        source: `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`,
      });
      this.emitFile({
        type: "asset",
        fileName: "robots.txt",
        source: `User-agent: *\nAllow: /\n\nSitemap: ${SITE_URL}/sitemap.xml\n`,
      });
    },
  };
}

export default defineConfig({
  base: "./",
  plugins: [siteFiles()],
  build: {
    chunkSizeWarningLimit: 2000,
    rollupOptions: {
      input: {
        main: resolve(import.meta.dirname, "index.html"),
        about: resolve(import.meta.dirname, "about/index.html"),
        privacy: resolve(import.meta.dirname, "privacy/index.html"),
      },
    },
  },
});
