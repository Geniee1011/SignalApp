"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useAuthStore } from "@/store/auth-store";
import { Button, Card, Field } from "@/components/ui";
import { ThemeToggle } from "@/components/ThemeToggle";

export default function RegisterPage() {
  const router = useRouter();
  const register = useAuthStore((s) => s.register);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await register(email, password, name);
      router.push("/signals");
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <div className="absolute right-4 top-4"><ThemeToggle /></div>
      <Card className="w-full max-w-sm p-6">
        <div className="mb-1 text-lg font-semibold">◆ Create your account</div>
        <p className="mb-6 text-sm text-muted">Get access to live counter-trading signals.</p>
        <form onSubmit={submit} className="space-y-3">
          <Field label="Name" type="text" value={name} onChange={setName} placeholder="Your name" />
          <Field label="Email" type="email" value={email} onChange={setEmail} placeholder="you@example.com" />
          <Field label="Password" type="password" value={password} onChange={setPassword} placeholder="At least 6 characters" />
          {error && <div className="rounded-lg border border-short/40 bg-short/10 px-3 py-2 text-xs text-short">{error}</div>}
          <Button type="submit" loading={busy} className="w-full">Create account</Button>
        </form>
        <p className="mt-4 text-center text-sm text-muted">
          Already have an account? <Link href="/login" className="text-primary hover:underline">Sign in</Link>
        </p>
      </Card>
    </div>
  );
}
