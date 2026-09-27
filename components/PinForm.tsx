"use client";

import { useState } from "react";
import ConsentCheckbox from "@/components/ConsentCheckbox";
import type { MergedPin } from "@/lib/types";

type PinFormProps = {
  mode: "create" | "edit";
  coords: { lat: number; lng: number };
  initialPin?: MergedPin;
  onClose: () => void;
  onSubmitted: () => void;
  onPickLocationAgain?: () => void;
};

type FormState = {
  headcount: string;
  needsFood: boolean;
  needsMedicine: boolean;
  needsMedicalAid: boolean;
  note: string;
  phone: string;
  contactName: string;
  consent: boolean;
};

const initialState = (initialPin?: MergedPin): FormState => ({
  headcount: initialPin ? String(initialPin.headcount) : "1",
  needsFood: initialPin?.needsFood ?? false,
  needsMedicine: initialPin?.needsMedicine ?? false,
  needsMedicalAid: initialPin?.needsMedicalAid ?? false,
  note: initialPin?.note ?? "",
  phone: initialPin?.phone ?? "",
  contactName: initialPin?.contactName ?? "",
  // แก้ไขไม่ต้องติ๊ก consent ใหม่ (ติ๊กไปแล้วตอนสร้างครั้งแรก)
  consent: Boolean(initialPin),
});

/**
 * ฟอร์มปักหมุด/แก้ไขหมุด (§6). ใช้ตัวเดียวกันทั้งสร้างและแก้ไข — โหมดแก้ไขจะกรอกข้อมูล
 * ไว้ล่วงหน้าและไม่ให้ขยับตำแหน่งหมุด (เปลี่ยนตำแหน่งได้แค่ตอนสร้างใหม่)
 */
