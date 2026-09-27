-- หมายเหตุ: migration นี้เป็นส่วนที่ "แทนที่" การใช้ Upstash Redis ที่ระบุไว้ใน PLAN.md §7/§8
-- ด้วย token-bucket ธรรมดาบน Postgres แทน เพื่อไม่ต้องพึ่ง service ภายนอกตัวที่ 3 ก่อนเปิดตัว
-- (ตามที่ระบุไว้เป็นทางเลือกใน PLAN.md §12 ข้อ 4) อินเทอร์เฟซฝั่งแอปยังคง swappable อยู่ที่
-- lib/rateLimit.ts เพื่อให้เปลี่ยนไปใช้ Upstash ทีหลังได้โดยไม่ต้องแก้ call site

-- ตารางเก็บ token bucket ต่อ key เดียว (key = เช่น "pin_create:<uid หรือ ip>")
create table public.rate_limit_buckets (
  bucket_key text primary key,
  tokens double precision not null,
  updated_at timestamptz not null default now()
);

-- force RLS แบบเดียวกับ pin_status_history: ไม่มี policy เลย => เข้าถึงตารางตรงๆ ไม่ได้
-- เข้าถึงได้เฉพาะผ่านฟังก์ชัน SECURITY DEFINER ด้านล่าง (รันด้วยสิทธิ์เจ้าของฟังก์ชัน/
-- superuser ที่รัน migration ซึ่ง bypass RLS ได้เหมือน pin_status_history)
alter table public.rate_limit_buckets enable row level security;
alter table public.rate_limit_buckets force row level security;

-- ฟังก์ชันตรวจ+หัก token แบบ atomic (ใช้ SELECT ... FOR UPDATE ล็อกแถวกันคำขอพร้อมกันแย่ง token)
-- คืนค่า true = อนุญาตให้ทำคำขอ, false = เกินโควตาแล้ว (ให้ฝั่งแอปตอบ 429)
-- p_max_tokens = ขนาด bucket สูงสุด (จำนวนคำขอสูงสุดต่อหน้าต่างเวลา)
-- p_refill_seconds = ระยะเวลาที่ bucket เติมเต็มใหม่ทั้งก้อน (วินาที) เช่น 300 = 5 นาที
create or replace function public.check_rate_limit(
  p_key text,
  p_max_tokens int,
  p_refill_seconds int
) returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tokens double precision;
  v_updated_at timestamptz;
  v_elapsed double precision;
  v_refill_rate double precision := p_max_tokens::double precision / p_refill_seconds::double precision; -- token/วินาที
  v_allowed boolean;
begin
  -- พยายามสร้างแถวใหม่ก่อน (คำขอแรกสุดของ key นี้) หักไป 1 token ทันที
  insert into public.rate_limit_buckets (bucket_key, tokens, updated_at)
    values (p_key, greatest(p_max_tokens - 1, 0), now())
    on conflict (bucket_key) do nothing;

  if found then
    return true;
  end if;

  -- key มีอยู่แล้ว: ล็อกแถวแล้วเติม token ตามเวลาที่ผ่านไปก่อนหักออก
  select tokens, updated_at into v_tokens, v_updated_at
    from public.rate_limit_buckets
    where bucket_key = p_key
    for update;

  v_elapsed := greatest(extract(epoch from (now() - v_updated_at)), 0);
  v_tokens := least(p_max_tokens::double precision, v_tokens + v_elapsed * v_refill_rate);

  if v_tokens >= 1 then
    v_tokens := v_tokens - 1;
    v_allowed := true;
  else
    v_allowed := false;
  end if;

  update public.rate_limit_buckets
    set tokens = v_tokens, updated_at = now()
    where bucket_key = p_key;

  return v_allowed;
end;
$$;

-- อนุญาตให้ anon และ authenticated เรียก RPC นี้ตรงๆ ได้ (ตัวฟังก์ชันเองเป็นคนคุม logic
-- ทั้งหมด ไม่ได้เปิดตารางให้เข้าถึงตรง) ฝั่ง Next.js Route Handler เรียกผ่าน supabase.rpc()
grant execute on function public.check_rate_limit(text, int, int) to anon, authenticated;

-- ล้าง bucket เก่าที่ไม่ได้ใช้งานแล้วทุกวัน กันตารางโตไม่จำกัด
select cron.schedule(
  'cleanup-rate-limit-buckets', '0 4 * * *', -- ทุกวันเวลา 04:00
  $$ delete from public.rate_limit_buckets where updated_at < now() - interval '1 day'; $$
);
