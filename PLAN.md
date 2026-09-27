# แผนพัฒนาเว็บไซต์แจ้งขอความช่วยเหลือน้ำท่วม จ.ปราจีนบุรี

## 1. บริบท / ทำไมต้องทำ

ตอนนี้จังหวัดปราจีนบุรีกำลังประสบปัญหาน้ำท่วม และบ้านของผู้ร้องขอเองก็ได้รับผลกระทบอยู่ในขณะนี้ โปรเจกต์นี้จะสร้างเว็บเครื่องมือขนาดเล็กที่ใช้งานได้จริง (ไม่ใช่แค่ต้นแบบ) โดยอิงรูปแบบการทำงานแบบ "หาดใหญ่ต้องรอด" (hatyaitongrod) ของไทย คือ: คนที่ต้องการความช่วยเหลือปักหมุดพร้อมระบุสิ่งที่ต้องการและเบอร์โทร → หน่วยกู้ภัยที่ผ่านการยืนยันตัวตนแล้วเห็นหมุดและเข้าไปช่วยเหลือ → ผู้ขอความช่วยเหลือลบหมุดทันทีเมื่อได้รับการช่วยเหลือแล้ว

นิยามของ "เสร็จ" สำหรับ MVP รอบแรก คือ: เว็บที่รองรับมือถือเป็นหลักต้องขึ้นบน URL สาธารณะได้จริง, ครัวเรือนที่ประสบน้ำท่วมจริงในปราจีนบุรีสามารถ login ด้วย Google แล้วปักหมุดพร้อมระบุความต้องการ+เบอร์โทรได้ภายในไม่ถึงนาที, มีบัญชีหน่วยกู้ภัยจำนวนหนึ่งที่ admin คัดเลือกเองสามารถเห็นรายละเอียดเต็มของหมุดและกดเปลี่ยนสถานะเป็น "ช่วยแล้ว" ได้, คนทั่วไปเห็นข้อมูลความต้องการแบบภาพรวม/ปัดพิกัดโดยไม่เห็นเบอร์โทรหรือที่อยู่ที่แม่นยำของใครเลย และทั้งหมดนี้ต้องรันด้วยค่าใช้จ่ายประมาณ 0 บาท เพื่อให้เปิดทิ้งไว้ได้ตลอดโดยไม่ต้องกังวลเรื่องบิล

## 2. ภาพรวมสถาปัตยกรรม (Architecture)

**Frontend/Backend**: แอป Next.js 14+ (App Router, TypeScript) ตัวเดียว deploy บน Vercel ไม่มี backend server แยก — ใช้ Next.js Route Handlers (`app/api/**/route.ts`) และ Server Actions เป็นชั้นเซิร์ฟเวอร์บางๆ ส่วนการควบคุมสิทธิ์เข้าถึงที่แท้จริงทั้งหมดอยู่ที่ Row Level Security (RLS) ของ Postgres ไม่ใช่ที่ชั้นนี้

**ข้อมูล/Auth**: ใช้ Supabase project เดียว ทำหน้าที่:
- **Auth**: Google OAuth ผ่าน Supabase Auth (`auth.users`), จัดการ session cookie ผ่าน `@supabase/ssr`
- **ฐานข้อมูล**: ตาราง Postgres `profiles`, `pins`, `rescue_units`, `pin_status_history` และ view สาธารณะชื่อ `pins_public`
- **RLS**: เปิดใช้และ *บังคับ* (force) กับทุกตาราง มีการควบคุมสิทธิ์ 3 ระดับ (สาธารณะ/authenticated requester/หน่วยกู้ภัยที่ยืนยันแล้ว) ทำผ่าน Postgres policy + ฟังก์ชัน SQL `is_rescue_unit()` โดยไม่พึ่งพา role flag ที่ส่งมาจากฝั่ง client เลย
- **Scheduled jobs**: ใช้ฟีเจอร์ Cron Jobs ของ Supabase เอง (pg_cron + pg_net) รัน SQL ตรงในฐานข้อมูลสำหรับงานหมุดหมดอายุ 48 ชม. และงานลบเบอร์โทรหลัง 7 วัน (ไม่ต้องใช้ Edge Function แยก เพราะ logic เป็นแค่ SQL `UPDATE` คำสั่งเดียว)

**การสื่อสารระหว่าง Frontend ↔ Supabase**: ฝั่ง browser คุยกับ Supabase **โดยตรง** ด้วย anon key + session ของผู้ใช้ (ผ่าน browser client ของ `@supabase/supabase-js`/`@supabase/ssr`) สำหรับการอ่านข้อมูลและ CRUD หมุดทั้งหมด — เป็นรูปแบบมาตรฐานของ Supabase และปลอดภัย *เพราะ* RLS เป็นด่านตรวจจริง ไม่ใช่แค่ `if` ใน API route ส่วน Next.js Route Handlers ภายใต้ `app/api/**` จะถูกใช้เฉพาะจุดที่ต้องมี logic ฝั่งเซิร์ฟเวอร์มากกว่า "รัน query ในนามผู้ใช้" เช่น การตรวจสอบด้วย zod ก่อน insert, rate limiting, proxy สำหรับ geocoding ค้นหาชื่อสถานที่ (ห้ามเรียก Nominatim/MapTiler geocoding ตรงจาก browser), และ endpoint เปลี่ยนสถานะของหน่วยกู้ภัย (ต้องตรวจสอบเพิ่มว่าการเปลี่ยนสถานะนั้นอนุญาตหรือไม่) ส่วน service-role key จะถูกใช้ **เฉพาะ** ภายใน Supabase Cron Jobs/SQL และ Server Action สำหรับ admin ที่เชื่อถือได้ 1 จุดเท่านั้น — ห้ามอยู่ใน code path ใดๆ ที่ถูก bundle ไปที่ client เด็ดขาด

