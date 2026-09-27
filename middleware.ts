import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { SUPABASE_URL_FOR_CLIENT, SUPABASE_ANON_KEY_FOR_CLIENT } from "@/lib/env";

/**
 * Refreshes the Supabase auth session cookie on every request, per
 * PLAN.md §5. Without this, sessions can silently expire in the middle of
 * a browsing session because Server Components can't write cookies.
 */
export async function middleware(request: NextRequest) {
  let response = NextResponse.next({ request });

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
          response = NextResponse.next({ request });
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
