import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { checkRateLimit } from "@/lib/rateLimit";

type RouteParams = { params: Promise<{ id: string }> };

/**
 * POST /api/pins/[id]/confirm — เจ้าของยืนยันว่ายังต้องการความช่วยเหลืออยู่
 * รีเซ็ต last_confirmed_at เพื่อไม่ให้ Cron job "mark-stale-pins" (0005) ทำให้
 * หมุดกลายเป็น stale เมื่อครบ 48 ชม.
 *
 * หมายเหตุ: endpoint นี้แก้เฉพาะ last_confirmed_at ไม่แตะคอลัมน์ status เลย
 * โดยตั้งใจ — ถ้าหมุดหมดอายุกลายเป็น 'stale' ไปแล้ว การกดยืนยันจะรีเซ็ตนาฬิกาไว้
 * แต่จะไม่พลิกสถานะกลับเป็น 'active' ให้อัตโนมัติ เพราะ trigger
 * validate_status_transition (0002) ไม่อนุญาตให้เจ้าของเปลี่ยน stale -> active เอง
 * (อนุญาตแค่ปิดหมุดตัวเอง) การเปิดหมุดที่ stale กลับมาต้องให้หน่วยกู้ภัยกดแทน
 */
export async function POST(_request: Request, { params }: RouteParams) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "กรุณาเข้าสู่ระบบก่อน" }, { status: 401 });
  }

  const rateLimit = await checkRateLimit(supabase, `pin_confirm:${user.id}`, 10, 300);
  if (!rateLimit.success) {
    return NextResponse.json({ error: rateLimit.message }, { status: 429 });
  }

  const { data, error } = await supabase
    .from("pins")
    .update({ last_confirmed_at: new Date().toISOString() })
    .eq("id", id)
    .eq("requester_id", user.id)
    .select()
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: "ยืนยันไม่สำเร็จ" }, { status: 400 });
  }
  if (!data) {
    return NextResponse.json(
      { error: "ไม่พบหมุดนี้ หรือคุณไม่มีสิทธิ์ยืนยัน" },
      { status: 403 }
    );
  }

  return NextResponse.json({ pin: data });
}