**แผนที่**: MapLibre GL JS รันฝั่ง client ใน `app/map/MapView.tsx` render แผนที่พื้นฐานแบบ vector จาก tile provider ที่ hosted (ตัวหลัก) พร้อม PMTiles ที่ host เองเป็นตัวสำรอง (ดู §4) อ่านข้อมูลหมุดจาก `pins_public` (สำหรับสาธารณะ) หรือ `pins` (สำหรับเจ้าของ/หน่วยกู้ภัย ผ่าน query ที่ถูกจำกัดด้วย RLS)

## 3. Database Schema

`supabase/migrations/0001_init.sql`:

```sql
-- Profiles: 1:1 กับ auth.users, เก็บสถานะแบน
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  banned boolean not null default false,
  created_at timestamptz not null default now()
);

-- สร้างแถว profile อัตโนมัติเมื่อสมัคร
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id) values (new.id);
  return new;
end;
$$;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Allowlist หน่วยกู้ภัย (admin เพิ่มเอง ไม่มีสมัครเองได้)
create table public.rescue_units (
  id uuid primary key default gen_random_uuid(),
  email text not null unique,
  active boolean not null default true,
  added_by text,
  created_at timestamptz not null default now()
);

-- หมุด
create table public.pins (
  id uuid primary key default gen_random_uuid(),
  requester_id uuid not null references auth.users(id) on delete cascade,
  status text not null default 'active'
    check (status in ('active','stale','helped','closed','suspicious')),
  lat double precision not null check (lat between 5.0 and 21.0),
  lng double precision not null check (lng between 96.0 and 106.0),
  headcount int not null check (headcount > 0 and headcount <= 50),
  needs_food boolean not null default false,
  needs_medicine boolean not null default false,
  needs_medical_aid boolean not null default false,
  note text check (char_length(note) <= 500),
  phone text not null check (phone ~ '^0[0-9]{8,9}$'), -- ด่านกันเบื้องต้น การตรวจจริงอยู่ที่ zod + libphonenumber-js
  contact_name text check (char_length(contact_name) <= 100),
  last_confirmed_at timestamptz not null default now(),
  closed_at timestamptz,
  phone_purged_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index pins_status_idx on public.pins(status);
create index pins_requester_idx on public.pins(requester_id);

-- ประวัติการเปลี่ยนสถานะ (เขียนได้ผ่าน trigger เท่านั้น ห้าม client insert ตรง)
create table public.pin_status_history (
  id uuid primary key default gen_random_uuid(),
  pin_id uuid not null references public.pins(id) on delete cascade,
  old_status text,
  new_status text not null,
  changed_by uuid references auth.users(id),
  changed_at timestamptz not null default now()
);
```

`supabase/migrations/0002_functions_triggers.sql`:

```sql
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
```

`supabase/migrations/0003_rls.sql`:

```sql
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
```

`supabase/migrations/0004_public_view.sql`:

```sql
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
```

`supabase/migrations/0005_cron_jobs.sql`:

```sql
-- ต้องเปิด extension pg_cron และ pg_net ก่อน (ผ่าน Supabase Dashboard > Database > Extensions)
select cron.schedule(
  'mark-stale-pins', '0 * * * *', -- ทุกชั่วโมง
  $$ update public.pins set status = 'stale'
     where status = 'active' and last_confirmed_at < now() - interval '48 hours'; $$
);

select cron.schedule(
  'purge-phone-numbers', '0 3 * * *', -- ทุกวันเวลา 03:00
  $$ update public.pins set phone = null, phone_purged_at = now()
     where status = 'closed' and closed_at < now() - interval '7 days'
     and phone is not null; $$
);
```

หมายเหตุ: หมุดที่ถูกลบจริง (เจ้าของกดลบ) จะลบเบอร์โทรออกไปทั้งแถวอยู่แล้วโดยอัตโนมัติ — job ลบเบอร์หลัง 7 วันมีไว้ครอบคลุมเฉพาะกรณี "ปิดแล้วแต่ยังไม่ลบ" เท่านั้น

## 4. การรวมแผนที่ (Map Integration)

**Library**: MapLibre GL JS (npm package `maplibre-gl`) ใช้ตรงๆ (ไม่ต้องมี wrapper อย่าง react-map-gl สำหรับ scope นี้) ไว้ใน `app/map/MapView.tsx` (`"use client"`)

**Tile source — ตัวเลือกหลัก (ชื่อ provider จริง 1-2 เจ้า พร้อม free-tier ปัจจุบัน):**
- **MapTiler Cloud** (แนะนำเป็นตัวหลัก): free plan = 100,000 คำขอ API/tile ต่อเดือน, 5,000 map session ต่อเดือน, custom style ได้ 5 แบบ ไม่ต้องผูกบัตรเครดิต — แต่ free plan จำกัดไว้เฉพาะการใช้แบบ non-commercial และต้องแสดง attribution โลโก้ MapTiler ด้วย รูปแบบ vector style JSON (`https://api.maptiler.com/maps/streets-v2/style.json?key=...`) นับตาม "session" ซึ่งประหยัดสำหรับเครื่องมือที่ scope แคบแค่จังหวัดเดียว
- **Stadia Maps** (ตัวเลือกสำรอง): free tier = 200,000 credit ต่อเดือน (รวม tile/geocoding/routing) แต่ระบุชัดว่าใช้ได้เฉพาะ "development, evaluation, และ non-commercial use" — องค์กรที่แสวงหากำไรหรือมีโฆษณาจะใช้ free tier นี้ไม่ได้ เนื่องจากเว็บนี้เป็นเครื่องมือช่วยเหลือชุมชนแบบไม่มีรายได้ น่าจะเข้าเงื่อนไขได้ แต่ควรยืนยันก่อนพึ่งพาระยะยาว

