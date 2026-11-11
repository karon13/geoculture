import { defineConfig } from "vite";

// base "./" lets the built site work from any folder or sub-path (Netlify, GitHub Pages, S3, ...).
export default defineConfig({
  base: "./",
  build: { chunkSizeWarningLimit: 2000 },
});
