// MapLibre GL JS v6 is ESM-only and its tile-processing worker relatively
// imports a ~500KB sibling chunk (maplibre-gl-shared.mjs). Turbopack/webpack's
// automatic `new URL('maplibre-gl-worker.mjs', import.meta.url)` bundling does
// not emit that sibling file correctly under Next.js, so the worker fails to
// load in production ("Worker failed to load" / "non-JavaScript MIME type of
// text/html" in the browser console) — the map then renders its base tiles
// but no vector layers (roads, labels), since tile-data decoding needs the
// worker. Confirmed root cause via https://github.com/vercel/next.js/issues/86495
// and multiple projects hitting the same MapLibre v6 + Next.js combination.
//
// Fix: copy both files from the installed package into public/ ourselves so
// they're served as plain same-origin static files with a correct JS MIME
// type, then point maplibre-gl at them explicitly via setWorkerUrl() in
// MapView.tsx, called before any Map is constructed.
//
// Runs on `postinstall` so the files exist before `next dev`/`next build`
// ever run, and stays in sync automatically whenever maplibre-gl is upgraded
// (re-copies on every `npm install`).
import { copyFileSync, mkdirSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");
const srcDir = join(root, "node_modules", "maplibre-gl", "dist");
const destDir = join(root, "public", "maplibre");

const files = ["maplibre-gl-worker.mjs", "maplibre-gl-shared.mjs"];

if (!existsSync(srcDir)) {
  console.warn(
    "[copy-maplibre-worker] node_modules/maplibre-gl/dist not found yet — skipping (fine during a fresh `npm install` before deps are linked; will run again)."
  );
  process.exit(0);
}

mkdirSync(destDir, { recursive: true });

for (const file of files) {
  const src = join(srcDir, file);
  const dest = join(destDir, file);
  if (!existsSync(src)) {
    console.error(`[copy-maplibre-worker] expected file not found: ${src}`);
    process.exit(1);
  }
  copyFileSync(src, dest);
  console.log(`[copy-maplibre-worker] copied ${file} -> public/maplibre/`);
}