**PMTiles แบบ host เอง (ตัวสำรองที่ตัดค่าใช้จ่ายได้หมด)**: ดึงแผนที่พื้นฐานเฉพาะประเทศไทย (หรือเฉพาะภูมิภาคปราจีนบุรี) เป็น PMTiles ด้วยเครื่องมือ `pmtiles extract` ของ Protomaps จาก planet build สาธารณะ (build.protomaps.com) แล้วอัปโหลดไฟล์ `.pmtiles` ไฟล์เดียวขึ้น Cloudflare R2 (free tier: พื้นที่เก็บ 10GB-month, Class A operation 1 ล้านครั้ง/เดือน, Class B operation 10 ล้านครั้ง/เดือน, ไม่มีค่า egress เลย) แล้ว serve ผ่าน MapLibre protocol handler ของ package `pmtiles` (`maplibregl.addProtocol('pmtiles', ...)`) ชี้ไปที่ URL สาธารณะของ R2 วิธีนี้ไม่มีความเสี่ยงเรื่องบิลตามจำนวนคำขอ และไม่มีข้อจำกัดเรื่อง non-commercial เลย — แนะนำให้ใช้เป็นค่าเริ่มต้นระยะยาวเมื่อมีเวลาทำ โดยใช้ MapTiler เป็นทางลัดให้แผนที่ใช้งานได้เร็วที่สุดในวันแรก

**ชั้นแยก provider**: `lib/mapConfig.ts` export ฟังก์ชัน `getMapStyle()` ที่คืนค่า style URL ของ MapTiler หรือ style JSON ของ PMTiles ตัวใดตัวหนึ่งตาม env flag (`MAP_TILE_SOURCE=maptiler|pmtiles`) เพื่อให้สลับ provider ตอนโควตาใกล้เต็มทำได้แค่แก้ env บรรทัดเดียว ไม่ต้องเขียนโค้ดใหม่

**Attribution**: `attributionControl` ต้องแสดง "© OpenStreetMap contributors" เสมอ บวกกับ attribution ที่ provider ที่ใช้อยู่กำหนด (โลโก้ MapTiler หรือ "© Protomaps © OpenStreetMap" สำหรับ PMTiles) — เป็นข้อบังคับตามสัญญาอนุญาต ODbL ไม่ว่าจะเลือกทางไหน

**ค้นหาจากพิกัด** (`components/CoordinateSearchBox.tsx` กล่องลอยแบบเดียวกับในภาพตัวอย่าง "ค้นหาจากพิกัด (เช่น 7.005, 100.480)"): parse ข้อความอิสระแบบ `lat, lng` ตรวจสอบว่าเป็นตัวเลขทั้งคู่และอยู่ในกรอบพิกัดของประเทศไทยโดยประมาณ (lat 5.5–20.5, lng 97–105.7) ก่อนสั่ง `map.flyTo`

**ค้นหาจากชื่อสถานที่** (`components/PlaceSearchBox.tsx` + `app/api/geocode/route.ts`): ฝั่ง browser จะไม่เรียก geocoder ตรงเด็ดขาด แต่เรียก Route Handler ตัวนี้แทน ซึ่งจะ proxy ไปที่ MapTiler Geocoding API (ใช้ key/โควตาเดียวกัน bias พิกัดในกรอบประเทศไทย, `language=th`) เป็นตัวหลัก และมี Nominatim public API เป็นตัวสำรองยามฉุกเฉิน — แต่ policy การใช้งานของ Nominatim จำกัดไว้ที่ 1 คำขอ/วินาที ต้องใส่ User-Agent ที่ระบุตัวตนจริง และห้ามเรียกแบบ "systematic" ดังนั้น proxy ตัวนี้ต้อง cache ผลลัพธ์ (เช่น in-memory LRU key ตาม query ที่ normalize แล้ว TTL 24 ชม.) และห้ามเปิดให้ client เรียกตรงเด็ดขาด

**มุมมองเริ่มต้น**: `lib/constants.ts` export `PRACHINBURI_CENTER = { lat: 14.0509, lng: 101.3672 }` (ตัวเมืองปราจีนบุรี) และ `DEFAULT_ZOOM = 10` ใช้เป็นค่า `center`/`zoom` เริ่มต้นของ `MapView` เพื่อให้เปิดแผนที่มาก็โฟกัสที่จังหวัดนี้เลย

## 5. โมเดล Auth และ Role

- ตั้งค่า Google OAuth ผ่าน Supabase Dashboard → Authentication → Providers → Google (สร้าง OAuth client ใน Google Cloud Console, redirect URI คือ `https://<project>.supabase.co/auth/v1/callback`)
- ฝั่ง Next.js ใช้ `@supabase/ssr`: `lib/supabase/client.ts` (browser client, ใช้ anon key), `lib/supabase/server.ts` (server client อ่าน/เขียน auth cookie ใน Server Component/Route Handler), `middleware.ts` refresh session cookie ทุก request
- `app/auth/callback/route.ts` แลก OAuth code เป็น session แล้ว redirect ไป `/map`
- **ห้ามเชื่อ role field ที่มาจาก client เด็ดขาด** ฝั่ง UI จะเรียก Postgres RPC `get_my_role()` (ที่ wrap `is_rescue_unit()`) เพื่อใช้ตัดสินใจว่าจะ*แสดง*ปุ่มไหนเท่านั้น ส่วนการกระทำที่มีสิทธิ์พิเศษจริงๆ ทุกอันจะถูก RLS ตรวจซ้ำเสมอ ไม่ว่า UI จะแสดงอะไรไว้ก็ตาม
- **การดูแล allowlist หน่วยกู้ภัย (admin คัดเลือกเอง ไม่มีสมัครเอง)**: ในคืนเปิดตัว ผู้ใช้ (diwdev.th@gmail.com ในฐานะ admin คนเดียว) จะจัดการตาราง `rescue_units` โดยตรงผ่าน Supabase Studio Table Editor/SQL editor — ไม่ต้องเขียนโค้ดเลย ทางเลือกเสริมในภายหลังคือทำหน้า `app/admin/rescue-units/page.tsx` — หน้าที่ล็อกไว้โดยเทียบอีเมลผู้ใช้ที่ login กับ `process.env.ADMIN_EMAIL`, ใช้ service-role client เฉพาะภายใน Server Action เท่านั้น (ไม่ถูกส่งไปที่ client bundle เด็ดขาด และป้องกันด้วย package `server-only` เพื่อให้ build fail ถ้ามีการ import ผิดที่ไปยัง client โดยไม่ตั้งใจ) — เพื่อเพิ่ม/ลบอีเมลใน allowlist โดยไม่ต้องแตะ SQL

