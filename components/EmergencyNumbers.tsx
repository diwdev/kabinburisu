type EmergencyNumber = {
  number: string;
  label: string;
};

const EMERGENCY_NUMBERS: EmergencyNumber[] = [
  { number: "1784", label: "ปภ. สายด่วนแจ้งภัยพิบัติ" },
  { number: "1669", label: "การแพทย์ฉุกเฉิน" },
  { number: "191", label: "ตำรวจ" },
  { number: "199", label: "ดับเพลิง" },
];

// TODO: ผู้ใช้ต้องกรอกเบอร์จริงของพื้นที่ — เบอร์สำนักงาน ปภ. จังหวัดปราจีนบุรี/
// ศูนย์ ปภ. เขตพื้นที่กบินทร์บุรี ยังไม่มีค่าจริงตรงนี้ ห้ามใส่เบอร์สมมติเด็ดขาด
const PROVINCIAL_DISASTER_OFFICE_NUMBER = "";

export default function EmergencyNumbers() {
  return (
    <section className="w-full max-w-2xl px-4 py-8 sm:px-6">
      <h2 className="text-xl font-bold text-zinc-900">เบอร์โทรฉุกเฉิน</h2>
      <ul className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {EMERGENCY_NUMBERS.map((item) => (
          <li key={item.number}>
            <a
              href={`tel:${item.number}`}
              className="flex flex-col items-center gap-1 rounded-xl border border-zinc-200 bg-white px-3 py-4 text-center shadow-sm transition hover:border-red-300 hover:bg-red-50"
            >
              <span className="text-2xl font-bold text-red-600">
                {item.number}
              </span>
              <span className="text-xs text-zinc-600">{item.label}</span>
            </a>
          </li>
        ))}
        <li>
          <div className="flex h-full flex-col items-center justify-center gap-1 rounded-xl border border-dashed border-zinc-300 bg-zinc-50 px-3 py-4 text-center">
            <span className="text-sm font-semibold text-zinc-400">
              {PROVINCIAL_DISASTER_OFFICE_NUMBER || "รอกรอกเบอร์"}
            </span>
            <span className="text-xs text-zinc-500">
              สนง. ปภ. จ.ปราจีนบุรี / กบินทร์บุรี
            </span>
          </div>
        </li>
      </ul>
    </section>
  );
}
