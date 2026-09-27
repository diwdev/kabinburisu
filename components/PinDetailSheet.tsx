"use client";

import { useState } from "react";
import type { MergedPin, PinStatus } from "@/lib/types";

type PinDetailSheetProps = {
  pin: MergedPin;
  currentUserId: string | null;
  role: "anonymous" | "requester" | "rescue_unit";
  onClose: () => void;
  onEdit: () => void;
  onChanged: () => void;
};

const STATUS_LABEL: Record<PinStatus, string> = {
  active: "รอความช่วยเหลือ",
  stale: "รอยืนยันอีกครั้ง (หมดอายุ 48 ชม.)",
  helped: "ช่วยเหลือแล้ว",
  closed: "ปิดแล้ว",
  suspicious: "ถูกปักธงว่าน่าสงสัย",
};

const STATUS_BADGE_CLASS: Record<PinStatus, string> = {
  active: "bg-red-100 text-red-700",
  stale: "bg-zinc-200 text-zinc-600",
  helped: "bg-green-100 text-green-700",
  closed: "bg-zinc-200 text-zinc-500",
  suspicious: "bg-amber-100 text-amber-700",
};

/**
 * แผงรายละเอียดหมุด — เป็น React component ธรรมดา ไม่ใช่ MapLibre HTML popup
 * (การตัดสินใจด้าน security ที่ระบุไว้ใน PLAN.md §6/§8: ข้อความอิสระของผู้ใช้ เช่น
 * note/ชื่อผู้ติดต่อ ต้อง render ผ่าน JSX interpolation ปกติเท่านั้นเพื่อให้ React
 * escape อัตโนมัติเสมอ — ห้ามใช้ Popup.setHTML() กับข้อมูลผู้ใช้เด็ดขาด)
 */
