import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { CreatePinSchema } from "@/lib/validation/pin";
import { checkRateLimit, getClientIp } from "@/lib/rateLimit";
import { mapPinError, mapPinErrorStatus } from "@/lib/pinErrors";

/**
 * POST /api/pins — สร้างหมุดใหม่ (PLAN.md §6/§10 ขั้นที่ 5)
 *
 * ใช้ client ที่ผูกกับ session ของผู้ใช้เอง (ไม่ใช่ service-role) เพื่อให้
 * RLS + trigger ทั้งหมด (enforce_max_active_pins, is_banned) ยังเป็นด่านจริง
 * ไม่ใช่แค่ zod ชั้นนี้
 */
export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json(
      { error: "กรุณาเข้าสู่ระบบด้วย Google ก่อนปักหมุด" },
      { status: 401 }
    );
  }

  const rateLimitKey = `pin_create:${user.id ?? getClientIp(request)}`;
  const rateLimit = await checkRateLimit(supabase, rateLimitKey, 5, 300);
  if (!rateLimit.success) {
    return NextResponse.json({ error: rateLimit.message }, { status: 429 });
  }

  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return NextResponse.json({ error: "รูปแบบข้อมูลไม่ถูกต้อง" }, { status: 400 });
  }

  const parsed = CreatePinSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "ข้อมูลไม่ถูกต้อง" },
      { status: 400 }
    );
  }

  const input = parsed.data;

  const { data, error } = await supabase
    .from("pins")
    .insert({
      requester_id: user.id,
      lat: input.lat,
      lng: input.lng,
      headcount: input.headcount,
      needs_food: input.needsFood,
      needs_medicine: input.needsMedicine,
      needs_medical_aid: input.needsMedicalAid,
      note: input.note || null,
      phone: input.phone,
      contact_name: input.contactName || null,
    })
    .select()
    .single();

  if (error) {
    return NextResponse.json(
      { error: mapPinError(error.message) },
      { status: mapPinErrorStatus(error.message) }
    );
  }

  return NextResponse.json({ pin: data }, { status: 201 });
}
