alter table public.pins enable row level security;
alter table public.pins force row level security;
alter table public.rescue_units enable row level security;
alter table public.rescue_units force row level security; -- ไม่มี policy => เข้าถึงได้เฉพาะ service_role (bypass RLS)
alter table public.pin_status_history enable row level security;
alter table public.pin_status_history force row level security; -- ไม่มี policy => เขียนได้เฉพาะผ่าน trigger แบบ SECURITY DEFINER
alter table public.profiles enable row level security;
alter table public.profiles force row level security;

-- ระดับ 2 (เจ้าของ) + ระดับ 3 (หน่วยกู้ภัย): เห็นข้อมูลเต็มบนตารางหลัก
create policy pins_select_owner_or_rescue on public.pins for select
  using (auth.uid() = requester_id or public.is_rescue_unit());

create policy pins_insert_own on public.pins for insert
  with check (auth.uid() = requester_id);

create policy pins_update_owner_or_rescue on public.pins for update
  using (auth.uid() = requester_id or public.is_rescue_unit())
  with check (auth.uid() = requester_id or public.is_rescue_unit());

create policy pins_delete_owner_only on public.pins for delete
  using (auth.uid() = requester_id);

-- profiles: ผู้ใช้เห็นแถวตัวเอง, หน่วยกู้ภัยเห็นสถานะแบนได้เพื่อประกอบการตัดสินใจ
create policy profiles_select_self_or_rescue on public.profiles for select
  using (auth.uid() = id or public.is_rescue_unit());
-- ไม่มี policy สำหรับ insert/update จาก client: การสร้าง profile ทำผ่าน trigger เท่านั้น
-- การแบนทำได้เฉพาะ admin/service-role
