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
