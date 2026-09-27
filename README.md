# kabinburisu

เว็บเครื่องมือขนาดเล็กสำหรับแจ้งขอความช่วยเหลือน้ำท่วม อำเภอกบินทร์บุรี
จังหวัดปราจีนบุรี — ครัวเรือนที่ประสบภัยปักหมุดพร้อมระบุความต้องการและเบอร์โทร
ทีมกู้ภัยที่ผ่านการยืนยันตัวตนแล้วเห็นหมุดและเข้าไปช่วยเหลือ
แล้วผู้ขอความช่วยเหลือลบหมุดทันทีเมื่อได้รับการช่วยเหลือแล้ว
ได้แรงบันดาลใจจากรูปแบบการทำงานของ "หาดใหญ่ต้องรอด"

สถาปัตยกรรม, DB schema, RLS policy, feature breakdown และการตัดสินใจด้าน
security ทั้งหมดอยู่ใน [`PLAN.md`](./PLAN.md) — ไฟล์นี้เป็นสเปกหลักของโปรเจกต์
โค้ดในนี้ implement ตามนั้นเกือบทั้งหมด ยกเว้นจุดที่ระบุไว้ชัดเจนว่าปรับเปลี่ยน
(เช่น rate limiting ใช้ Postgres token-bucket แทน Upstash Redis — ดูคอมเมนต์
บนสุดของ `supabase/migrations/0006_rate_limit.sql`)

## รันโปรเจกต์นี้ในเครื่อง

```bash
npm install
cp .env.example .env.local   # แล้วกรอกค่าจริงใน .env.local
npm run dev
```

เปิด [http://localhost:3000](http://localhost:3000)

ถ้ายังไม่กรอกค่าใน `.env.local` แอปจะยัง build/รันได้ปกติ แต่ฟีเจอร์ที่ต้องพึ่ง
Supabase (login, อ่าน/เขียนหมุด) และแผนที่ (ต้องใช้ MapTiler key) จะยังใช้งานจริง
ไม่ได้จนกว่าจะใส่ค่าจริง

## ตั้งค่า Supabase

รันไฟล์ SQL ใน `supabase/migrations/` ตามลำดับเลขไฟล์ (`0001` → `0006`) ผ่าน
Supabase SQL editor หรือ Supabase CLI แล้วเปิด extension `pg_cron`/`pg_net`
(Dashboard → Database → Extensions) ก่อนรัน `0005_cron_jobs.sql`/`0006_rate_limit.sql`
รายละเอียดเพิ่มเติมอยู่ใน PLAN.md §3, §5, §10

## Tech stack

Next.js 16 (App Router, TypeScript) · Tailwind CSS · Supabase (Postgres + Auth
+ RLS + pg_cron) · MapLibre GL JS · zod · libphonenumber-js
