import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { UpdatePinSchema } from "@/lib/validation/pin";
import { checkRateLimit } from "@/lib/rateLimit";
import { mapPinError, mapPinErrorStatus } from "@/lib/pinErrors";

type RouteParams = { params: Promise<{ id: string }> };

/**
 * PATCH /api/pins/[id] — แก้ไขเนื้อหาหมุด (จำนวนคน/ความต้องการ/note/เบอร์โทร ฯลฯ)
 *
 * หมายเหตุ: RLS policy `pins_update_owner_or_rescue` (0003_rls.sql) อนุญาตให้ทั้ง
 * เจ้าของและหน่วยกู้ภัยอัปเดตแถวได้ (แยกตามสิทธิ์ระดับ "แถว" ไม่ใช่ "คอลัมน์") —
 * เอนด์พอยต์นี้จึงตรวจซ้ำเองว่าเป็นเจ้าของเท่านั้นถึงจะแก้ไข "เนื้อหา" ได้ ส่วน
 * หน่วยกู้ภัยให้ใช้ /api/pins/[id]/status แทน เป็น defense-in-depth เพิ่มเติมจาก RLS
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

  const rateLimit = await checkRateLimit(supabase, `pin_update:${user.id}`, 10, 300);
  if (!rateLimit.success) {
    return NextResponse.json({ error: rateLimit.message }, { status: 429 });
  }

  const { data: existing, error: fetchError } = await supabase
    .from("pins")
    .select("id, requester_id")
    .eq("id", id)
    .maybeSingle();

  if (fetchError || !existing) {
    return NextResponse.json({ error: "ไม่พบหมุดนี้" }, { status: 404 });
  }
  if (existing.requester_id !== user.id) {
    return NextResponse.json(
      { error: "แก้ไขได้เฉพาะหมุดของตัวเองเท่านั้น" },
      { status: 403 }
    );
  }

  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return NextResponse.json({ error: "รูปแบบข้อมูลไม่ถูกต้อง" }, { status: 400 });
  }

  const parsed = UpdatePinSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "ข้อมูลไม่ถูกต้อง" },
      { status: 400 }
    );
  }
  const input = parsed.data;

  const updatePayload: Record<string, unknown> = {};
  if (input.lat !== undefined) updatePayload.lat = input.lat;
  if (input.lng !== undefined) updatePayload.lng = input.lng;
  if (input.headcount !== undefined) updatePayload.headcount = input.headcount;
  if (input.needsFood !== undefined) updatePayload.needs_food = input.needsFood;
  if (input.needsMedicine !== undefined) updatePayload.needs_medicine = input.needsMedicine;
  if (input.needsMedicalAid !== undefined) updatePayload.needs_medical_aid = input.needsMedicalAid;
  if (input.note !== undefined) updatePayload.note = input.note || null;
  if (input.phone !== undefined) updatePayload.phone = input.phone;
  if (input.contactName !== undefined) updatePayload.contact_name = input.contactName || null;

  const { data, error } = await supabase
    .from("pins")
    .update(updatePayload)
    .eq("id", id)
    .select()
    .single();

  if (error) {
    return NextResponse.json(
      { error: mapPinError(error.message) },
      { status: mapPinErrorStatus(error.message) }
    );
  }

  return NextResponse.json({ pin: data });
}

/** DELETE /api/pins/[id] — ลบหมุด (เจ้าของเท่านั้น ตาม RLS policy pins_delete_owner_only) */
export async function DELETE(_request: Request, { params }: RouteParams) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "กรุณาเข้าสู่ระบบก่อน" }, { status: 401 });
  }

  const { data, error } = await supabase
    .from("pins")
    .delete()
    .eq("id", id)
    .select("id");

  if (error) {
    return NextResponse.json({ error: "ลบไม่สำเร็จ" }, { status: 400 });
  }
  if (!data || data.length === 0) {
    // RLS ปฏิเสธแบบเงียบ (ไม่ใช่เจ้าของ) หรือไม่พบหมุดนี้ — สองกรณีนี้ตอบเหมือนกัน
    // โดยตั้งใจ เพื่อไม่เปิดเผยว่าหมุด id นี้มีอยู่จริงหรือไม่ให้ผู้ไม่มีสิทธิ์รู้
    return NextResponse.json(
      { error: "ไม่พบหมุดนี้ หรือคุณไม่มีสิทธิ์ลบ" },
      { status: 404 }
    );
  }

  return NextResponse.json({ ok: true });
}
