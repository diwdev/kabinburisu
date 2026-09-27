"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  Map as MapLibreMap,
  GeolocateControl,
  NavigationControl,
  addProtocol,
  setWorkerUrl,
  type StyleSpecification,
  type GeoJSONSource,
  type MapMouseEvent,
  type MapLayerMouseEvent,
} from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";

/**
 * MapLibre GL v6 is ESM-only and its worker relatively imports a large
 * sibling chunk (maplibre-gl-shared.mjs) that Next.js/Turbopack's bundler
 * does not emit correctly next to the auto-detected worker URL — the worker
 * then fails to load in production (map renders base tiles but no roads/
 * labels, since vector tile decoding needs the worker). Fixed by serving
 * both files ourselves from public/maplibre/ (copied on `postinstall` by
 * scripts/copy-maplibre-worker.mjs) and pointing MapLibre at that path
 * explicitly. Must run once, before any Map is constructed — module scope
 * (not inside the component) guarantees that.
 */
setWorkerUrl("/maplibre/maplibre-gl-worker.mjs");
import { Protocol as PMTilesProtocol } from "pmtiles";
import type { User } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/client";
import { MAP_CENTER, DEFAULT_ZOOM, PIN_STATUS_COLORS } from "@/lib/constants";
import type { MergedPin, PinStatus } from "@/lib/types";
import FilterBar, { type MapFilter } from "@/components/FilterBar";
import CoordinateSearchBox from "@/components/CoordinateSearchBox";
import PlaceSearchBox from "@/components/PlaceSearchBox";
import PinDetailSheet from "@/components/PinDetailSheet";
import PinForm from "@/components/PinForm";

type Role = "anonymous" | "requester" | "rescue_unit";

type MapViewProps = {
  mapStyle: string | StyleSpecification;
  attributionHtml: string;
};

let pmtilesProtocolRegistered = false;

function matchesFilter(pin: MergedPin, filter: MapFilter): boolean {
  switch (filter) {
    case "all":
      return true;
    case "food":
      return pin.needsFood;
    case "medicine":
      return pin.needsMedicine;
    case "medical":
      return pin.needsMedicalAid;
    case "waiting":
      return pin.status === "active" || pin.status === "stale";
    case "helped":
      return pin.status === "helped";
    default:
      return true;
  }
}

function pinsToGeoJson(pins: MergedPin[]): GeoJSON.FeatureCollection {
  return {
    type: "FeatureCollection",
    features: pins.map((pin) => ({
      type: "Feature",
      geometry: { type: "Point", coordinates: [pin.lng, pin.lat] },
      properties: { id: pin.id, status: pin.status },
    })),
  };
}

