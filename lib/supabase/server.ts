import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { SUPABASE_URL_FOR_CLIENT, SUPABASE_ANON_KEY_FOR_CLIENT } from "@/lib/env";

/**
 * Server-side Supabase client for Server Components / Route Handlers.
 * Reads/writes the auth cookie via next/headers so the user's own session
 * (and therefore their RLS-scoped access) carries over server-side.
 */
export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient(
    SUPABASE_URL_FOR_CLIENT,
    SUPABASE_ANON_KEY_FOR_CLIENT,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          } catch {
            // Called from a Server Component that can't set cookies — safe to
            // ignore because middleware.ts refreshes the session on every request.
          }
        },
      },
    }
  );
}
