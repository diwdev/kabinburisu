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