## 6. รายละเอียดฟีเจอร์

**หน้าแรก** — `app/page.tsx`:
- `components/Header.tsx`: ชื่อเว็บ/โลโก้หมุด, ปุ่ม login (จงใจไม่ใช้ชื่อ/โลโก้ของ "hatyaitongrod" ซ้ำ — ดูหัวข้อ "สิ่งที่ต้องตัดสินใจเพิ่ม" ด้านล่าง)
- `components/HowToUse.tsx`: ขั้นตอนภาษาไทยแบบมีลำดับ (เข้าสู่ระบบด้วย Google → ปักหมุดตำแหน่ง → ระบุความต้องการ → ใส่เบอร์โทร → รอทีมกู้ภัย → ลบหมุดเมื่อได้รับความช่วยเหลือแล้ว)
- `components/EmergencyNumbers.tsx`: เบอร์ฉุกเฉินแบบ static — 1784 (ปภ. สายด่วนแจ้งภัยพิบัติ), 1669 (การแพทย์ฉุกเฉิน), 191 (ตำรวจ), 199 (ดับเพลิง) พร้อมช่องว่างสำหรับเบอร์สำนักงาน ปภ. จังหวัดปราจีนบุรี (ต้องให้ผู้ใช้กรอกเบอร์จริงเอง — จะไม่ใส่เบอร์สมมติในแผนนี้)
- ปุ่ม CTA → `/map`

**หน้าแผนที่** — `app/map/page.tsx` (server component shell) + `app/map/MapView.tsx` (client):
- `components/FilterBar.tsx`: dropdown "แสดงผล" (ดูทั้งหมด / ต้องการอาหาร / ต้องการยา / ต้องการความช่วยเหลือทางการแพทย์ / รอความช่วยเหลือ / ช่วยเหลือแล้ว) พร้อมปุ่ม Apply/ล้าง ตามรูปแบบในภาพตัวอย่าง
- `components/CoordinateSearchBox.tsx` และ `components/PlaceSearchBox.tsx` (ฟีเจอร์ค้นหาชื่อสถานที่เป็นของใหม่ที่ไม่มีในเว็บตัวอย่าง แต่อยู่ใน scope ของเรา)
- Marker วาดจาก MapLibre GeoJSON source แบบ `cluster: true`, สีตามสถานะ (active=แดง, stale=เทา, helped=เขียว) หมุดที่เป็น `suspicious`/`closed` จะถูกตัดออกจาก `pins_public` ตั้งแต่ต้นทาง คนทั่วไปจึงไม่มีทางได้รับข้อมูลนี้เลย
- คลิก marker แล้วตั้งค่า React state (id หมุดที่เลือก) เปิด `components/PinDetailSheet.tsx` เป็น overlay แบบ React ธรรมดา **ไม่ใช่** MapLibre HTML popup เพื่อให้ข้อความที่ผู้ใช้กรอกเองถูก escape อัตโนมัติผ่านกลไกของ JSX เสมอ (ดู §8 เรื่อง XSS)
- `PinDetailSheet.tsx` แสดง: badge สถานะ, จำนวนคน, ไอคอนความต้องการ, note, เวลา; แสดงเบอร์โทร+ตำแหน่งแม่นยำเฉพาะกรณีที่ query ที่เรียกมาส่งข้อมูลนั้นกลับมาจริงๆ เท่านั้น (คือกรณีเป็นหมุดของตัวเอง หรือ query แบบเห็นข้อมูลเต็มของหน่วยกู้ภัย — component นี้จะไม่มีทางได้รับข้อมูลเบอร์โทรที่ไม่ควรเห็น เพราะตัว query เองถูกจำกัดด้วย RLS ไว้แล้ว); ปุ่มแก้ไข/ลบแสดงเฉพาะเจ้าของ; ปุ่ม "เปลี่ยนสถานะ"/"รายงานว่าน่าสงสัย" แสดงเฉพาะหน่วยกู้ภัย; ปุ่ม "ยืนยันว่ายังต้องการความช่วยเหลืออยู่" สำหรับเจ้าของ (รีเซ็ต `last_confirmed_at` ทำให้หมุดไม่ค้างสถานะ stale)
- ปุ่มลอย "+ ปักหมุดขอความช่วยเหลือ" (มุมล่างขวา ใช้นิ้วโป้งกดถึง) เปิด `components/PinForm.tsx` (บังคับให้ login Google ก่อนถ้ายังไม่ได้ login): คลิกบนแผนที่เพื่อวางหมุด, ช่องกรอกจำนวนคน, checkbox อาหาร/ยา/การแพทย์, ช่อง note (จำกัด 500 ตัวอักษร), ช่องเบอร์โทร (`type=tel`), `components/ConsentCheckbox.tsx` (ข้อความความเป็นส่วนตัวสั้นๆ ต้องติ๊กก่อนกดส่งได้) → `POST /api/pins`
- แก้ไขใช้ `PinForm` ตัวเดียวกันแบบกรอกข้อมูลไว้ล่วงหน้า → `PATCH /api/pins/[id]` ลบ → dialog ยืนยัน → `DELETE /api/pins/[id]`
- การเปลี่ยนสถานะโดยหน่วยกู้ภัย → `PATCH /api/pins/[id]/status`
- การยืนยันว่ายังต้องการความช่วยเหลืออยู่ → `POST /api/pins/[id]/confirm`

## 7. มาตรการกันการใช้ผิด, หมุดค้าง และความเป็นส่วนตัว

