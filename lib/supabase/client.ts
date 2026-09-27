"use client";

import { createBrowserClient } from "@supabase/ssr";
import { SUPABASE_URL_FOR_CLIENT, SUPABASE_ANON_KEY_FOR_CLIENT } from "@/lib/env";

/**
 * Browser Supabase client bound to the anon key + the user's own session.
 * Per PLAN.md §2, the browser talks to Supabase directly for reads/CRUD on
 * pins — RLS (not this client) is the real access-control boundary.
 */
export function createClient() {
  return createBrowserClient(SUPABASE_URL_FOR_CLIENT, SUPABASE_ANON_KEY_FOR_CLIENT);
}
