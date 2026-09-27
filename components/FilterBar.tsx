"use client";

import { useState } from "react";

export type MapFilter =
  | "all"
  | "food"
  | "medicine"
  | "medical"
  | "waiting"
  | "helped";

const OPTIONS: { value: MapFilter; label: string }[] = [
  { value: "all", label: "ดูทั้งหมด" },
  { value: "food", label: "ต้องการอาหาร" },
  { value: "medicine", label: "ต้องการยา" },
  { value: "medical", label: "ต้องการความช่วยเหลือทางการแพทย์" },
  { value: "waiting", label: "รอความช่วยเหลือ" },
  { value: "helped", label: "ช่วยเหลือแล้ว" },
];

type FilterBarProps = {
  value: MapFilter;
  onApply: (filter: MapFilter) => void;
};

export default function FilterBar({ value, onApply }: FilterBarProps) {
  const [pending, setPending] = useState<MapFilter>(value);

  return (
    <div className="pointer-events-auto flex max-w-full flex-wrap items-center gap-2 rounded-2xl bg-white px-3 py-2 shadow-lg">
      <label className="text-xs font-medium text-zinc-500" htmlFor="map-filter">
        แสดงผล
      </label>
      <select
        id="map-filter"
        value={pending}
        onChange={(e) => setPending(e.target.value as MapFilter)}
        className="min-w-0 max-w-[60vw] truncate rounded-full border border-zinc-200 bg-zinc-50 px-2 py-1 text-sm text-zinc-800"
      >
        {OPTIONS.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
      <button
        onClick={() => onApply(pending)}
        className="rounded-full bg-red-600 px-3 py-1 text-xs font-bold text-white"
      >
        ใช้ตัวกรอง
      </button>
      <button
        onClick={() => {
          setPending("all");
          onApply("all");
        }}
        className="rounded-full border border-zinc-200 px-3 py-1 text-xs font-medium text-zinc-500"
      >
        ล้าง
      </button>
    </div>
  );
}
