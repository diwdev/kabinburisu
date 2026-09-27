import { NextResponse } from "next/server";
import { env } from "@/lib/env";
import { THAILAND_BOUNDS } from "@/lib/constants";

/**
 * GET /api/geocode?q=... — proxy การค้นหาชื่อสถานที่ (PLAN.md §4)
 *
 * Browser ห้ามเรียก MapTiler Geocoding หรือ Nominatim ตรงเด็ดขาด ต้องผ่าน
 * route handler นี้เท่านั้น เพราะ:
 *  - MapTiler ใช้ key เดียวกับ tile (โควตาต้องคุมรวมกัน)
 *  - Nominatim จำกัด 1 คำขอ/วินาที + ต้องมี User-Agent ที่ระบุตัวตนจริง + ห้ามเรียกแบบ
 *    "systematic" — ต้อง cache ผลลัพธ์เพื่อลดจำนวนคำขอจริง
 */

type GeocodeResult = { name: string; lat: number; lng: number };

type CacheEntry = { expiresAt: number; results: GeocodeResult[] };

// In-memory LRU-ish cache: key = normalized query, TTL 24 ชม., cap ขนาด 200
// รายการ (evict รายการเก่าสุดเมื่อเกิน) — อยู่ได้แค่ระดับ instance เดียว (serverless
// อาจมีหลาย instance พร้อมกัน) ซึ่งเพียงพอสำหรับลดโหลดของ scope ระดับจังหวัดเดียว
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const CACHE_MAX_ENTRIES = 200;
const cache = new Map<string, CacheEntry>();

function normalizeQuery(q: string): string {
  return q.trim().toLowerCase().replace(/\s+/g, " ");
}

function getFromCache(key: string): GeocodeResult[] | null {
  const entry = cache.get(key);
  if (!entry) return null;
  if (entry.expiresAt < Date.now()) {
    cache.delete(key);
    return null;
  }
  // ย้ายไปท้ายสุดของ Map เพื่อจำลองพฤติกรรม LRU (recently used)
  cache.delete(key);
  cache.set(key, entry);
  return entry.results;
}

function setCache(key: string, results: GeocodeResult[]) {
  if (cache.size >= CACHE_MAX_ENTRIES) {
    const oldestKey = cache.keys().next().value;
    if (oldestKey !== undefined) cache.delete(oldestKey);
  }
  cache.set(key, { expiresAt: Date.now() + CACHE_TTL_MS, results });
}

const THAILAND_BBOX = `${THAILAND_BOUNDS.minLng},${THAILAND_BOUNDS.minLat},${THAILAND_BOUNDS.maxLng},${THAILAND_BOUNDS.maxLat}`;

async function geocodeWithMaptiler(query: string): Promise<GeocodeResult[] | null> {
  if (!env.NEXT_PUBLIC_MAPTILER_KEY) return null;
  try {
    const url = `https://api.maptiler.com/geocoding/${encodeURIComponent(
      query
    )}.json?key=${env.NEXT_PUBLIC_MAPTILER_KEY}&language=th&bbox=${THAILAND_BBOX}&limit=5`;
    const res = await fetch(url);
    if (!res.ok) return null;
    const body = await res.json();
    const features = Array.isArray(body?.features) ? body.features : [];
    return features.map(
      (f: { place_name?: string; text?: string; geometry: { coordinates: [number, number] } }) => ({
        name: f.place_name ?? f.text ?? query,
        lng: f.geometry.coordinates[0],
        lat: f.geometry.coordinates[1],
      })
    );
  } catch {
    return null;
  }
}

// ตัวกันคำขอถี่เกินไปหา Nominatim แบบง่ายๆ ระดับ instance เดียว (best-effort —
// serverless อาจมีหลาย instance พร้อมกันจริง แต่ traffic ของเว็บนี้ต่ำมากพอที่จะ
// ไม่เป็นปัญหาในทางปฏิบัติ)
let lastNominatimCallAt = 0;

async function geocodeWithNominatim(query: string): Promise<GeocodeResult[]> {
  const elapsed = Date.now() - lastNominatimCallAt;
  if (elapsed < 1000) {
    await new Promise((resolve) => setTimeout(resolve, 1000 - elapsed));
  }
  lastNominatimCallAt = Date.now();

  const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(
    query
  )}&countrycodes=th&accept-language=th&limit=5`;
  const res = await fetch(url, {
    headers: {
      // Nominatim usage policy ต้องระบุตัวตนแอปจริง ไม่ใช่ User-Agent เริ่มต้นของ fetch
      "User-Agent": "kabinburisu-flood-relief-map/1.0 (contact: diwdev.th@gmail.com)",
    },
  });
  if (!res.ok) return [];
  const body: Array<{ display_name: string; lat: string; lon: string }> = await res.json();
  return body.map((r) => ({ name: r.display_name, lat: Number(r.lat), lng: Number(r.lon) }));
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const q = searchParams.get("q")?.trim();

  if (!q) {
    return NextResponse.json({ error: "กรุณาระบุคำค้นหา" }, { status: 400 });
  }
  if (q.length > 200) {
    return NextResponse.json({ error: "คำค้นหายาวเกินไป" }, { status: 400 });
  }

  const key = normalizeQuery(q);
  const cached = getFromCache(key);
  if (cached) {
    return NextResponse.json({ results: cached, cached: true });
  }

  let results = await geocodeWithMaptiler(q);
  if (!results || results.length === 0) {
    // MapTiler ไม่มีคีย์/ไม่ตอบ/ไม่พบผล — ใช้ Nominatim เป็นตัวสำรองยามฉุกเฉิน
    try {
      results = await geocodeWithNominatim(q);
    } catch {
      results = [];
    }
  }

  setCache(key, results);
  return NextResponse.json({ results });
}
