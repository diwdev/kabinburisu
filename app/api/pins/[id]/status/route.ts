import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { StatusChangeSchema } from "@/lib/validation/pin";
import { checkRateLimit } from "@/lib/rateLimit";
import { mapPinError, mapPinErrorStatus } from "@/lib/pinErrors";

type RouteParams = { params: Promise<{ id: string }> };

/**
 * PATCH /api/pins/[id]/status — เปลี่ยนสถานะหมุด
 *
 * ใครเปลี่ยนเป็นอะไรได้บ้างถูกตัดสินใจจริงที่ trigger `validate_status_transition`
 * (0002_functions_triggers.sql) เอนด์พอยต์นี้แค่ zod-validate ค่า status ที่ส่งมา
 * แล้วปล่อยให้ DB เป็นคนตัดสิน — เพื่อไม่ให้ logic สิทธิ์ซ้ำซ้อนสองที่จนไม่ตรงกัน
 */
export async function PATCH(request: Request, { params }: RouteParams) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "กรุณาเข้าสู่ระบบก่อน" }, { status: 401 });
  }

  const rateLimit = await checkRateLimit(supabase, `pin_status:${user.id}`, 10, 300);
  if (!rateLimit.success) {
    return NextResponse.json({ error: rateLimit.message }, { status: 429 });
  }

  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return NextResponse.json({ error: "รูปแบบข้อมูลไม่ถูกต้อง" }, { status: 400 });
  }

  const parsed = StatusChangeSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "ข้อมูลไม่ถูกต้อง" },
      { status: 400 }
    );
  }

  const { data, error } = await supabase
    .from("pins")
    .update({ status: parsed.data.status })
    .eq("id", id)
    .select()
    .maybeSingle();

  if (error) {
    return NextResponse.json(
      { error: mapPinError(error.message) },
      { status: mapPinErrorStatus(error.message) }
    );
  }
  if (!data) {
    // แถวไม่ถูกกระทบเลย: RLS กรองออก (ไม่ใช่เจ้าของ/ไม่ใช่หน่วยกู้ภัย) หรือไม่มี id นี้จริง
    return NextResponse.json(
      { error: "ไม่พบหมุดนี้ หรือคุณไม่มีสิทธิ์เปลี่ยนสถานะ" },
      { status: 403 }
    );
  }

  return NextResponse.json({ pin: data });
}