export default function MapView({ mapStyle, attributionHtml }: MapViewProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const placingPinRef = useRef(false);
  const onMapPickRef = useRef<((lat: number, lng: number) => void) | null>(null);

  const [mapReady, setMapReady] = useState(false);
  const [pinsById, setPinsById] = useState<Map<string, MergedPin>>(new Map());
  const [filter, setFilter] = useState<MapFilter>("all");
  const [selectedPinId, setSelectedPinId] = useState<string | null>(null);
  const [placingPin, setPlacingPin] = useState(false);
  const [newPinCoords, setNewPinCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [editingPin, setEditingPin] = useState<MergedPin | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [role, setRole] = useState<Role>("anonymous");
  const [loginHint, setLoginHint] = useState(false);

  // ---- Fetch pins: merge pins_public (coarse, everyone) with pins (full
  // detail, RLS-scoped to own rows / all rows for rescue units) — PLAN.md §2/§6 ----
  const fetchPins = useCallback(async () => {
    const supabase = createClient();
    const merged = new Map<string, MergedPin>();

    const { data: publicRows } = await supabase.from("pins_public").select("*");
    for (const row of publicRows ?? []) {
      merged.set(row.id, {
        id: row.id,
        status: row.status as PinStatus,
        lat: row.lat,
        lng: row.lng,
        headcount: row.headcount,
        needsFood: row.needs_food,
        needsMedicine: row.needs_medicine,
        needsMedicalAid: row.needs_medical_aid,
        createdAt: row.created_at,
        isFull: false,
      });
    }

    // Anon has no grant on `pins` at all — this errors for them, which is
    // expected and fine; we just fall back to the coarse view above.
    const { data: fullRows } = await supabase.from("pins").select("*");
    for (const row of fullRows ?? []) {
      merged.set(row.id, {
        id: row.id,
        status: row.status as PinStatus,
        lat: row.lat,
        lng: row.lng,
        headcount: row.headcount,
        needsFood: row.needs_food,
        needsMedicine: row.needs_medicine,
        needsMedicalAid: row.needs_medical_aid,
        createdAt: row.created_at,
        isFull: true,
        phone: row.phone,
        contactName: row.contact_name,
        note: row.note,
        requesterId: row.requester_id,
        lastConfirmedAt: row.last_confirmed_at,
      });
    }

    setPinsById(merged);
  }, []);

  // ---- Auth state ----
  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(({ data }) => setUser(data.user ?? null));
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    let active = true;
    async function loadRole() {
      if (!user) {
        if (active) setRole("anonymous");
        return;
      }
      const supabase = createClient();
      const { data, error } = await supabase.rpc("get_my_role");
      if (active) setRole(!error && data ? (data as Role) : "requester");
    }
    loadRole();
    return () => {
      active = false;
    };
  }, [user]);

  useEffect(() => {
    function loadNow() {
      fetchPins();
    }
    loadNow();
    // Poll periodically so other requesters'/rescue units' changes show up
    // without needing a full realtime subscription setup for this MVP.
    const interval = setInterval(fetchPins, 60_000);
    return () => clearInterval(interval);
  }, [fetchPins, user]);

  // ---- Map init (once) ----
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    if (!pmtilesProtocolRegistered) {
      const protocol = new PMTilesProtocol();
      addProtocol("pmtiles", protocol.tile);
      pmtilesProtocolRegistered = true;
    }

    const map = new MapLibreMap({
      container: containerRef.current,
      style: mapStyle,
      center: [MAP_CENTER.lng, MAP_CENTER.lat],
      zoom: DEFAULT_ZOOM,
      attributionControl: { customAttribution: attributionHtml },
    });
    mapRef.current = map;

    map.addControl(new NavigationControl(), "top-right");
    map.addControl(
      new GeolocateControl({ positionOptions: { enableHighAccuracy: true }, trackUserLocation: false }),
      "top-right"
    );

    map.on("load", () => {
      map.addSource("pins", {
        type: "geojson",
        data: { type: "FeatureCollection", features: [] },
        cluster: true,
        clusterMaxZoom: 14,
        clusterRadius: 50,
      });

      map.addLayer({
        id: "clusters",
        type: "circle",
        source: "pins",
        filter: ["has", "point_count"],
        paint: {
          "circle-color": "#1d4ed8",
          "circle-radius": ["step", ["get", "point_count"], 16, 10, 22, 30, 28],
          "circle-opacity": 0.85,
        },
      });

      map.addLayer({
        id: "cluster-count",
        type: "symbol",
        source: "pins",
        filter: ["has", "point_count"],
        layout: { "text-field": ["get", "point_count_abbreviated"], "text-size": 12 },
        paint: { "text-color": "#ffffff" },
      });

      map.addLayer({
        id: "unclustered-point",
        type: "circle",
        source: "pins",
        filter: ["!", ["has", "point_count"]],
        paint: {
          "circle-color": [
            "match",
            ["get", "status"],
            "active",
            PIN_STATUS_COLORS.active,
            "stale",
            PIN_STATUS_COLORS.stale,
            "helped",
            PIN_STATUS_COLORS.helped,
            PIN_STATUS_COLORS.closed,
          ],
          "circle-radius": 9,
          "circle-stroke-width": 2,
          "circle-stroke-color": "#ffffff",
        },
      });

      map.on("click", "clusters", (e: MapLayerMouseEvent) => {
        const features = map.queryRenderedFeatures(e.point, { layers: ["clusters"] });
        const clusterId = features[0]?.properties?.cluster_id;
        const source = map.getSource("pins") as GeoJSONSource | undefined;
        if (clusterId == null || !source) return;
        source.getClusterExpansionZoom(clusterId).then((zoom) => {
          const geometry = features[0].geometry;
          if (geometry.type !== "Point") return;
          map.easeTo({ center: geometry.coordinates as [number, number], zoom });
        });
      });

      map.on("click", "unclustered-point", (e: MapLayerMouseEvent) => {
        const id = e.features?.[0]?.properties?.id;
        if (id) setSelectedPinId(id);
      });

      for (const layer of ["clusters", "unclustered-point"]) {
        map.on("mouseenter", layer, () => (map.getCanvas().style.cursor = "pointer"));
        map.on("mouseleave", layer, () => (map.getCanvas().style.cursor = ""));
      }

      // ปักหมุดใหม่: ต้องคลิกบนแผนที่นอกเหนือจากตัวหมุด/คลัสเตอร์ที่มีอยู่แล้ว
      map.on("click", (e: MapMouseEvent) => {
        if (!placingPinRef.current) return;
        const hit = map.queryRenderedFeatures(e.point, {
          layers: ["clusters", "unclustered-point"],
        });
        if (hit.length > 0) return;
        onMapPickRef.current?.(e.lngLat.lat, e.lngLat.lng);
      });

      setMapReady(true);
    });

    return () => {
      map.remove();
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ---- Push filtered pins into the map source whenever data/filter changes ----
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;
    const source = map.getSource("pins") as GeoJSONSource | undefined;
    if (!source) return;
    const filtered = Array.from(pinsById.values()).filter((p) => matchesFilter(p, filter));
    source.setData(pinsToGeoJson(filtered));
  }, [pinsById, filter, mapReady]);

  // ---- "+" ปักหมุดขอความช่วยเหลือ ----
  function startPlacingPin() {
    if (!user) {
      setLoginHint(true);
      return;
    }
    setLoginHint(false);
    placingPinRef.current = true;
    onMapPickRef.current = (lat, lng) => {
      setNewPinCoords({ lat, lng });
      placingPinRef.current = false;
      setPlacingPin(false);
    };
    setPlacingPin(true);
  }

  function useMyLocationForNewPin() {
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setNewPinCoords({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        placingPinRef.current = false;
        setPlacingPin(false);
        mapRef.current?.flyTo({ center: [pos.coords.longitude, pos.coords.latitude], zoom: 15 });
      },
      () => setLoginHint(false),
      { enableHighAccuracy: true, timeout: 10_000 }
    );
  }

  function cancelPlacingPin() {
    placingPinRef.current = false;
    setPlacingPin(false);
  }

  function flyTo(lat: number, lng: number) {
    mapRef.current?.flyTo({ center: [lng, lat], zoom: 15 });
  }

  const selectedPin = selectedPinId ? pinsById.get(selectedPinId) ?? null : null;

  return (
    <div className="relative h-full w-full">
      <div ref={containerRef} className="h-full w-full" />

      {/* แถบควบคุมด้านบน: ตัวกรอง + ค้นหา (pointer-events-none บน wrapper กัน
          ไม่ให้บังการลากแผนที่ในพื้นที่ว่าง) */}
      <div className="pointer-events-none absolute inset-x-0 top-3 z-10 flex flex-col items-start gap-2 px-3">
        <FilterBar value={filter} onApply={setFilter} />
        <CoordinateSearchBox onFound={flyTo} />
        <PlaceSearchBox onSelect={flyTo} />
      </div>

      {placingPin && (
        <div className="pointer-events-none absolute inset-x-0 top-1/3 z-10 flex justify-center px-4">
          <div className="pointer-events-auto flex items-center gap-2 rounded-full bg-zinc-900/90 px-4 py-2 text-sm text-white shadow-lg">
            <span>แตะบนแผนที่เพื่อวางหมุด</span>
            <button
              onClick={useMyLocationForNewPin}
              className="rounded-full bg-white/20 px-2 py-1 text-xs font-semibold"
            >
              ใช้ตำแหน่งของฉัน
            </button>
            <button onClick={cancelPlacingPin} className="text-xs text-zinc-300 underline">
              ยกเลิก
            </button>
          </div>
        </div>
      )}

      {loginHint && (
        <div className="pointer-events-none absolute inset-x-0 top-1/3 z-10 flex justify-center px-4">
          <div className="pointer-events-auto rounded-xl bg-white px-4 py-3 text-sm text-zinc-700 shadow-lg">
            กรุณาเข้าสู่ระบบด้วย Google ก่อนปักหมุด (ปุ่มมุมขวาบน)
          </div>
        </div>
      )}

      {/* ปุ่มลอย "+" มุมล่างขวา ใช้นิ้วโป้งกดถึง */}
      <button
        onClick={startPlacingPin}
        className="absolute bottom-[calc(env(safe-area-inset-bottom)+1.25rem)] right-4 z-10 flex items-center gap-2 rounded-full bg-red-600 px-5 py-3.5 text-base font-bold text-white shadow-xl transition hover:bg-red-700"
      >
        + ปักหมุดขอความช่วยเหลือ
      </button>

      {selectedPin && (
        <PinDetailSheet
          pin={selectedPin}
          currentUserId={user?.id ?? null}
          role={role}
          onClose={() => setSelectedPinId(null)}
          onEdit={() => {
            setEditingPin(selectedPin);
            setSelectedPinId(null);
          }}
          onChanged={fetchPins}
        />
      )}

      {newPinCoords && (
        <PinForm
          mode="create"
          coords={newPinCoords}
          onClose={() => setNewPinCoords(null)}
          onPickLocationAgain={() => {
            setNewPinCoords(null);
            startPlacingPin();
          }}
          onSubmitted={() => {
            setNewPinCoords(null);
            fetchPins();
          }}
        />
      )}

      {editingPin && (
        <PinForm
          mode="edit"
          coords={{ lat: editingPin.lat, lng: editingPin.lng }}
          initialPin={editingPin}
          onClose={() => setEditingPin(null)}
          onSubmitted={() => {
            setEditingPin(null);
            fetchPins();
          }}
        />
      )}
    </div>
  );
}
