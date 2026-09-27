"use client";

import { useState } from "react";

type GeocodeResult = {
  name: string;
  lat: number;
  lng: number;
};

type PlaceSearchBoxProps = {
  onSelect: (lat: number, lng: number) => void;
};

/**
 * ค้นหาจากชื่อสถานที่ — เรียก app/api/geocode/route.ts เท่านั้น ห้าม browser
 * เรียก MapTiler/Nominatim ตรงเด็ดขาด (PLAN.md §4)
 */
export default function PlaceSearchBox({ onSelect }: PlaceSearchBoxProps) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<GeocodeResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!query.trim()) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/geocode?q=${encodeURIComponent(query.trim())}`);
      const body = await res.json();
      if (!res.ok) {
        setError(body?.error ?? "ค้นหาไม่สำเร็จ");
        setResults([]);
        return;
      }
      setResults(body.results ?? []);
      if ((body.results ?? []).length === 0) {
        setError("ไม่พบสถานที่ที่ค้นหา");
      }
    } catch {
      setError("เชื่อมต่อไม่สำเร็จ");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="pointer-events-auto flex flex-col gap-1">
      <form
        onSubmit={handleSubmit}
        className="flex items-center gap-1 rounded-full bg-white px-3 py-2 shadow-lg"
      >
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="ค้นหาจากชื่อสถานที่ เช่น ตลาดกบินทร์บุรี"
          className="w-56 bg-transparent text-sm text-zinc-800 outline-none placeholder:text-zinc-400 sm:w-64"
        />
        <button
          type="submit"
          disabled={loading}
          className="shrink-0 rounded-full bg-zinc-900 px-3 py-1 text-xs font-bold text-white disabled:opacity-50"
        >
          {loading ? "..." : "ค้นหา"}
        </button>
      </form>
      {error && (
        <p className="rounded-lg bg-white px-3 py-1 text-xs text-red-600 shadow">
          {error}
        </p>
      )}
      {results.length > 0 && (
        <ul className="max-h-48 overflow-y-auto rounded-xl bg-white p-1 shadow-lg">
          {results.map((r, i) => (
            <li key={i}>
              <button
                type="button"
                onClick={() => {
                  onSelect(r.lat, r.lng);
                  setResults([]);
                  setQuery(r.name);
                }}
                className="w-full rounded-lg px-2 py-2 text-left text-sm text-zinc-700 hover:bg-zinc-100"
              >
                {r.name}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
