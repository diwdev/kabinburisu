const STEPS = [
  "เข้าสู่ระบบด้วย Google",
  "ปักหมุดตำแหน่ง",
  "ระบุความต้องการ",
  "ใส่เบอร์โทร",
  "รอทีมกู้ภัย",
  "ลบหมุดเมื่อได้รับความช่วยเหลือแล้ว",
];

export default function HowToUse() {
  return (
    <section className="w-full max-w-2xl px-4 py-8 sm:px-6">
      <h2 className="text-xl font-bold text-zinc-900">วิธีใช้งาน</h2>
      <ol className="mt-4 space-y-3">
        {STEPS.map((step, i) => (
          <li key={step} className="flex items-start gap-3">
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-red-600 text-sm font-bold text-white">
              {i + 1}
            </span>
            <span className="pt-0.5 text-base text-zinc-700">{step}</span>
          </li>
        ))}
      </ol>
    </section>
  );
}
