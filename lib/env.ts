/**
 * Client-safe env vars only — this module may end up in the browser bundle
 * (imported transitively by lib/supabase/client.ts), so it must NEVER contain
 * or re-export server-only secrets. Server-only vars (SUPABASE_SERVICE_ROLE_KEY,
 * ADMIN_EMAIL, UPSTASH_*, MAP_TILE_SOURCE) live in lib/env.server.ts instead,
 * which is guarded by the `server-only` package — see PLAN.md §8's
 * IDOR checklist item 8 ("grep client bundle for SUPABASE_SERVICE_ROLE_KEY →
 * must never appear").
 *
 * Values fall back to "" (never throw) so the app never hard-crashes at
 * import time just because a var is unset — see PLAN.md §8 "การจัดการ secret/env".
 */

function readEnv(name: string, value: string | undefined): string {
  if (!value) {
    if (typeof window === "undefined") {
      console.warn(`[env] ${name} is not set — related features will not work until it is.`);
    }
    return "";
  }
  return value;
}

export const env = {
  NEXT_PUBLIC_SUPABASE_URL: readEnv(
    "NEXT_PUBLIC_SUPABASE_URL",
    process.env.NEXT_PUBLIC_SUPABASE_URL
  ),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: readEnv(
    "NEXT_PUBLIC_SUPABASE_ANON_KEY",
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  ),
  NEXT_PUBLIC_MAPTILER_KEY: readEnv(
    "NEXT_PUBLIC_MAPTILER_KEY",
    process.env.NEXT_PUBLIC_MAPTILER_KEY
  ),
};

/**
 * createBrowserClient/createServerClient (@supabase/ssr) throw immediately at
 * construction time if given an empty URL/key — not just when a request is
 * actually made. That would hard-crash middleware.ts on *every* request
 * (including the homepage) whenever real Supabase credentials haven't been
 * filled in yet. These harmless placeholders let client construction always
 * succeed; actual Supabase calls will simply fail (network/DNS error) until
 * real values are supplied, which callers already handle as "not logged
 * in"/"no data" rather than crashing.
 */
export const SUPABASE_URL_FOR_CLIENT =
  env.NEXT_PUBLIC_SUPABASE_URL || "https://placeholder.supabase.co";
export const SUPABASE_ANON_KEY_FOR_CLIENT =
  env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "placeholder-anon-key";
