"use client";

import { useState } from "react";
import { THAILAND_BOUNDS } from "@/lib/constants";

type CoordinateSearchBoxProps = {
  onFound: (lat: number, lng: number) => void;
};

/**
 * ค้นหาจากพิกัดอิสระ เช่น "13.99, 101.71" (PLAN.md §4)
 */
export default function CoordinateSearchBox({
  onFound,
}: CoordinateSearchBoxProps) {
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    const match = text.trim().match(/^(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)$/);
    if (!match) {
      setError("รูปแบบไม่ถูกต้อง ใช้ lat, lng เช่น 13.99147, 101.71488");
      return;
    }
    const lat = Number(match[1]);
    const lng = Number(match[2]);
    if (
      lat < THAILAND_BOUNDS.minLat ||
      lat > THAILAND_BOUNDS.maxLat ||
      lng < THAILAND_BOUNDS.minLng ||
      lng > THAILAND_BOUNDS.maxLng
    ) {
      setError("พิกัดนี้อยู่นอกขอบเขตประเทศไทย");
      return;
    }
    onFound(lat, lng);
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="pointer-events-auto flex flex-col gap-1"
    >
      <div className="flex items-center gap-1 rounded-full bg-white px-3 py-2 shadow-lg">
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="ค้นหาจากพิกัด (เช่น 13.99147, 101.71488)"
          className="w-56 bg-transparent text-sm text-zinc-800 outline-none placeholder:text-zinc-400 sm:w-64"
        />
        <button
          type="submit"
          className="shrink-0 rounded-full bg-zinc-900 px-3 py-1 text-xs font-bold text-white"
        >
          ไป
        </button>
      </div>
      {error && (
        <p className="rounded-lg bg-white px-3 py-1 text-xs text-red-600 shadow">
          {error}
        </p>
      )}
    </form>
  );
}
