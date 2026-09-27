import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { SUPABASE_URL_FOR_CLIENT, SUPABASE_ANON_KEY_FOR_CLIENT } from "@/lib/env";

/**
 * Builds the CSP header value.
 *
 * History (kept as a note so this isn't "fixed" back and forth again):
 * this originally tried a per-request nonce on script-src, generated here in
 * middleware, relying on Next.js automatically stamping that nonce onto its
 * own inline hydration scripts (the RSC payload push scripts every App
 * Router page emits). That does NOT work reliably on Next.js 16 with the
 * legacy `middleware.ts` convention — verified directly: the CSP header
 * carried a fresh nonce every request, but the actual inline <script> tags
 * in the rendered HTML never received a matching nonce attribute, so the
 * browser blocked them outright (React error #412, the entire client app
 * dead — this is why login/map both appeared broken in production). See
 * https://github.com/vercel/next.js/discussions/81703 — the Next.js team's
 * own read is that full automatic nonce-stamping of every dynamically
 * injected script isn't currently supported in the App Router.
 *
 * So: script-src uses 'unsafe-inline' here, the same accepted trade-off
 * already made for style-src below (MapLibre GL JS injects inline <style>
 * tags at runtime with no nonce hook either). This is a real, understood
 * reduction in CSP's defense-in-depth against inline-script XSS — it is NOT
 * where this app's actual XSS defense lives. That defense is: no
 * `dangerouslySetInnerHTML` anywhere (ESLint `react/no-danger: error`
 * enforces it) and all user-supplied text (pin notes, contact names) is only
 * ever rendered via normal JSX interpolation, which React escapes
 * automatically regardless of this CSP setting (PLAN.md §8).
 */
function buildCspHeader(): string {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  let supabaseConnectSrc = "https://*.supabase.co wss://*.supabase.co";
  if (supabaseUrl) {
    try {
      const host = new URL(supabaseUrl).host;
      supabaseConnectSrc = `https://${host} wss://${host} ${supabaseConnectSrc}`;
    } catch {
      // keep the wildcard fallback
    }
  }

  const directives = [
    `default-src 'self'`,
    `script-src 'self' 'unsafe-inline'`,
    `style-src 'self' 'unsafe-inline'`,
    `img-src 'self' data: https://api.maptiler.com`,
    `connect-src 'self' ${supabaseConnectSrc} https://api.maptiler.com https://nominatim.openstreetmap.org`,
    `worker-src 'self' blob:`,
    `object-src 'none'`,
    `base-uri 'self'`,
    `frame-ancestors 'none'`,
  ];
  return directives.join("; ");
}

/**
 * Refreshes the Supabase auth session cookie on every request, per
 * PLAN.md §5. Without this, sessions can silently expire in the middle of
 * a browsing session because Server Components can't write cookies.
 */
export async function middleware(request: NextRequest) {
  const csp = buildCspHeader();

  // Every time `response` is (re)created below it must get the CSP header
  // re-applied — a plain `NextResponse.next({ request })` with nothing after
  // it would silently drop it.
  function freshResponse() {
    const res = NextResponse.next({ request });
    res.headers.set("Content-Security-Policy", csp);
    return res;
  }

  let response = freshResponse();

  const supabase = createServerClient(
    SUPABASE_URL_FOR_CLIENT,
    SUPABASE_ANON_KEY_FOR_CLIENT,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          response = freshResponse();
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  // Touching getUser() is what actually triggers a token refresh if needed.
  // Wrapped defensively: with placeholder credentials (no real Supabase
  // project configured yet) this call fails as a network/DNS error — it
  // must never crash every single page request because of that.
  try {
    await supabase.auth.getUser();
  } catch (err) {
    console.warn("[middleware] supabase.auth.getUser() failed:", err);
  }

  return response;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