export default function PinForm({
  mode,
  coords,
  initialPin,
  onClose,
  onSubmitted,
  onPickLocationAgain,
}: PinFormProps) {
  const [form, setForm] = useState<FormState>(initialState(initialPin));
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  function update<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErrorMsg(null);

    const headcountNum = Number(form.headcount);
    if (!Number.isInteger(headcountNum) || headcountNum < 1) {
      setErrorMsg("กรุณากรอกจำนวนคนเป็นจำนวนเต็มอย่างน้อย 1 คน");
      return;
    }
    if (mode === "create" && !form.consent) {
      setErrorMsg("ต้องติ๊กยอมรับเงื่อนไขความเป็นส่วนตัวก่อนส่งข้อมูล");
      return;
    }

    const payload = {
      lat: coords.lat,
      lng: coords.lng,
      headcount: headcountNum,
      needsFood: form.needsFood,
      needsMedicine: form.needsMedicine,
      needsMedicalAid: form.needsMedicalAid,
      note: form.note || undefined,
      phone: form.phone,
      contactName: form.contactName || undefined,
      ...(mode === "create" ? { consent: true } : {}),
    };

    setSubmitting(true);
    try {
      const url =
        mode === "create" ? "/api/pins" : `/api/pins/${initialPin!.id}`;
      const res = await fetch(url, {
        method: mode === "create" ? "POST" : "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setErrorMsg(body?.error ?? "เกิดข้อผิดพลาด กรุณาลองใหม่อีกครั้ง");
        return;
      }
      onSubmitted();
    } catch {
      setErrorMsg("เชื่อมต่อไม่สำเร็จ กรุณาตรวจสอบอินเทอร์เน็ตแล้วลองใหม่");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center">
      <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-t-2xl bg-white p-5 pb-[calc(env(safe-area-inset-bottom)+1.25rem)] shadow-xl sm:rounded-2xl">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-bold text-zinc-900">
            {mode === "create" ? "ปักหมุดขอความช่วยเหลือ" : "แก้ไขหมุด"}
          </h2>
          <button
            onClick={onClose}
            aria-label="ปิด"
            className="rounded-full p-2 text-zinc-500 hover:bg-zinc-100"
          >
            ✕
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <p className="text-sm font-medium text-zinc-700">ตำแหน่ง</p>
            <p className="mt-1 text-sm text-zinc-500">
              {coords.lat.toFixed(5)}, {coords.lng.toFixed(5)}
            </p>
            {mode === "create" && onPickLocationAgain && (
              <button
                type="button"
                onClick={onPickLocationAgain}
                className="mt-1 text-sm font-medium text-red-600 underline"
              >
                เลือกตำแหน่งใหม่บนแผนที่
              </button>
            )}
          </div>

          <label className="block">
            <span className="text-sm font-medium text-zinc-700">
              จำนวนคน
            </span>
            <input
              type="number"
              inputMode="numeric"
              min={1}
              max={50}
              required
              value={form.headcount}
              onChange={(e) => update("headcount", e.target.value)}
              className="mt-1 w-full rounded-lg border border-zinc-300 px-3 py-2 text-base"
            />
          </label>

          <fieldset>
            <legend className="text-sm font-medium text-zinc-700">
              ความต้องการ
            </legend>
            <div className="mt-2 flex flex-wrap gap-3">
              <label className="flex items-center gap-2 text-sm text-zinc-700">
                <input
                  type="checkbox"
                  checked={form.needsFood}
                  onChange={(e) => update("needsFood", e.target.checked)}
                  className="h-4 w-4 rounded border-zinc-300 text-red-600"
                />
                อาหาร/น้ำดื่ม
              </label>
              <label className="flex items-center gap-2 text-sm text-zinc-700">
                <input
                  type="checkbox"
                  checked={form.needsMedicine}
                  onChange={(e) => update("needsMedicine", e.target.checked)}
                  className="h-4 w-4 rounded border-zinc-300 text-red-600"
                />
                ยา
              </label>
              <label className="flex items-center gap-2 text-sm text-zinc-700">
                <input
                  type="checkbox"
                  checked={form.needsMedicalAid}
                  onChange={(e) =>
                    update("needsMedicalAid", e.target.checked)
                  }
                  className="h-4 w-4 rounded border-zinc-300 text-red-600"
                />
                ความช่วยเหลือทางการแพทย์
              </label>
            </div>
          </fieldset>

          <label className="block">
            <span className="text-sm font-medium text-zinc-700">
              รายละเอียดเพิ่มเติม (ไม่เกิน 500 ตัวอักษร)
            </span>
            <textarea
              maxLength={500}
              rows={3}
              value={form.note}
              onChange={(e) => update("note", e.target.value)}
              className="mt-1 w-full rounded-lg border border-zinc-300 px-3 py-2 text-base"
              placeholder="เช่น มีผู้สูงอายุ/เด็กเล็ก, น้ำท่วมสูงประมาณ 1 เมตร"
            />
          </label>

          <label className="block">
            <span className="text-sm font-medium text-zinc-700">
              เบอร์โทรศัพท์
            </span>
            <input
              type="tel"
              required
              value={form.phone}
              onChange={(e) => update("phone", e.target.value)}
              placeholder="08xxxxxxxx"
              className="mt-1 w-full rounded-lg border border-zinc-300 px-3 py-2 text-base"
            />
            <span className="mt-1 block text-xs text-zinc-500">
              เบอร์โทรจะแสดงให้เฉพาะทีมกู้ภัยที่ผ่านการยืนยันตัวตันเห็นเท่านั้น
              และจะถูกลบอัตโนมัติ 7 วันหลังปิดหมุด
            </span>
          </label>

          <label className="block">
            <span className="text-sm font-medium text-zinc-700">
              ชื่อผู้ติดต่อ (ถ้ามี)
            </span>
            <input
              type="text"
              maxLength={100}
              value={form.contactName}
              onChange={(e) => update("contactName", e.target.value)}
              className="mt-1 w-full rounded-lg border border-zinc-300 px-3 py-2 text-base"
            />
          </label>

          {mode === "create" && (
            <ConsentCheckbox
              checked={form.consent}
              onChange={(v) => update("consent", v)}
            />
          )}

          {errorMsg && (
            <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
              {errorMsg}
            </p>
          )}

          <button
            type="submit"
            disabled={submitting}
            className="w-full rounded-full bg-red-600 py-3 text-base font-bold text-white transition hover:bg-red-700 disabled:opacity-50"
          >
            {submitting
              ? "กำลังบันทึก..."
              : mode === "create"
                ? "ส่งคำขอความช่วยเหลือ"
                : "บันทึกการแก้ไข"}
          </button>
        </form>
      </div>
    </div>
  );
}
