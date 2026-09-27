import "server-only";

/**
 * Server-only env vars. The `server-only` import above makes it a build-time
 * error for any client component to import this module by accident — see
 * PLAN.md §8 (same protection pattern as lib/supabase/service.ts).
 */

function readEnv(name: string, value: string | undefined): string {
  if (!value) {
    console.warn(`[env] ${name} is not set — related features will not work until it is.`);
    return "";
  }
  return value;
}

export const serverEnv = {
  SUPABASE_SERVICE_ROLE_KEY: readEnv(
    "SUPABASE_SERVICE_ROLE_KEY",
    process.env.SUPABASE_SERVICE_ROLE_KEY
  ),
  ADMIN_EMAIL: readEnv("ADMIN_EMAIL", process.env.ADMIN_EMAIL),
  UPSTASH_REDIS_REST_URL: readEnv(
    "UPSTASH_REDIS_REST_URL",
    process.env.UPSTASH_REDIS_REST_URL
  ),
  UPSTASH_REDIS_REST_TOKEN: readEnv(
    "UPSTASH_REDIS_REST_TOKEN",
    process.env.UPSTASH_REDIS_REST_TOKEN
  ),
  // ไม่ขึ้นต้นด้วย NEXT_PUBLIC_ โดยตั้งใจ — getMapStyle() ถูกเรียกจาก server
  // component (app/map/page.tsx) แล้วส่ง style ที่ resolve แล้วลงไปเป็น prop ให้
  // client component แทน จึงไม่จำเป็นต้อง bundle ตัวแปรนี้ไปที่ browser
  MAP_TILE_SOURCE: (process.env.MAP_TILE_SOURCE || "maptiler") as "maptiler" | "pmtiles",
};
