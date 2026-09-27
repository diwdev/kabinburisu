import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Rate limiting interface used by app/api/pins/** route handlers.
 *
 * Implementation note (deviation from PLAN.md §7/§8, confirmed decision):
 * the plan's default was Upstash Redis (`@upstash/ratelimit`). This MVP uses
 * a plain Postgres token-bucket instead (see supabase/migrations/0006_rate_limit.sql)
 * so launch doesn't depend on a 3rd external service/account. The function
 * signature below is deliberately provider-agnostic so swapping back to
 * Upstash later only means rewriting the body of `checkRateLimit`, not any
 * call site.
 */

export type RateLimitResult = {
  success: boolean;
  /** Human-readable Thai message to show the user when success === false. */
  message: string;
};

const DEFAULT_MESSAGE =
  "คุณส่งคำขอบ่อยเกินไป กรุณารอสักครู่แล้วลองใหม่อีกครั้ง";

/**
 * @param supabase A request-scoped Supabase client (anon or authenticated) —
 *   the underlying RPC is a SECURITY DEFINER function, so no service-role
 *   key is needed here.
 * @param key Unique bucket key, e.g. `pin_create:${userId ?? ip}`.
 * @param maxRequests Bucket size (max requests per window).
 * @param windowSeconds Full refill window, in seconds.
 */
export async function checkRateLimit(
  supabase: SupabaseClient,
  key: string,
  maxRequests: number,
  windowSeconds: number
): Promise<RateLimitResult> {
  const { data, error } = await supabase.rpc("check_rate_limit", {
    p_key: key,
    p_max_tokens: maxRequests,
    p_refill_seconds: windowSeconds,
  });

  if (error) {
    // Fail OPEN on infra errors so a rate-limiter outage doesn't take down
    // the whole "ปักหมุดขอความช่วยเหลือ" flow during an actual flood —
    // but log loudly so it gets noticed.
    console.error("[rateLimit] check_rate_limit RPC failed:", error.message);
    return { success: true, message: "" };
  }

  return { success: Boolean(data), message: data ? "" : DEFAULT_MESSAGE };
}

/** Best-effort client identity for rate-limit keys before login (IP-based). */
export function getClientIp(request: Request): string {
  const forwardedFor = request.headers.get("x-forwarded-for");
  if (forwardedFor) return forwardedFor.split(",")[0].trim();
  return request.headers.get("x-real-ip") ?? "unknown";
}
