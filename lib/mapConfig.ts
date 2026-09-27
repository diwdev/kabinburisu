import type { StyleSpecification } from "maplibre-gl";
import { env } from "@/lib/env";
import { serverEnv } from "@/lib/env.server";

export type MapTileSource = "maptiler" | "pmtiles";

/**
 * Swappable tile-provider abstraction (PLAN.md §4). Which provider is used
 * is controlled entirely by the `MAP_TILE_SOURCE` env var — switching
 * providers when a quota runs low should never require a code change.
 *
 * This is called from `app/map/page.tsx` (a server component) and the
 * resolved style is passed down to the client `MapView` as a prop — that
 * keeps `MAP_TILE_SOURCE` itself as a plain server env var (no NEXT_PUBLIC_
 * prefix needed) while still letting the actual map style reach the browser.
 */
export function getMapStyle(
  source: MapTileSource = serverEnv.MAP_TILE_SOURCE
): string | StyleSpecification {
  if (source === "pmtiles") {
    return getPmtilesStyle();
  }
  return getMaptilerStyle();
}

function getMaptilerStyle(): string {
  const key = env.NEXT_PUBLIC_MAPTILER_KEY;
  // Vector style JSON, billed per map "session" — cheap for a single-province tool.
  return `https://api.maptiler.com/maps/streets-v2/style.json?key=${key}`;
}

// PMTiles hosted on Cloudflare R2 (or any public HTTPS host) — see PLAN.md §4.
// Stubbed in behind the same interface; it does not need a fully styled
// basemap yet, it just must not crash the map when selected.
const PMTILES_URL =
  process.env.NEXT_PUBLIC_PMTILES_URL ||
  "https://example-r2-bucket.invalid/thailand.pmtiles";

function getPmtilesStyle(): StyleSpecification {
  return {
    version: 8,
    sources: {
      "pmtiles-source": {
        type: "vector",
        url: `pmtiles://${PMTILES_URL}`,
        attribution: "© Protomaps © OpenStreetMap contributors",
      },
    },
    // NOTE: intentionally minimal — no real vector layers styled from the
    // Protomaps schema yet (TODO when this becomes the primary source).
    // Requires maplibregl.addProtocol('pmtiles', new pmtiles.Protocol().tile)
    // to be registered client-side before the map is constructed (done once
    // in MapView.tsx regardless of which source is active).
    layers: [
      {
        id: "background",
        type: "background",
        paint: { "background-color": "#e5e7eb" },
      },
    ],
  };
}

/** Attribution text required by the active provider's license, on top of the
 * mandatory OSM attribution (ODbL) — see PLAN.md §4. */
export function getAttributionHtml(
  source: MapTileSource = serverEnv.MAP_TILE_SOURCE
): string {
  if (source === "pmtiles") {
    return "© Protomaps © OpenStreetMap contributors";
  }
  return "© OpenStreetMap contributors © MapTiler";
}
