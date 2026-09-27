"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { User } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/client";

type Role = "anonymous" | "requester" | "rescue_unit";

/**
 * Header ทุกหน้า — โลโก้/ชื่อเว็บ + ปุ่ม login ด้วย Google
 *
 * หมายเหตุ: ป้าย role ที่แสดงผลตรงนี้ใช้แค่ตัดสินใจว่าจะ "แสดง" อะไรใน UI
 * เท่านั้น (เรียก RPC get_my_role() ตาม PLAN.md §5) — ไม่ใช่ด่านความปลอดภัยจริง
 * เพราะ RLS ฝั่งฐานข้อมูลตรวจซ้ำเสมอไม่ว่า UI จะแสดงอะไรไว้ก็ตาม
 */
export default function Header() {
  const [user, setUser] = useState<User | null>(null);
  const [role, setRole] = useState<Role>("anonymous");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const supabase = createClient();

    supabase.auth.getUser().then(({ data }) => {
      setUser(data.user ?? null);
      setLoading(false);
    });

    const { data: subscription } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        setUser(session?.user ?? null);
      }
    );

    return () => subscription.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    let active = true;
    async function loadRole() {
      if (!user) {
        if (active) setRole("anonymous");
        return;
      }
      const supabase = createClient();
      const { data, error } = await supabase.rpc("get_my_role");
      if (!active) return;
      if (!error && data) setRole(data as Role);
      else setRole("requester");
    }
    loadRole();
    return () => {
      active = false;
    };
  }, [user]);

  async function handleLogin() {
    const supabase = createClient();
    await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${window.location.origin}/auth/callback`,
      },
    });
  }

  async function handleLogout() {
    const supabase = createClient();
    await supabase.auth.signOut();
    setUser(null);
  }

  return (
    <header className="sticky top-0 z-30 flex items-center justify-between border-b border-zinc-200 bg-white/95 px-4 py-3 backdrop-blur sm:px-6">
      <Link href="/" className="flex items-center gap-2">
        <span className="text-xl" aria-hidden>
          📍
        </span>
        <span className="text-lg font-bold tracking-tight text-zinc-900">
          kabinburisu
        </span>
      </Link>

      <div className="flex items-center gap-3">
        {role === "rescue_unit" && (
          <span className="hidden rounded-full bg-blue-100 px-3 py-1 text-xs font-semibold text-blue-700 sm:inline">
            หน่วยกู้ภัย
          </span>
        )}
        {loading ? null : user ? (
          <button
            onClick={handleLogout}
            className="rounded-full border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-700 transition hover:bg-zinc-100"
          >
            ออกจากระบบ
          </button>
        ) : (
          <button
            onClick={handleLogin}
            className="rounded-full bg-red-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-red-700"
          >
            เข้าสู่ระบบด้วย Google
          </button>
        )}
      </div>
    </header>
  );
}