- **จำกัด 3 หมุด active ต่อบัญชี**: trigger `enforce_max_active_pins()` (§3) — บังคับที่ระดับฐานข้อมูล ไม่ใช่แค่ตรวจที่ UI
- **หมุดหมดอายุอัตโนมัติหลัง 48 ชม.**: Supabase Cron Job `mark-stale-pins` (§3) รัน SQL `UPDATE` ทุกชั่วโมง ไม่ต้องใช้ Edge Function เพราะ logic เป็นคำสั่งเดียว
- **ลบเบอร์โทรหลัง 7 วัน**: Supabase Cron Job `purge-phone-numbers` (§3) รันทุกวัน
- **Rate limiting**: ใช้ Upstash Redis (`@upstash/ratelimit`) ในจุด `app/api/pins/route.ts` (POST), `app/api/pins/[id]/route.ts` (PATCH), และ `app/api/pins/[id]/status/route.ts` — แบบ sliding window key ด้วย `auth.uid()` (ก่อน login ใช้ IP แทน) เช่น จำกัด 5 คำขอ/5 นาทีสำหรับการสร้างหมุด, 10 คำขอ/5 นาทีสำหรับการแก้ไข ถ้าเกินจะตอบ 429 พร้อมข้อความภาษาไทย *(ควรยืนยันโควตา free-tier ปัจจุบันของ Upstash อีกครั้งตอนสร้างจริงก่อนกำหนดตัวเลข window สุดท้าย ถ้าไม่อยากพึ่ง service ภายนอกตัวที่ 3 เพิ่ม สามารถใช้ตาราง token-bucket บน Postgres เองแทนได้ ซึ่งเข้ากับ RLS ได้ดีอยู่แล้ว)*
- **กระบวนการแบน/ปักธง**: หน่วยกู้ภัยปักธงหมุดที่น่าสงสัยผ่าน endpoint เปลี่ยนสถานะ (`status='suspicious'`) ซึ่งจะถูกซ่อนจาก `pins_public` ทันทีด้วยเงื่อนไข `where` ของ view เอง ส่วนการแบนทั้งบัญชีทำได้เฉพาะ admin (`profiles.banned = true` ตั้งผ่าน Studio หรือ admin Server Action) ซึ่งจะ cascade ผ่าน `trg_cascade_ban` ปิดหมุดทั้งหมดของผู้ใช้คนนั้นทันที

## 8. แผนด้าน Security

**XSS**
- ห้ามใช้ `dangerouslySetInnerHTML` ที่ไหนในโค้ดเลย (บังคับด้วย ESLint rule `react/no-danger`)
- ข้อความ note/free-text ของหมุดจะถูก render ผ่าน JSX interpolation ปกติเท่านั้น (`{pin.note}`) ซึ่ง React จะ escape ให้อัตโนมัติ
- **การตัดสินใจที่ชัดเจน**: popup ของหมุดสร้างเป็น React component (`PinDetailSheet.tsx`) แทนที่จะใช้ `Popup.setHTML()` ของ MapLibre — เพราะ `setHTML` กับข้อความดิบของผู้ใช้คือช่องโหว่ XSS ถ้าจำเป็นต้องใช้ popup แบบ native ของ MapLibre ที่ไหนก็ตาม ต้องใช้ `setDOMContent` กับ text node เท่านั้น ห้ามใช้ `setHTML` กับข้อมูลผู้ใช้เด็ดขาด
- กำหนด CSP ใน `next.config.js` ฟังก์ชัน `headers()`: `default-src 'self'; img-src 'self' data: https://api.maptiler.com <โดเมน R2 ถ้าใช้>; connect-src 'self' https://*.supabase.co https://api.maptiler.com <Upstash REST endpoint>; style-src 'self' 'unsafe-inline'` (MapLibre GL JS ใส่ inline style ของตัวเอง สำหรับ canvas/control — เป็น trade-off ที่บันทึกไว้ตรงนี้) `; script-src 'self'; frame-ancestors 'none'`
- ทุก entry point ฝั่งเซิร์ฟเวอร์ (`app/api/pins/route.ts`, `[id]/route.ts`, `[id]/status/route.ts`, `[id]/confirm/route.ts`) ต้องตรวจ body ด้วย zod schema ใน `lib/validation/pin.ts` (`CreatePinSchema`, `UpdatePinSchema`, `StatusChangeSchema`) ก่อนแตะฐานข้อมูลเสมอ — แยกอิสระจากการตรวจฝั่ง client เพื่อเป็น defense in depth

**Broken access control / IDOR**
- เปิด RLS **และบังคับ** (`force row level security`) กับทุกตาราง — แม้แต่ role เจ้าของตารางก็ bypass ไม่ได้ มีแค่ `service_role` ตัวจริง (ที่มี attribute `bypassrls`) เท่านั้นที่ทำได้
- การอ่าน/เขียนของ requester ทุกจุดใช้ Supabase client ที่ผูกกับ session ของผู้ใช้เอง; service-role client (`lib/supabase/service.ts`) ถูก import เฉพาะภายใน Supabase Cron SQL และ admin Server Action ตัวเดียวเท่านั้น ป้องกันด้วย package `server-only` เพื่อให้ build fail ทันทีถ้ามีการ import ผิดที่ไปยัง client bundle
- Test case ที่ต้องรันด้วยมือก่อนเปิดใช้จริง:
  1. User A สร้างหมุด P1. User B ยิง `PATCH /api/pins/P1` แก้ note → ต้องได้ 403/ถูก RLS ปฏิเสธ, P1 ไม่เปลี่ยนแปลง
  2. User B ยิง `DELETE /api/pins/P1` → ต้องถูกปฏิเสธ
  3. ยิง PostgREST แบบไม่ login ตรงไปที่ตารางหลัก (`.../rest/v1/pins?select=*` ใช้แค่ anon key) → ต้องได้ข้อมูลว่างหรือ error; เห็นข้อมูลได้แค่ผ่าน `pins_public` เท่านั้น
  4. บัญชีที่ login แล้วแต่ไม่อยู่ใน allowlist ยิง `PATCH /api/pins/P1/status` → ต้องถูกปฏิเสธ
  5. query `pins_public` แบบ anon → ยืนยันว่าไม่มีคอลัมน์ `phone`/`contact_name` และ lat/lng ถูกปัดแล้ว ไม่ใช่ค่าแม่นยำ
  6. พยายาม insert หมุด active ตัวที่ 4 ของ user คนเดียว → ต้องได้ error `MAX_ACTIVE_PINS_EXCEEDED`
  7. ส่งเบอร์โทรรูปแบบผิดผ่าน API (ต้องได้ 400 จาก zod) แล้วลองอีกครั้งโดยข้าม API ไปเรียก Supabase ตรง (ต้องถูก DB check constraint บล็อกเช่นกัน)
  8. grep client bundle ที่ build แล้ว (`.next/static`) และทุก client component ใน `app/**` หา `SUPABASE_SERVICE_ROLE_KEY` → ต้องไม่เจอเลย

