import Link from "next/link";
import Header from "@/components/Header";
import HowToUse from "@/components/HowToUse";
import EmergencyNumbers from "@/components/EmergencyNumbers";

export default function Home() {
  return (
    <div className="flex min-h-screen flex-col bg-zinc-50">
      <Header />

      <main className="flex flex-1 flex-col items-center">
        <section className="w-full bg-gradient-to-b from-red-50 to-zinc-50 px-4 py-10 text-center sm:px-6">
          <h1 className="mx-auto max-w-xl text-2xl font-extrabold leading-tight text-zinc-900 sm:text-3xl">
            แจ้งขอความช่วยเหลือน้ำท่วม
            <br />
            อำเภอกบินทร์บุรี จ.ปราจีนบุรี
          </h1>
          <p className="mx-auto mt-3 max-w-md text-sm text-zinc-600 sm:text-base">
            ปักหมุดตำแหน่งของคุณ ระบุความต้องการและเบอร์โทร
            เพื่อให้ทีมกู้ภัยที่ผ่านการยืนยันตัวตนเข้าไปช่วยเหลือได้เร็วที่สุด
          </p>
          <Link
            href="/map"
            className="mt-6 inline-flex items-center gap-2 rounded-full bg-red-600 px-6 py-3 text-base font-bold text-white shadow-lg transition hover:bg-red-700"
          >
            📍 ไปที่แผนที่ / ปักหมุดขอความช่วยเหลือ
          </Link>
        </section>

        <HowToUse />
        <EmergencyNumbers />

        <footer className="w-full max-w-2xl px-4 py-8 text-center text-xs text-zinc-400 sm:px-6">
          kabinburisu — เครื่องมือช่วยเหลือชุมชนแบบไม่แสวงหากำไร
          ได้แรงบันดาลใจจากรูปแบบการทำงานของ &quot;หาดใหญ่ต้องรอด&quot;
        </footer>
      </main>
    </div>
  );
}
