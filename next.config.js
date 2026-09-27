/** @type {import('next').NextConfig} */

// Content-Security-Policy is NOT set here anymore — it moved to middleware.ts.
// Next.js's own inline hydration scripts (the RSC payload push scripts every
// App Router page emits) need a per-request nonce in script-src to run under
// a strict CSP; next.config.js's headers() only runs once at build/boot and
// can't generate a fresh random nonce per request, so a CSP set here could
// never include one. Shipping `script-src 'self'` here with no nonce blocked
// those scripts outright in production (React error #412, whole app dead —
// this is why login/map appeared broken). See middleware.ts's buildCspHeader().
const nextConfig = {
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
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
