import "server-only";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { env } from "@/lib/env";
import { serverEnv } from "@/lib/env.server";

/**
 * Service-role Supabase client — bypasses RLS entirely.
 *
 * Per PLAN.md §2/§8: this client must be imported ONLY inside trusted
 * server-only code (a single admin Server Action, or ad-hoc scripts run by
 * an operator) and NEVER inside anything that could end up in a client
 * bundle. The `server-only` import above makes any accidental import from
 * client code a build-time error instead of a silent secret leak.
 *
 * It is intentionally NOT used by any of the app/api/** route handlers in
 * this MVP — those all operate as the calling user via lib/supabase/server.ts
 * so that RLS stays the real enforcement point. Supabase Cron Jobs (0005/0006
 * migrations) run raw SQL directly in Postgres and don't need this client at
 * all.
 */
export function createServiceClient() {
  if (!serverEnv.SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error(
      "SUPABASE_SERVICE_ROLE_KEY is not set — service-role client unavailable."
    );
  }
  return createSupabaseClient(
    env.NEXT_PUBLIC_SUPABASE_URL,
    serverEnv.SUPABASE_SERVICE_ROLE_KEY,
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    }
  );
}
