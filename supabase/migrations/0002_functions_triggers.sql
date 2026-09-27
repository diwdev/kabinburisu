-- เช็คระดับ 3: อีเมลใน JWT ของผู้เรียกอยู่ใน allowlist rescue_units ที่ active หรือไม่
create or replace function public.is_rescue_unit()
returns boolean language sql security definer set search_path = public stable as $$
  select exists (
    select 1 from public.rescue_units ru
    where ru.email = (auth.jwt() ->> 'email') and ru.active = true
  );
$$;

create or replace function public.is_banned(uid uuid)
returns boolean language sql security definer set search_path = public stable as $$
  select coalesce((select banned from public.profiles where id = uid), false);
$$;

-- จำกัดหมุด active สูงสุด 3 อันต่อบัญชี บังคับที่ฝั่งเซิร์ฟเวอร์ (ไม่ใช่แค่ UI)
-- นับทั้งสถานะ 'active' และ 'stale' รวมกัน เพราะหมุดที่แค่ค้าง (พลาดการยืนยันภายใน 48 ชม.)
-- ก็ยังถือเป็นคำขอที่ยังไม่ปิด ถ้านับแค่ 'active' บัญชีจะสะสมหมุด stale ที่ยังค้างอยู่ได้ไม่จำกัด
create or replace function public.enforce_max_active_pins()
returns trigger language plpgsql as $$
declare active_count int;
begin
  if new.status = 'active' then
    select count(*) into active_count from public.pins
      where requester_id = new.requester_id and status in ('active', 'stale')
      and id <> coalesce(new.id, '00000000-0000-0000-0000-000000000000');
    if active_count >= 3 then
      raise exception 'MAX_ACTIVE_PINS_EXCEEDED' using errcode = 'P0001';
    end if;
  end if;
  if public.is_banned(new.requester_id) then
    raise exception 'ACCOUNT_BANNED' using errcode = 'P0001';
  end if;
  return new;
end;
$$;
create trigger trg_max_active_pins
  before insert or update of status on public.pins
  for each row execute function public.enforce_max_active_pins();

-- จำกัดว่าใครเปลี่ยนสถานะเป็นอะไรได้บ้าง + log อัตโนมัติลง pin_status_history
-- สำคัญ: trigger นี้ต้องปล่อยผ่าน 2 กรณีที่ระบบเปลี่ยนสถานะเอง (system-initiated)
-- ซึ่งไม่ใช่ทั้ง "เจ้าของปิดหมุดตัวเอง" และ "หน่วยกู้ภัยเปลี่ยนสถานะ" คือ cron job
-- ที่ทำให้หมุดเป็น stale ทุกชั่วโมง (0005) และ trigger cascade_ban() (ที่ปิดหมุดของ
-- บัญชีที่ถูกแบน) ถ้าไม่มีทางผ่านตรงนี้ ทั้งสองจุดจะโดน ELSE บล็อกจนเกิด
-- STATUS_TRANSITION_DENIED ทำให้ฟีเจอร์หมุดหมดอายุอัตโนมัติและการปิดหมุดเมื่อโดนแบน
-- ใช้งานไม่ได้เงียบๆ เงื่อนไขด้านล่างเชื่อว่าการรันแบบไม่มี JWT ผู้ใช้ปนอยู่เลย (SQL ดิบ
-- ที่รันโดย pg_cron หรือ trigger แบบ SECURITY DEFINER ที่รันด้วย role ของระบบ/postgres)
-- คือ system context — ให้ยืนยันตอนสร้างจริงว่า pg_cron job รันด้วย role อะไรจริงๆ ใน
-- Supabase project นี้ (ปกติคือ `postgres`) แล้วปรับเงื่อนไขตามจริง
create or replace function public.validate_status_transition()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  caller uuid := auth.uid();
  is_system_context boolean :=
    current_setting('request.jwt.claims', true) is null  -- ไม่มี JWT ของผู้ใช้ปนอยู่
    or session_user in ('postgres', 'service_role');
begin
  if new.status = old.status then return new; end if;
  if is_system_context then
    -- การเปลี่ยนสถานะที่ระบบเป็นคนทำเอง (cron ทำให้ stale, cascade ban, admin รัน SQL)
  elsif new.status = 'closed' and old.requester_id = caller then
    -- เจ้าของปิดหมุดตัวเองได้ตลอด
  elsif public.is_rescue_unit() and new.status in ('helped','suspicious','active','stale','closed') then
    -- หน่วยกู้ภัยเปลี่ยนสถานะได้ทุกแบบ (เปิดใหม่, ทำเครื่องหมายช่วยแล้ว, ปักธงว่าน่าสงสัย)
  else
    raise exception 'STATUS_TRANSITION_DENIED' using errcode = 'P0001';
  end if;
  if new.status = 'closed' then new.closed_at = now(); end if;
  insert into public.pin_status_history(pin_id, old_status, new_status, changed_by)
    values (new.id, old.status, new.status, caller);
  return new;
end;
$$;
create trigger trg_validate_status_transition
  before update of status on public.pins
  for each row execute function public.validate_status_transition();

-- แบนแล้วปิดหมุดทั้งหมดของบัญชีนั้นให้อัตโนมัติ
create or replace function public.cascade_ban()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.banned = true and old.banned = false then
    update public.pins set status = 'closed', closed_at = now()
      where requester_id = new.id and status <> 'closed';
  end if;
  return new;
end;
$$;
create trigger trg_cascade_ban
  after update of banned on public.profiles
  for each row execute function public.cascade_ban();

-- หมายเหตุผู้ช่วยสร้าง: ฟังก์ชันนี้ไม่มี SQL ตัวอย่างอยู่ใน PLAN.md (มีแค่ถูกอ้างถึงชื่อ
-- ใน §5/§10 ว่า "RPC get_my_role() ที่ wrap is_rescue_unit()") จึงเขียนขึ้นใหม่ตรงนี้ให้
-- ตรงตามคำอธิบายในแผน — ใช้เพื่อให้ฝั่ง UI *แสดง* ปุ่มที่เหมาะสมเท่านั้น ไม่ใช่ด่าน
-- ความปลอดภัยจริง (ด่านจริงคือ RLS policy ที่เรียก is_rescue_unit() ตรงในตัว policy เอง
-- เสมอ ไม่ว่า client จะส่งอะไรมาก็ตาม)
create or replace function public.get_my_role()
returns text language sql security definer set search_path = public stable as $$
  select case
    when public.is_rescue_unit() then 'rescue_unit'
    when auth.uid() is not null then 'requester'
    else 'anonymous'
  end;
$$;
grant execute on function public.get_my_role() to anon, authenticated;