**CSRF**: session ของ Supabase Auth เก็บใน cookie แบบ httpOnly, `SameSite=Lax` ผ่าน `@supabase/ssr` endpoint ที่ทำ mutation จริง (`/api/pins`, `/api/pins/[id]`, `/api/pins/[id]/status`, `/api/pins/[id]/confirm`) เป็น Next.js Route Handler ธรรมดา ไม่ใช่ Server Action — กลไกตรวจ Origin header ของ Next.js ป้องกันให้เฉพาะ Server Action เท่านั้น จึง **ไม่** ครอบคลุมจุดนี้ สิ่งที่ป้องกันจริงคือ `SameSite=Lax`: browser จะไม่แนบ cookie แบบ Lax ให้กับคำขอ POST/PATCH/DELETE แบบข้าม site (ทั้ง `<form>` และ `fetch`/XHR) request ปลอมข้าม site จึงมาถึงโดยไม่มี session cookie แนบมา และถูกปฏิเสธในฐานะ anonymous โดย auth/RLS เอง ส่วน GET request จะไม่ mutate state เด็ดขาด (จุดเดียวที่กลไกตรวจ Origin ของ Server Action จะมีผลจริงคือ admin action เสริมใน §5 หากสร้างเป็น Server Action แทน Route Handler)

**การจัดการ secret/env**: `.env.local` (อยู่ใน .gitignore) เก็บ `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` (ปลอดภัยฝั่ง client), `SUPABASE_SERVICE_ROLE_KEY` (ฝั่งเซิร์ฟเวอร์เท่านั้น ห้ามขึ้นต้นด้วย `NEXT_PUBLIC_` เด็ดขาด), `MAPTILER_KEY` หรือ `NEXT_PUBLIC_MAPTILER_KEY` (key ของ MapTiler ปกติออกแบบให้ client เห็นได้อยู่แล้ว — ป้องกันผ่าน HTTP-referrer allowlist ใน dashboard ของ MapTiler จำกัดไว้เฉพาะโดเมน production), `ADMIN_EMAIL`, `UPSTASH_REDIS_REST_URL`/`TOKEN` (ฝั่งเซิร์ฟเวอร์เท่านั้น) ตั้งค่าแยกตาม environment ใน Vercel Project Settings; เก็บไฟล์ `.env.example` ไว้ใน repo แบบใส่ placeholder ว่างๆ

**Security headers** (`next.config.js` `headers()`): CSP (ด้านบน), `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy: geolocation=(self)` (จำเป็นเพราะฟีเจอร์ "ใช้ตำแหน่งของฉัน" สำหรับวางหมุดต้องขอสิทธิ์นี้)

**Mobile-first responsive**: เว็บต้องใช้งานได้ดีบนมือถือเป็นอุปกรณ์หลัก (คนขอความช่วยเหลือส่วนใหญ่จะใช้มือถือระหว่างน้ำท่วม) — ใช้ Tailwind CSS breakpoint, ออกแบบ control บนแผนที่ให้เหมาะกับมือถือ, ฟอร์มแบบ bottom-sheet ตามที่ระบุไว้ใน §6/§10

## 9. รายละเอียดค่าใช้จ่าย

| บริการ | Free tier | เหมาะกับ MVP แค่ไหน |
|---|---|---|
| Vercel Hobby | data transfer 100GB/เดือน, function invocation 1 ล้านครั้ง/เดือน | เพียงพอมากสำหรับเครื่องมือขอบเขตจังหวัดเดียว; เงื่อนไข Hobby กำหนดให้ใช้แบบ non-commercial/ส่วนตัว ซึ่งตรงกับโปรเจกต์นี้ |
| Supabase Free | DB 500MB, 50k MAU, egress 5GB, Edge Function 500k ครั้ง/เดือน | หมุดแต่ละแถวมีขนาดแค่ไม่กี่ KB หมุดหลักหมื่นก็ยังไม่ใกล้ 500MB ข้อควรระวัง: project แบบ free จะ pause ถ้าไม่มีการใช้งาน 7 วัน ช่วงน้ำท่วมจริงไม่มีปัญหานี้แน่นอน แต่ช่วงระหว่างเหตุการณ์อาจต้องเข้าไป unpause เองหรือตั้ง health-check ping เป็นระยะ |
| MapTiler free | 100k คำขอ tile/API + 5k map session ต่อเดือน | เพียงพอสบายๆ สำหรับ traffic ระดับจังหวัด; มีข้อจำกัดเรื่อง non-commercial |
| Stadia Maps free (ตัวเลือกสำรอง) | 200k credit ต่อเดือน | จำกัด non-commercial เช่นกัน |
| Cloudflare R2 (PMTiles สำรอง) | เก็บข้อมูล 10GB, Class A 1 ล้าน + Class B 10 ล้าน ครั้ง/เดือน, ไม่มีค่า egress เลย | PMTiles เฉพาะประเทศไทยมีขนาดต่ำกว่า 10GB มาก แนะนำให้เป็นค่าเริ่มต้นระยะยาวเพราะไม่มีข้อจำกัด non-commercial |
| Upstash Redis (rate limit) | Free tier (ควรยืนยันโควตาปัจจุบันตอนสร้างจริง) | ปริมาณ call ของ use case นี้น้อยมาก |
| โดเมน | เป็นทางเลือก; `*.vercel.app` ใช้ฟรี | โดเมนของตัวเอง (ประมาณ 300–500 บาท/ปี) เป็นแค่ของตกแต่ง ไม่จำเป็น |

