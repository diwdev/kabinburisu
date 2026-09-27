"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  Map as MapLibreMap,
  Marker,
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
  // หมุดร่างจาก GPS ที่ยังไม่ยืนยัน — ลากปรับตำแหน่งได้ก่อนกดยืนยันจริง (ดู
  // useMyLocationForNewPin/confirmDraftPin ด้านล่าง: แก้ปัญหา GPS ไม่แม่นยำ
  // แล้วปักหมุดผิดตำแหน่งไปเลยโดยไม่มีขั้นตอนตรวจสอบก่อน)
  const draftMarkerRef = useRef<Marker | null>(null);
  // หมุดชั่วคราวจากการค้นหา (พิกัด/ชื่อสถานที่) — ดู flyTo() ด้านล่าง
  const searchMarkerRef = useRef<Marker | null>(null);

  const [mapReady, setMapReady] = useState(false);
  const [pinsById, setPinsById] = useState<Map<string, MergedPin>>(new Map());
  const [filter, setFilter] = useState<MapFilter>("all");
  const [selectedPinId, setSelectedPinId] = useState<string | null>(null);
  const [placingPin, setPlacingPin] = useState(false);
  const [draftActive, setDraftActive] = useState(false);
  const [draftAccuracy, setDraftAccuracy] = useState<number | null>(null);
  const [newPinCoords, setNewPinCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [editingPin, setEditingPin] = useState<MergedPin | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [role, setRole] = useState<Role>("anonymous");
  const [loginHint, setLoginHint] = useState(false);

  // ---- Fetch pins: merge pins_public (coarse, everyone) with pins (full
  // detail, RLS-scoped to own rows / all rows for rescue units) — PLAN.md §2/§6 ----
  //
  // Root cause of a real bug found in production: fetchPins() gets triggered
  // more than once in quick succession on page load (auth state resolves in
  // 2 steps — getUser() then onAuthStateChange — and the effect below that
  // calls fetchPins depends on `user`, so it re-fires each time). With no
  // guard against out-of-order responses, an EARLIER call made before login
  // finished (its `pins` query effectively empty/anon, so it only had the
  // coarse pins_public rounded coordinates) could resolve AFTER a LATER call
  // made once login completed (with the real, exact coordinates) — silently
  // overwriting the correct precise location with a rounded ~1.1km-fuzzed
  // one. This exactly matched what was reported: the same pin, same account,
  // rendering at a location off by a few hundred meters — the same order of
  // magnitude as pins_public's 2-decimal-place rounding — inconsistently
  // across devices/reloads, which is the signature of a timing race, not a
  // deterministic data or rendering bug (confirmed separately: a direct DB
  // query showed only one correct coordinate stored, and a coordinate-search
  // marker using the same value always rendered in the right place).
  //
  // Fix: a generation counter — only the result of the most recently
  // *started* fetchPins() call is ever applied; any older call that resolves
  // late is discarded instead of clobbering fresher data.
  const fetchGenerationRef = useRef(0);

  const fetchPins = useCallback(async () => {
    const myGeneration = ++fetchGenerationRef.current;
    const supabase = createClient();
    const merged = new Map<string, MergedPin>();

    const { data: publicRows, error: publicError } = await supabase
      .from("pins_public")
      .select("*");
    if (publicError) {
      console.error("[fetchPins] pins_public query failed:", publicError);
    }
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
    // Logged loudly (not silently swallowed) because a real rescue-unit
    // account seeing this error unexpectedly would otherwise silently fall
    // back to coarse/rounded coordinates with zero visible indication why —
    // exactly the failure mode being actively debugged right now.
    const { data: fullRows, error: fullError } = await supabase
      .from("pins")
      .select("*");
    if (fullError) {
      console.error("[fetchPins] pins (full) query failed:", fullError);
    }
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

    // มี fetchPins() รอบใหม่กว่าเริ่มไปแล้วระหว่างที่รอบนี้ยังโหลดอยู่ — ทิ้งผลลัพธ์
    // รอบนี้ไป ไม่งั้นข้อมูลเก่า/หยาบกว่าจะไปทับข้อมูลใหม่ที่ถูกต้องแล้ว (root cause
    // ของบั๊กพิกัดเพี้ยนที่เจอจริงในโปรดักชัน — ดูคอมเมนต์ด้านบน)
    if (myGeneration !== fetchGenerationRef.current) return;
    // TODO(debug, remove once the pin-location mismatch bug is confirmed
    // fixed): dump exactly what ends up in state per pin, so we can see
    // directly whether the bug is upstream (wrong lat/lng already here) or
    // downstream (correct here, but rendered wrong on the map layer).
    console.log(
      "[fetchPins] merged pins:",
      Array.from(merged.values()).map((p) => ({
        id: p.id,
        lat: p.lat,
        lng: p.lng,
        isFull: p.isFull,
        status: p.status,
      }))
    );
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
      // MapLibre GL JS มีบั๊กที่รู้จักกันอยู่แล้ว (maplibre/maplibre-gl-js#5772,
      // #7278) คือไม่ส่ง header Referer/Origin ไปกับ request ดึง style/tile ใน
      // บาง browser/สถานการณ์ ทำให้ MapTiler เห็นเป็น "unknown origin" แล้วตอบ
      // 403 "Key usage restricted" ทั้งที่ Allowed HTTP Origins ตั้งค่าถูกแล้ว
      // (เกิดเฉพาะ browser จริง จำลองผ่าน curl ไม่เจอ) แก้โดยกำหนด referrerPolicy
      // เองตรงนี้ตามที่ทีม MapLibre แนะนำ — "origin" ส่งแค่โดเมนของเรา ไม่ส่ง
      // path เต็ม เพียงพอให้ MapTiler ยืนยัน origin ได้ ไม่ต้องเปิดเผยข้อมูลเกินจำเป็น
      transformRequest: (url) => ({ url, referrerPolicy: "origin" }),
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
      draftMarkerRef.current?.remove();
      draftMarkerRef.current = null;
      searchMarkerRef.current?.remove();
      searchMarkerRef.current = null;
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

  /**
   * ปุ่ม "ใช้ตำแหน่งของฉัน" — เดิมปักหมุดตรงจากพิกัด GPS ทันทีโดยไม่มีขั้นตอน
   * ตรวจสอบ ทำให้ถ้า GPS/WiFi-positioning ของอุปกรณ์ไม่แม่นยำ (พบได้บ่อยใน
   * ต่างจังหวัดที่ฐานข้อมูล WiFi ของ Google บางกว่าเมือง หรือเปิดจาก desktop
   * ที่ไม่มี GPS จริง) หมุดจะเพี้ยนจากตำแหน่งจริงได้โดยผู้ใช้ไม่รู้ตัว — ตอนนี้
   * แสดงเป็นหมุด "ร่าง" ที่ลากปรับตำแหน่งได้ก่อน พร้อมโชว์ค่าความแม่นยำจาก
   * pos.coords.accuracy ให้ผู้ใช้ตัดสินใจเองว่าต้องปรับไหม แล้วค่อยกดยืนยัน
   */
  function useMyLocationForNewPin() {
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const { latitude, longitude, accuracy } = pos.coords;
        placingPinRef.current = false;
        setPlacingPin(false);

        const map = mapRef.current;
        if (!map) return;
        draftMarkerRef.current?.remove();
        const marker = new Marker({ color: "#dc2626", draggable: true })
          .setLngLat([longitude, latitude])
          .addTo(map);
        draftMarkerRef.current = marker;
        setDraftAccuracy(accuracy);
        setDraftActive(true);
        map.flyTo({ center: [longitude, latitude], zoom: 16 });
      },
      () => setLoginHint(false),
      { enableHighAccuracy: true, timeout: 10_000 }
    );
  }

  /** ยืนยันตำแหน่งหมุดร่าง (หลังลากปรับถ้าจำเป็น) แล้วเปิดฟอร์มปักหมุดต่อ */
  function confirmDraftPin() {
    const marker = draftMarkerRef.current;
    if (!marker) return;
    const { lat, lng } = marker.getLngLat();
    setNewPinCoords({ lat, lng });
    cancelDraftPin();
  }

  function cancelDraftPin() {
    draftMarkerRef.current?.remove();
    draftMarkerRef.current = null;
    setDraftActive(false);
    setDraftAccuracy(null);
  }

  function cancelPlacingPin() {
    placingPinRef.current = false;
    setPlacingPin(false);
  }

  /**
   * ใช้กับทั้งค้นหาจากพิกัดและค้นหาจากชื่อสถานที่ — ปักหมุดสีน้ำเงินไว้ที่จุด
   * ที่ค้นหา (แยกสีจากหมุดขอความช่วยเหลือสีแดง/หมุดร่าง GPS) เพื่อให้เทียบ
   * ตำแหน่งด้วยตาได้ง่าย เช่น เอาไว้เช็คว่าพิกัดที่บันทึกในระบบตรงกับที่ระบบ
   * วาดบนแผนที่จริงไหม
   */
  function flyTo(lat: number, lng: number) {
    const map = mapRef.current;
    if (!map) return;
    searchMarkerRef.current?.remove();
    searchMarkerRef.current = new Marker({ color: "#2563eb" })
      .setLngLat([lng, lat])
      .addTo(map);
    map.flyTo({ center: [lng, lat], zoom: 16 });
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
        {/* PlaceSearchBox ซ่อนไว้ก่อนตามที่ผู้ใช้ขอ (ยังไม่ได้ใช้งานจริง) —
            เก็บ component/import ไว้เผื่อเปิดใช้ทีหลัง แค่ไม่ render ตอนนี้ */}
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

      {draftActive && (
        <div className="pointer-events-none absolute inset-x-0 top-1/3 z-10 flex justify-center px-4">
          <div className="pointer-events-auto flex max-w-full flex-col items-center gap-2 rounded-xl bg-zinc-900/90 px-4 py-3 text-center text-sm text-white shadow-lg">
            <span>
              ลากหมุดสีแดงเพื่อปรับตำแหน่งให้ตรงก่อนยืนยัน
              {draftAccuracy != null && (
                <>
                  {" "}
                  — GPS แม่นยำประมาณ ±{Math.round(draftAccuracy)} เมตร
                  {draftAccuracy > 100 && " (ควรตรวจสอบตำแหน่งให้ดี)"}
                </>
              )}
            </span>
            <div className="flex gap-2">
              <button
                onClick={confirmDraftPin}
                className="rounded-full bg-red-600 px-4 py-1.5 text-sm font-bold text-white"
              >
                ยืนยันตำแหน่งนี้
              </button>
              <button
                onClick={cancelDraftPin}
                className="rounded-full bg-white/20 px-4 py-1.5 text-sm"
              >
                ยกเลิก
              </button>
            </div>
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
