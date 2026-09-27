-- การตัดสินใจของผู้ใช้ (2026-09-27): ผู้ใช้ที่ login แล้วทุกคน (ไม่ต้องเป็น
-- หน่วยกู้ภัยที่ยืนยันตัวตน) ให้เห็นข้อมูลเต็มของทุกหมุด (เบอร์โทร + พิกัด
-- แม่นยำ) ได้ ยอมรับความเสี่ยงเรื่องความเป็นส่วนตัวที่เพิ่มขึ้นแล้ว (ใครก็ตาม
-- ที่สมัคร Google account ได้จะเห็นข้อมูลนี้ ไม่ใช่แค่อีเมลที่ admin คัดเลือก
-- ผ่าน allowlist rescue_units อีกต่อไป) — ดู PLAN.md §5 (อัปเดตพร้อมกัน)
--
-- เปลี่ยนเฉพาะสิทธิ์ "เห็นข้อมูล" (SELECT) เท่านั้น การแก้ไข/ลบหมุด
-- (pins_update_owner_or_rescue, pins_delete_owner_only) ยังจำกัดเฉพาะเจ้าของ
-- และหน่วยกู้ภัยเหมือนเดิมทุกอย่าง ไม่เปลี่ยนแปลง — โค้ดฝั่งเว็บก็ไม่ต้องแก้
-- เพราะ PinDetailSheet.tsx โชว์เบอร์โทร/พิกัดตาม pin.isFull (ผลจาก RLS query)
-- ล้วนๆ อยู่แล้ว ไม่มี role-based gating ซ้อนอีกชั้น

drop policy if exists pins_select_owner_or_rescue on public.pins;

create policy pins_select_authenticated on public.pins for select
  using (auth.uid() is not null);