export default function PinDetailSheet({
  pin,
  currentUserId,
  role,
  onClose,
  onEdit,
  onChanged,
}: PinDetailSheetProps) {
  const [busy, setBusy] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const isOwner = pin.isFull && currentUserId !== null && pin.requesterId === currentUserId;
  const isRescueUnit = role === "rescue_unit";

  async function changeStatus(status: PinStatus) {
    setBusy(true);
    setErrorMsg(null);
    try {
      const res = await fetch(`/api/pins/${pin.id}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setErrorMsg(body?.error ?? "เปลี่ยนสถานะไม่สำเร็จ");
        return;
      }
      onChanged();
    } finally {
      setBusy(false);
    }
  }

  async function confirmStillNeeded() {
    setBusy(true);
    setErrorMsg(null);
    try {
      const res = await fetch(`/api/pins/${pin.id}/confirm`, { method: "POST" });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setErrorMsg(body?.error ?? "ยืนยันไม่สำเร็จ");
        return;
      }
      onChanged();
    } finally {
      setBusy(false);
    }
  }

  async function handleDelete() {
    setBusy(true);
    setErrorMsg(null);
    try {
      const res = await fetch(`/api/pins/${pin.id}`, { method: "DELETE" });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setErrorMsg(body?.error ?? "ลบไม่สำเร็จ");
        return;
      }
      onChanged();
      onClose();
    } finally {
      setBusy(false);
    }
  }

  const needs = [
    pin.needsFood && "อาหาร/น้ำดื่ม",
    pin.needsMedicine && "ยา",
    pin.needsMedicalAid && "ความช่วยเหลือทางการแพทย์",
  ].filter(Boolean) as string[];

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center">
      <div className="max-h-[85vh] w-full max-w-lg overflow-y-auto rounded-t-2xl bg-white p-5 pb-[calc(env(safe-area-inset-bottom)+1.25rem)] shadow-xl sm:rounded-2xl">
        <div className="mb-3 flex items-start justify-between">
          <span
            className={`rounded-full px-3 py-1 text-xs font-semibold ${STATUS_BADGE_CLASS[pin.status]}`}
          >
            {STATUS_LABEL[pin.status]}
          </span>
          <button
            onClick={onClose}
            aria-label="ปิด"
            className="rounded-full p-2 text-zinc-500 hover:bg-zinc-100"
          >
            ✕
          </button>
        </div>

        <dl className="space-y-2 text-sm text-zinc-700">
          <div className="flex justify-between">
            <dt className="text-zinc-500">จำนวนคน</dt>
            <dd className="font-medium">{pin.headcount} คน</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-zinc-500">ความต้องการ</dt>
            <dd className="text-right font-medium">
              {needs.length > 0 ? needs.join(", ") : "ไม่ระบุ"}
            </dd>
          </div>
          {pin.note && (
            <div>
              <dt className="text-zinc-500">รายละเอียด</dt>
              <dd className="mt-1 whitespace-pre-wrap font-medium">{pin.note}</dd>
            </div>
          )}
          <div className="flex justify-between">
            <dt className="text-zinc-500">แจ้งเมื่อ</dt>
            <dd className="font-medium">
              {new Date(pin.createdAt).toLocaleString("th-TH")}
            </dd>
          </div>

          {pin.isFull && (
            <>
              <div className="flex justify-between">
                <dt className="text-zinc-500">เบอร์โทร</dt>
                <dd className="font-medium">
                  {pin.phone ? (
                    <a href={`tel:${pin.phone}`} className="text-red-600 underline">
                      {pin.phone}
                    </a>
                  ) : (
                    "— (ถูกลบแล้วตามนโยบายความเป็นส่วนตัว)"
                  )}
                </dd>
              </div>
              {pin.contactName && (
                <div className="flex justify-between">
                  <dt className="text-zinc-500">ชื่อผู้ติดต่อ</dt>
                  <dd className="font-medium">{pin.contactName}</dd>
                </div>
              )}
              <div className="flex justify-between">
                <dt className="text-zinc-500">ตำแหน่งแม่นยำ</dt>
                <dd className="font-medium">
                  {pin.lat.toFixed(5)}, {pin.lng.toFixed(5)}
                </dd>
              </div>
              <div className="flex items-center justify-between">
                <dt className="text-zinc-500">นำทาง</dt>
                <dd>
                  {/* Google's official Maps URL scheme (ไม่ใช่ deep link เฉพาะแพลตฟอร์ม)
                      — บนมือถือเปิดแอป Google Maps ให้เองถ้าติดตั้งไว้ พร้อมพิกัดปลายทาง
                      ให้กด "Start"/"เริ่มนำทาง" เอง, ถ้าไม่มีแอปจะ fallback เปิดเว็บแทน */}
                  <a
                    href={`https://www.google.com/maps/dir/?api=1&destination=${pin.lat},${pin.lng}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="rounded-full bg-blue-600 px-3 py-1.5 text-xs font-bold text-white"
                  >
                    เปิด Google Maps นำทาง
                  </a>
                </dd>
              </div>
            </>
          )}
        </dl>

        {errorMsg && (
          <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
            {errorMsg}
          </p>
        )}

        <div className="mt-4 flex flex-col gap-2">
          {isOwner && (pin.status === "active" || pin.status === "stale") && (
            <button
              disabled={busy}
              onClick={confirmStillNeeded}
              className="w-full rounded-full bg-blue-600 py-2.5 text-sm font-bold text-white disabled:opacity-50"
            >
              ยืนยันว่ายังต้องการความช่วยเหลืออยู่
            </button>
          )}

          {isOwner && (
            <div className="flex gap-2">
              <button
                disabled={busy}
                onClick={onEdit}
                className="flex-1 rounded-full border border-zinc-300 py-2.5 text-sm font-medium text-zinc-700 disabled:opacity-50"
              >
                แก้ไข
              </button>
              {!confirmDelete ? (
                <button
                  disabled={busy}
                  onClick={() => setConfirmDelete(true)}
                  className="flex-1 rounded-full border border-red-300 py-2.5 text-sm font-medium text-red-600 disabled:opacity-50"
                >
                  ลบหมุด
                </button>
              ) : (
                <button
                  disabled={busy}
                  onClick={handleDelete}
                  className="flex-1 rounded-full bg-red-600 py-2.5 text-sm font-bold text-white disabled:opacity-50"
                >
                  ยืนยันลบ?
                </button>
              )}
            </div>
          )}

          {isRescueUnit && (
            <div className="rounded-xl border border-zinc-200 p-3">
              <p className="mb-2 text-xs font-semibold text-zinc-500">
                เปลี่ยนสถานะ (หน่วยกู้ภัย)
              </p>
              <div className="flex flex-wrap gap-2">
                <button
                  disabled={busy}
                  onClick={() => changeStatus("helped")}
                  className="rounded-full bg-green-600 px-3 py-1.5 text-xs font-bold text-white disabled:opacity-50"
                >
                  ช่วยเหลือแล้ว
                </button>
                <button
                  disabled={busy}
                  onClick={() => changeStatus("active")}
                  className="rounded-full bg-red-600 px-3 py-1.5 text-xs font-bold text-white disabled:opacity-50"
                >
                  เปิดใหม่ (ยังรอช่วย)
                </button>
                <button
                  disabled={busy}
                  onClick={() => changeStatus("suspicious")}
                  className="rounded-full bg-amber-500 px-3 py-1.5 text-xs font-bold text-white disabled:opacity-50"
                >
                  รายงานว่าน่าสงสัย
                </button>
                <button
                  disabled={busy}
                  onClick={() => changeStatus("closed")}
                  className="rounded-full border border-zinc-300 px-3 py-1.5 text-xs font-medium text-zinc-600 disabled:opacity-50"
                >
                  ปิดหมุด
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
