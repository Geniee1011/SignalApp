"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { api, MARKETS, type AccessConfig, type AdminUser, type Direction } from "@/lib/api";
import { getToken } from "@/store/auth-store";
import { useAuthStore } from "@/store/auth-store";
import { Card, Button } from "@/components/ui";
import { cn } from "@/lib/utils";

const CONVICTION_LABEL: Record<number, string> = { 1: "Any", 2: "2+ (medium)", 3: "3+ (high)", 4: "4 only (max)" };

export default function AdminPage() {
  const router = useRouter();
  const role = useAuthStore((s) => s.user?.role);
  const ready = useAuthStore((s) => s.ready);

  const [users, setUsers] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<AdminUser | null>(null);

  const refresh = useCallback(async () => {
    const token = getToken();
    if (!token) return;
    try {
      setUsers(await api.adminListUsers(token));
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);
  // Non-admins never see this page.
  useEffect(() => { if (ready && role && role !== "ADMIN") router.replace("/signals"); }, [ready, role, router]);

  if (ready && role && role !== "ADMIN") return null;

  const subscribers = users.filter((u) => u.role !== "ADMIN").length;

  return (
    <div>
      <div className="mb-4">
        <h1 className="text-xl font-semibold">Admin · Users</h1>
        <p className="text-sm text-muted">Manage subscribers and configure the signal access each one receives.</p>
      </div>

      <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
        <Mini label="Users" value={users.length} />
        <Mini label="Subscribers" value={subscribers} />
        <Mini label="Suspended" value={users.filter((u) => u.status === "SUSPENDED" || u.access.suspended).length} />
      </div>

      {error && <Card className="mb-4 border-short/40 p-3 text-sm text-short">{error}</Card>}

      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-[11px] uppercase tracking-wide text-muted">
                <Th>User</Th>
                <Th>Role</Th>
                <Th>Access</Th>
                <Th>Status</Th>
                <Th className="text-right">Actions</Th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id} className="border-b border-border/60 hover:bg-surface-2">
                  <Td>
                    <div className="font-medium text-foreground">{u.name || "—"}</div>
                    <div className="text-xs text-muted">{u.email}</div>
                  </Td>
                  <Td>
                    <span className={cn("rounded-md px-2 py-0.5 text-xs font-medium", u.role === "ADMIN" ? "bg-primary/15 text-primary" : "bg-surface-3 text-muted")}>
                      {u.role === "ADMIN" ? "Admin" : "Subscriber"}
                    </span>
                  </Td>
                  <Td><AccessSummary access={u.access} /></Td>
                  <Td>
                    <span className={cn("inline-flex items-center gap-1.5 text-xs", u.status === "SUSPENDED" ? "text-short" : "text-long")}>
                      <span className={cn("h-1.5 w-1.5 rounded-full", u.status === "SUSPENDED" ? "bg-short" : "bg-long")} />
                      {u.status === "SUSPENDED" ? "Suspended" : "Active"}
                    </span>
                  </Td>
                  <Td className="text-right">
                    <Button size="sm" variant="secondary" onClick={() => setEditing(u)}>Configure</Button>
                  </Td>
                </tr>
              ))}
              {users.length === 0 && (
                <tr><td colSpan={5} className="px-4 py-16 text-center text-sm text-muted">{loading ? "Loading…" : "No users yet."}</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>

      {editing && (
        <AccessEditor
          user={editing}
          onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); void refresh(); }}
        />
      )}
    </div>
  );
}

function Mini({ label, value }: { label: string; value: number }) {
  return (
    <Card className="p-3">
      <div className="text-xs text-muted">{label}</div>
      <div className="mt-0.5 text-xl font-semibold nums">{value}</div>
    </Card>
  );
}

function AccessSummary({ access }: { access: AccessConfig }) {
  if (access.suspended) return <span className="rounded-md bg-short/15 px-2 py-0.5 text-xs font-medium text-short">Feed off</span>;
  const chips: string[] = [];
  chips.push(access.markets.length ? access.markets.join(" · ") : "All markets");
  chips.push(access.direction === "BOTH" ? "Long & Short" : access.direction === "LONG" ? "Long only" : "Short only");
  chips.push(access.dailyLimit == null ? "Unlimited" : `${access.dailyLimit}/day`);
  if (access.minConviction > 1) chips.push(`Conv ${access.minConviction}+`);
  if (!access.live) chips.push("History only");
  return (
    <div className="flex flex-wrap gap-1">
      {chips.map((c, i) => (
        <span key={i} className="rounded-md bg-surface-3 px-1.5 py-0.5 text-[11px] text-muted">{c}</span>
      ))}
    </div>
  );
}

// --- Access editor modal ---------------------------------------------------

