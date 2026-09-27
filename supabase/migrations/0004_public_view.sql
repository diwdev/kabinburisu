-- ระดับ 1 (สาธารณะ/anon): ข้อมูลแบบปัดหยาบ ไม่มีเบอร์โทร ไม่มีพิกัดแม่นยำ
-- view นี้ไม่ใช้ security_invoker จึงรันด้วยสิทธิ์เจ้าของ view (bypass RLS โดยตั้งใจ) —
-- เป็นกลไกที่จงใจให้ anon เห็นข้อมูลบางส่วนที่ปลอดภัยเท่านั้น
create view public.pins_public with (security_invoker = false) as
select
  id,
  status,
  round(lat::numeric, 2) as lat,   -- ปัดพิกัดให้คลาดเคลื่อนประมาณ 1.1 กม. เพื่อซ่อนที่อยู่จริง
  round(lng::numeric, 2) as lng,
  headcount,
  needs_food,
  needs_medicine,
  needs_medical_aid,
  created_at
from public.pins
where status not in ('closed', 'suspicious');

grant select on public.pins_public to anon, authenticated;
revoke all on public.pins from anon; -- anon ห้ามแตะตารางหลักตรงๆ เด็ดขาด
