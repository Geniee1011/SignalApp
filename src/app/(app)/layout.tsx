"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuthStore } from "@/store/auth-store";
import { Shell } from "@/components/Shell";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const ready = useAuthStore((s) => s.ready);
  const token = useAuthStore((s) => s.token);
  const init = useAuthStore((s) => s.init);

  useEffect(() => { void init(); }, [init]);
  useEffect(() => { if (ready && !token) router.replace("/login"); }, [ready, token, router]);

  if (!ready) return <div className="flex min-h-screen items-center justify-center text-sm text-muted">Loading…</div>;
  if (!token) return null;
  return <Shell>{children}</Shell>;
}