**ค่าใช้จ่ายสุทธิที่คาดไว้: 0 บาท/เดือน** ที่ scale ระดับ MVP/จังหวัดเดียว ควรกลับมาประเมินใหม่เฉพาะเมื่อ: traffic ต่อเนื่องขึ้นไปถึงระดับพันครั้ง/วัน, DB ของ Supabase ใกล้ 500MB, หรือโปรเจกต์เริ่มมีลักษณะเชิงพาณิชย์/มีรายได้ ซึ่งจะขัดกับเงื่อนไข non-commercial ของ free tier ฝั่ง MapTiler/Stadia (เส้นทาง PMTiles/R2 ตัดความเสี่ยงข้อนี้ออกไปได้ทั้งหมด)

## 10. ลำดับการสร้าง / Milestone

1. Scaffold Next.js (TS, App Router, Tailwind, ESLint) + สร้าง Supabase project + `supabase/migrations/0001_init.sql` (ตาราง)
2. `0002_functions_triggers.sql`, `0003_rls.sql`, `0004_public_view.sql` — ทดสอบผ่าน SQL editor ก่อนที่จะมี frontend เลย
3. เชื่อม Auth: ตั้งค่า Google provider, `lib/supabase/client.ts` + `server.ts`, `middleware.ts`, `app/auth/callback/route.ts`, ปุ่ม login
4. แผนที่แบบอ่านอย่างเดียว: `app/map/page.tsx` + `MapView.tsx` render tile source ที่เลือกไว้ อ่านจาก `pins_public` มุมมองเริ่มต้นที่ปราจีนบุรี
5. การสร้างหมุด: `PinForm.tsx`, `lib/validation/pin.ts`, `app/api/pins/route.ts` (POST), checkbox consent, การตรวจเบอร์โทร
6. การจัดการหมุด: action ของเจ้าของใน `PinDetailSheet.tsx`, `app/api/pins/[id]/route.ts` (PATCH/DELETE), `app/api/pins/[id]/confirm/route.ts`
7. มุมมอง/เปลี่ยนสถานะของหน่วยกู้ภัย: เชื่อม RPC `get_my_role()`, path ข้อมูลแบบเต็ม, `app/api/pins/[id]/status/route.ts`, จัดการ allowlist ผ่าน Studio ก่อน (ทำ `app/admin/rescue-units/page.tsx` เป็นทางเลือกทีหลัง)
8. `0005_cron_jobs.sql` (หมดอายุ + ลบเบอร์โทร), rate limiting middleware, ตรวจสอบ ban cascade
9. รอบเสริมความปลอดภัย: CSP/headers ใน `next.config.js`, ยืนยันว่าไม่มี MapLibre HTML popup ไหนพ่วงข้อความผู้ใช้, รัน IDOR test checklist เต็มชุด (§8), ตรวจ guard ของ `server-only`, `npm audit`
10. เนื้อหาหน้าแรก: `HowToUse.tsx`, `EmergencyNumbers.tsx` (ใส่เบอร์จริงของปราจีนบุรี)
11. รอบตรวจ mobile responsiveness (ฟอร์มแบบ bottom-sheet, ปุ่มลอยที่นิ้วโป้งกดถึง, `env(safe-area-inset-bottom)`) + รัน Lighthouse แบบ mobile
12. Deploy ขึ้น Vercel, ตั้งค่า env var, ต่อโดเมนถ้าต้องการ, smoke test บน production

## 11. การตรวจสอบ (Verification)

- **RLS**: ทดสอบแต่ละ policy ด้วยมือผ่าน `set role authenticated; set request.jwt.claims = '{"sub":"...","email":"..."}'; select ...` ใน Supabase SQL editor (หรือ `supabase test db` แบบ local) ให้ครบทั้ง 3 ระดับในทุกตาราง
- **IDOR checklist**: รันทดสอบทั้ง 8 ข้อจาก §8 ซ้ำบน preview URL ที่ deploy จริง โดยใช้บัญชี Google ทดสอบจริง 2 บัญชี (บัญชี requester ธรรมดา 1 บัญชี และบัญชีที่อยู่ใน allowlist หน่วยกู้ภัย 1 บัญชี)
- **Mobile responsiveness**: ใช้ Chrome DevTools device emulation (iPhone SE, ความกว้างจอ Android ทั่วไป) + รัน Lighthouse mobile (เป้าหมาย Performance >80, Accessibility >90) และทดสอบด้วยมือบนมือถือจริงก่อนประกาศว่าพร้อมเปิดใช้ เพราะ use case นี้เร่งด่วนมาก
- **โควตา tile provider**: จับตาดู usage graph ใน dashboard ของ MapTiler/Stadia ใน 48 ชม.แรกหลังเปิดใช้ ถ้าใกล้เต็มโควตา ให้สลับ `MAP_TILE_SOURCE` ไปที่ PMTiles/R2 (สร้างเป็น config ที่สลับได้อยู่แล้วตาม §4)
- **Job หมดอายุ/ลบข้อมูล**: ทดสอบด้วยมือโดยปรับ `last_confirmed_at` ของหมุดทดสอบให้ย้อนหลังเกิน 48 ชม. และปรับ `closed_at` ของหมุดทดสอบให้ย้อนหลังเกิน 7 วัน แล้วรอ/สั่งรัน cron job ยืนยันว่าสถานะเปลี่ยนเป็น `stale` (และแสดงสีเทาบนแผนที่) และคอลัมน์เบอร์โทรถูกลบตามลำดับ
- **End-to-end**: เดินทดสอบด้วยมือแบบครบวงจร — login ด้วย Google → ปักหมุด → ยืนยันว่าเห็นแบบปัดหยาบในแท็บที่ยังไม่ login → login เป็นบัญชีหน่วยกู้ภัยทดสอบในอีก browser → ยืนยันว่าเห็นข้อมูลเต็ม+เปลี่ยนสถานะได้ → ทำเครื่องหมายช่วยแล้ว → เจ้าของกดลบ → ยืนยันว่าหายไปจากทุกที่
- **ทดสอบการปล่อยผ่านของ system context (ใหม่ จากการแก้ trigger ใน §3)**: รัน SQL ของ job หมดอายุด้วยมือกับหมุดทดสอบที่ตั้งเวลาย้อนหลังไว้ ยืนยันว่าสำเร็จ (ไม่เจอ `STATUS_TRANSITION_DENIED`); แบนบัญชีทดสอบแล้วยืนยันว่าหมุดของบัญชีนั้นเปลี่ยนเป็น `closed` จริง ไม่ใช่ cascade trigger ขว้าง error

