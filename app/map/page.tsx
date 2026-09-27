import Header from "@/components/Header";
import MapView from "@/app/map/MapView";
import { getMapStyle, getAttributionHtml } from "@/lib/mapConfig";

/**
 * Server component shell (PLAN.md §6/§10): resolves the map style/attribution
 * server-side from MAP_TILE_SOURCE (a plain, non-NEXT_PUBLIC_ env var) and
 * hands the resolved value down to the client MapView — that way switching
 * providers is still just one env line, with no client bundle change needed.
 */
export default function MapPage() {
  const mapStyle = getMapStyle();
  const attributionHtml = getAttributionHtml();

  return (
    <div className="flex h-dvh flex-col">
      <Header />
      <div className="relative flex-1">
        <MapView mapStyle={mapStyle} attributionHtml={attributionHtml} />
      </div>
    </div>
  );
}
