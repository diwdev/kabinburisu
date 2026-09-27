/** @type {import('next').NextConfig} */

function supabaseConnectSrc() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!url) return "https://*.supabase.co wss://*.supabase.co";
  try {
    const host = new URL(url).host;
    return `https://${host} wss://${host} https://*.supabase.co wss://*.supabase.co`;
  } catch {
    return "https://*.supabase.co wss://*.supabase.co";
  }
}

// PLAN.md §8 CSP, adapted:
//  - Supabase host derived from NEXT_PUBLIC_SUPABASE_URL instead of hardcoded
//  - Upstash REST endpoint dropped: rate limiting is a Postgres RPC now (0006_rate_limit.sql),
//    called through the same Supabase host above, not a separate origin
//  - worker-src/blob: added (not in the plan's literal directive list) because
//    MapLibre GL JS loads its own tile-processing worker from a blob: URL —
//    without this the map fails to render under a strict CSP
function buildCsp() {
  const directives = [
    `default-src 'self'`,
    `img-src 'self' data: https://api.maptiler.com`,
    `connect-src 'self' ${supabaseConnectSrc()} https://api.maptiler.com https://nominatim.openstreetmap.org`,
    // MapLibre GL JS injects inline styles for its own canvas/controls — documented trade-off (PLAN.md §8)
    `style-src 'self' 'unsafe-inline'`,
    `script-src 'self'`,
    `worker-src 'self' blob:`,
    `frame-ancestors 'none'`,
  ];
  return directives.join("; ");
}

const nextConfig = {
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "Content-Security-Policy", value: buildCsp() },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          // ต้องเปิด geolocation=(self) เพราะฟีเจอร์ "ใช้ตำแหน่งของฉัน" สำหรับวางหมุด
          { key: "Permissions-Policy", value: "geolocation=(self)" },
        ],
      },
    ];
  },
};

module.exports = nextConfig;