function AccessEditor({ user, onClose, onSaved }: { user: AdminUser; onClose: () => void; onSaved: () => void }) {
  const [access, setAccess] = useState<AccessConfig>(user.access);
  const [status, setStatus] = useState<"ACTIVE" | "SUSPENDED">(user.status);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const patch = (p: Partial<AccessConfig>) => setAccess((a) => ({ ...a, ...p }));
  const toggleMarket = (m: string) =>
    setAccess((a) => ({ ...a, markets: a.markets.includes(m) ? a.markets.filter((x) => x !== m) : [...a.markets, m] }));

  const save = async () => {
    const token = getToken();
    if (!token) return;
    setSaving(true); setErr(null);
    try {
      await api.adminUpdateUser(token, user.id, { access, status });
      onSaved();
    } catch (e) {
      setErr((e as Error).message);
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div className="max-h-[90vh] w-full max-w-lg overflow-auto rounded-[var(--radius-card)] border border-border bg-surface shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between border-b border-border px-5 py-4">
          <div>
            <div className="text-sm font-semibold text-foreground">Configure access</div>
            <div className="text-xs text-muted">{user.name ? `${user.name} · ` : ""}{user.email}</div>
          </div>
          <button onClick={onClose} className="text-muted hover:text-foreground">✕</button>
        </div>

        <div className="space-y-5 px-5 py-4">
          {/* Markets */}
          <Section title="Markets" hint={access.markets.length ? undefined : "None selected = all markets"}>
            <div className="flex flex-wrap gap-2">
              {MARKETS.map((m) => (
                <Chip key={m} active={access.markets.includes(m)} onClick={() => toggleMarket(m)}>{m}</Chip>
              ))}
              {access.markets.length > 0 && (
                <button onClick={() => patch({ markets: [] })} className="text-xs text-muted underline hover:text-foreground">clear (= all)</button>
              )}
            </div>
          </Section>

          {/* Direction */}
          <Section title="Direction">
            <Segmented<Direction>
              value={access.direction}
              options={[{ v: "BOTH", label: "Both" }, { v: "LONG", label: "Long only" }, { v: "SHORT", label: "Short only" }]}
              onChange={(v) => patch({ direction: v })}
            />
          </Section>

          {/* Daily limit */}
          <Section title="Signals per day" hint="Extra signals appear locked to the subscriber.">
            <div className="flex items-center gap-3">
              <Chip active={access.dailyLimit == null} onClick={() => patch({ dailyLimit: null })}>Unlimited</Chip>
              <input
                type="number"
                min={0}
                value={access.dailyLimit ?? ""}
                placeholder="e.g. 5"
                onChange={(e) => patch({ dailyLimit: e.target.value === "" ? null : Math.max(0, Math.floor(Number(e.target.value))) })}
                className="w-28 rounded-lg border border-border bg-surface-2 px-3 py-1.5 text-sm outline-none focus:border-primary"
              />
              <span className="text-xs text-muted">per day</span>
            </div>
          </Section>

          {/* Conviction floor */}
          <Section title="Conviction floor" hint="Only deliver signals at or above this conviction.">
            <select
              value={access.minConviction}
              onChange={(e) => patch({ minConviction: Number(e.target.value) })}
              className="w-full rounded-lg border border-border bg-surface-2 px-3 py-2 text-sm outline-none focus:border-primary"
            >
              {[1, 2, 3, 4].map((n) => <option key={n} value={n}>{CONVICTION_LABEL[n]}</option>)}
            </select>
          </Section>

          {/* Toggles */}
          <Section title="Live access">
            <ToggleRow
              label="Deliver live (active) signals"
              hint="Off = the subscriber sees only the closed track record."
              on={access.live}
              onChange={(v) => patch({ live: v })}
            />
            <ToggleRow
              label="Suspend signal feed"
              hint="Cuts all signals without deleting the account."
              on={access.suspended}
              danger
              onChange={(v) => patch({ suspended: v })}
            />
            <ToggleRow
              label="Suspend login"
              hint="Blocks the subscriber from signing in entirely."
              on={status === "SUSPENDED"}
              danger
              onChange={(v) => setStatus(v ? "SUSPENDED" : "ACTIVE")}
            />
          </Section>

          {err && <div className="text-sm text-short">{err}</div>}
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-border px-5 py-4">
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button onClick={save} loading={saving}>Save access</Button>
        </div>
      </div>
    </div>
  );
}

function Section({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="mb-2 flex items-baseline justify-between">
        <span className="text-sm font-medium text-foreground">{title}</span>
        {hint && <span className="text-[11px] text-muted-2">{hint}</span>}
      </div>
      <div className="space-y-2">{children}</div>
    </div>
  );
}

function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "rounded-lg border px-3 py-1.5 text-sm font-medium transition",
        active ? "border-primary bg-primary/15 text-primary" : "border-border bg-surface-2 text-muted hover:text-foreground",
      )}
    >
      {children}
    </button>
  );
}

function Segmented<T extends string>({ value, options, onChange }: { value: T; options: { v: T; label: string }[]; onChange: (v: T) => void }) {
  return (
    <div className="inline-flex rounded-lg border border-border bg-surface-2 p-0.5">
      {options.map((o) => (
        <button
          key={o.v}
          onClick={() => onChange(o.v)}
          className={cn("rounded-md px-3 py-1.5 text-sm font-medium transition", value === o.v ? "bg-primary text-white" : "text-muted hover:text-foreground")}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

function ToggleRow({ label, hint, on, onChange, danger }: { label: string; hint?: string; on: boolean; onChange: (v: boolean) => void; danger?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-lg border border-border bg-surface-2 px-3 py-2">
      <div>
        <div className="text-sm text-foreground">{label}</div>
        {hint && <div className="text-[11px] text-muted-2">{hint}</div>}
      </div>
      <button
        onClick={() => onChange(!on)}
        className={cn("relative h-5 w-9 shrink-0 rounded-full transition", on ? (danger ? "bg-short" : "bg-primary") : "bg-surface-3")}
        aria-pressed={on}
      >
        <span className={cn("absolute top-0.5 h-4 w-4 rounded-full bg-white transition-all", on ? "left-[18px]" : "left-0.5")} />
      </button>
    </div>
  );
}

function Th({ children, className }: { children: React.ReactNode; className?: string }) {
  return <th className={cn("px-4 py-2.5 font-medium", className)}>{children}</th>;
}
function Td({ children, className }: { children: React.ReactNode; className?: string }) {
  return <td className={cn("px-4 py-3", className)}>{children}</td>;
}