## 12. คำถามเปิด/สิ่งที่ต้องตัดสินใจเพิ่ม (มาจากตอนวางแผน)

รายการนี้คือจุดที่ต้องตัดสินใจเองระหว่างร่างแผน — ควรยืนยัน/แก้ก่อนหรือระหว่างสร้างจริง:

1. **ชื่อแบรนด์**: แผนนี้จงใจไม่ใช้ชื่อหรือโลโก้ "hatyaitongrod" ซ้ำ เพราะเป็นเครื่องมือที่แยกต่างหาก ได้แรงบันดาลใจจากรูปแบบเดียวกัน ไม่ใช่การ rebrand — ให้เลือกชื่อ/ภาพลักษณ์ของตัวเอง
2. **สมมติฐานเรื่อง non-commercial**: free tier ของ MapTiler และ Stadia Maps จำกัดไว้เฉพาะการใช้แบบ non-commercial แผนนี้สมมติว่าเว็บไม่มีโฆษณา/รายได้เลย ถ้าเปลี่ยนแปลงเมื่อไหร่ ให้สลับไปใช้เส้นทาง PMTiles/R2 ที่ host เอง (§4) ซึ่งไม่มีข้อจำกัดนี้
3. **การตรวจเบอร์โทร**: DB check constraint (`^0[0-9]{8,9}$`) เป็นแค่ด่านกันเบื้องต้นแบบหลวมๆ ควรใช้คู่กับ `libphonenumber-js` (region `TH`) ใน zod schema เพื่อตรวจให้แม่นยำจริง
4. **Rate limiter**: เลือก Upstash Redis เป็นตัวจริงสำหรับ §7 ควรยืนยันโควตา free-tier ปัจจุบันอีกครั้งตอนสร้างจริง หรือจะเปลี่ยนไปใช้ตาราง token-bucket บน Postgres แทนถ้าไม่อยากพึ่ง service ภายนอกตัวที่ 3 เพิ่ม
5. **จุดศูนย์กลางแผนที่เริ่มต้น**: ตั้งไว้ที่ตัวเมืองปราจีนบุรี (14.0509, 101.3672) — ควรยืนยัน/ปรับให้ตรงกับอำเภอ/ตำบลที่ได้รับผลกระทบหนักที่สุดจริงๆ
6. **เบอร์ฉุกเฉิน**: เบอร์สายด่วนระดับประเทศ (1784/1669/191/199) ใส่ไว้แล้ว ส่วนเบอร์สำนักงาน ปภ. จังหวัดปราจีนบุรียังเป็นช่องว่างไว้ — ห้ามใส่เบอร์สมมติเด็ดขาด ให้กรอกเบอร์จริงก่อนเปิดใช้งาน
7. **ตัวเลข free-tier**: ตัวเลขโควตาของ MapTiler/Stadia/Supabase/R2/Vercel ใน §9 เป็นข้อมูล ณ ตอนที่ทำการค้นคว้าให้แผนนี้ (ก.ย. 2026) — ควรเช็คเงื่อนไขปัจจุบันของแต่ละ provider อีกครั้งก่อนเริ่มสร้างจริง เพราะเงื่อนไข free tier เปลี่ยนได้เสมอ
8. **Role ที่ pg_cron ใช้รัน**: การปล่อยผ่าน system context ที่เพิ่มเข้าไปใน §3 สมมติว่า pg_cron job รันด้วย role `postgres` (หรือ role ที่ไม่มี JWT ผู้ใช้ปนอยู่) — ควรยืนยัน role จริงที่ใช้รันใน Supabase project นี้ แล้วปรับเงื่อนไขให้ตรงถ้าไม่ตรงกัน
9. **Hosting: Vercel เป็นหลัก ไม่ใช้ k3s ในเฟสแรก (ตัดสินใจแล้ว 2026-09-27)**: ผู้ใช้มี k3s cluster ของตัวเอง (2 node, มี Traefik + cert-manager + Cloudflare Tunnel pattern พร้อมใช้อยู่แล้วจาก workload อื่น) และเสนอให้ใช้แทน Vercel เพราะกลัวเว็บล่มตอนคนเข้าเยอะ — แต่ตรวจแล้วพบว่า node ทั้ง 2 ตัวของ cluster นี้เป็น VPS ชุดเดียวกับที่รันงานอื่นของผู้ใช้อยู่แล้วทั้งหมด (รวม Ollama ที่เพิ่ง scale ลง 0 ไป) ถ้า kabinburisu ไปแชร์ VPS ชุดนี้ด้วย จะเสี่ยงแย่งทรัพยากรกับงานอื่นตอนโหลดพุ่ง ซึ่งเป็นความเสี่ยง "ล่ม" แบบเดียวกับที่กลัว ไม่ได้ดีขึ้น ส่วน Vercel (serverless, แยกเครื่องจาก VPS นี้โดยสิ้นเชิง, auto-scale) ทนโหลดพุ่งได้ดีกว่าอยู่แล้วในตัว — ตัดสินใจร่วมกับผู้ใช้ให้เดินหน้า **Vercel เป็นตัวหลัก** ต่อตามแผนเดิม เพื่อความเร็วในการเปิดใช้จริง ส่วน k3s (เช่น เป็น URL สำรองผ่าน Cloudflare Tunnel) เก็บไว้พิจารณาเป็นเฟส 2 หลังเว็บ live แล้วมีเวลา ไม่ใช่ก่อนเปิดตัว
